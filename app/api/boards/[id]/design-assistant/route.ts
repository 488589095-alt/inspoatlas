import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateTextWithProvider, researchWithQwen, type TextMessage } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, boards, events } from "@/db/schema";
import { loadCredential } from "../../../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";
import { parseAssistantTurn } from "@/app/workspace/assistantConversation";

export const DESIGN_ASSISTANT_PROMPT_VERSION = "chat-v4";

const inputSchema = z.object({
  goal: z.string().trim().max(2_000).optional(),
  provider: z.enum(providerIds).optional(),
  question: z.string().trim().min(1).max(2_000),
  scope: z.enum(["selection", "board"]).default("board"),
  selectedNodeIds: z.array(z.string()).max(100).default([]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) })).max(8).default([]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: boardId } = await context.params;
    const input = inputSchema.parse(await request.json());
    await ensureCoreTables();
    const db = getDb();
    const [board] = await db.select().from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.ownerId, user.id)))
      .limit(1);
    if (!board) throw new HttpError(404, "画布不存在");

    const credential = await loadCredential(user.id, input.provider, false);
    if (!credential) throw new HttpError(503, "工作区 AI 服务暂不可用，请稍后重试");
    const searchCandidates = credential.provider === "qwen" && /(?:找|推荐|搜索|搜|参考).{0,12}(?:网站|网页|站点|案例)|(?:网站|网页|站点).{0,12}(?:参考|推荐|案例)/.test(input.question)
      ? await researchWithQwen({ brief: input.question.slice(0, 1_200), limit: 8 }, credential).catch(() => [])
      : [];
    const sources = searchCandidates.slice(0, 3).map(({ title, url, reason }) => ({ title, url, reason }));

    const assetRows = await db.select().from(assets)
      .where(and(eq(assets.boardId, boardId), eq(assets.ownerId, user.id)));
    const analysisRows = await db.select({ assetId: analyses.assetId, result: analyses.result })
      .from(analyses)
      .innerJoin(assets, eq(analyses.assetId, assets.id))
      .where(and(eq(assets.boardId, boardId), eq(assets.ownerId, user.id), eq(analyses.ownerId, user.id)));
    const assetById = new Map(assetRows.map((item) => [item.id, item]));
    const analysisByAsset = new Map(analysisRows.map((item) => [item.assetId, asRecord(item.result)]));
    const selected = new Set(input.selectedNodeIds);
    const scene = asRecord(board.scene);
    const sceneNodes = Array.isArray(scene.nodes) ? scene.nodes.map(asRecord) : [];
    const scopedNodes = sceneNodes.filter((node) => input.scope === "board" || selected.has(String(node.id ?? ""))).slice(0, 60);
    const references = scopedNodes.map((node, index) => {
      const data = asRecord(node.data);
      const assetId = String(data.assetId ?? node.id ?? "");
      const asset = assetById.get(assetId);
      const analysis = analysisByAsset.get(assetId) ?? {};
      const title = String(data.title ?? asset?.title ?? `参考 ${index + 1}`).slice(0, 200);
      const body = String(data.body ?? asset?.extractedText ?? "").replace(/\s+/g, " ").slice(0, 1_200);
      const tags = textArray(data.tags).slice(0, 12).join("、");
      const colors = textArray(data.colors).slice(0, 10).join("、");
      const principles = textArray(data.principles).slice(0, 8).join("；");
      const summary = String(data.analysisSummary ?? analysis.summary ?? "").slice(0, 1_000);
      return [
        `[卡片 ${String(node.id ?? assetId)}] ${title}`,
        `类型：${String(data.kind ?? asset?.kind ?? "参考")}`,
        body ? `内容：${body}` : "",
        summary ? `已有拆解：${summary}` : "",
        tags ? `标签：${tags}` : "",
        colors ? `颜色：${colors}` : "",
        principles ? `设计要点：${principles}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const prompt = [
      "你是设计助手小in，和用户进行自然的一对一对话。帮助用户澄清需求、寻找网站或视觉方向、比较参考、整理灵感并确定可执行的下一步。直接回答当前问题，不强制套用固定的设计流程。",
      "用自然、具体的中文回答。需求不清时先给一个可行方向，再问最多两个关键问题。回答尽量控制在 600 字内。",
      "画布参考仅是可用的上下文。引用具体卡片时用【卡片标题】标注依据；不要声称看过没有提供的页面、图片或搜索结果。若没有画布参考，也要基于用户描述正常交流，并明确哪些细节需要用户补充。不要编造网址或实时搜索结果。",
      sources.length ? `已验证的公开网站候选（只能使用这些链接，不要编造其他网址）：\n${sources.map((source) => `${source.title}：${source.url}。适配理由：${source.reason}`).join("\n")}` : "当前没有已验证的公开网站候选。如果用户想找参考网站，先给搜索思路，不要虚构具体链接。",
      "只返回一个 JSON 对象，不要 Markdown 代码围栏。格式：{\"answer\":\"给用户的直接回答\",\"followUps\":[\"用户可能会问的第一人称问题\",\"第二个问题\",\"第三个问题\"]}。followUps 给 2 到 3 个自然且与本次回答相关的问题，写成用户可以直接点击发送的口吻，不重复原问题。",
      input.goal ? `补充目标：${input.goal}` : "",
      `参考范围：${input.scope === "selection" ? "当前选择" : "整张画布"}`,
      scopedNodes.length ? `参考卡片：\n${references}` : "当前画布没有可引用的参考卡片。",
      `用户问题：${input.question}`,
    ].filter(Boolean).join("\n\n");
    const messages: TextMessage[] = [
      ...input.history.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: prompt },
    ];
    const startedAt = Date.now();
    const { answer, followUps } = parseAssistantTurn(await generateTextWithProvider(messages, credential));
    const responseId = newId("assistant-turn");
    await db.insert(events).values({
      id: newId("event"),
      ownerId: user.id,
      name: "ai.assistant.completed",
      payload: {
        responseId,
        boardId,
        provider: credential.provider,
        model: credential.model,
        promptVersion: DESIGN_ASSISTANT_PROMPT_VERSION,
        runMode: credential.runMode,
        scope: input.scope,
        selectedCount: input.selectedNodeIds.length,
        referenceCount: scopedNodes.length,
        historyCount: input.history.length,
        responseCharacters: answer.length,
        followUpCount: followUps.length,
        sourceCount: sources.length,
        latencyMs: Date.now() - startedAt,
      },
      createdAt: new Date().toISOString(),
    });
    return Response.json({
      id: responseId,
      answer,
      followUps,
      sources,
      provider: credential.provider,
      model: credential.model,
      promptVersion: DESIGN_ASSISTANT_PROMPT_VERSION,
      runMode: credential.runMode,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
