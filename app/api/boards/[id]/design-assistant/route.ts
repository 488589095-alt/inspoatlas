import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateTextWithProvider, type TextMessage } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, boards, events } from "@/db/schema";
import { loadCredential } from "../../../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";

export const DESIGN_ASSISTANT_PROMPT_VERSION = "assistant-v2";

const inputSchema = z.object({
  goal: z.string().trim().min(2).max(2_000),
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
    if (!credential) throw new HttpError(409, "请先添加一个可用的模型服务");

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
    if (!scopedNodes.length) throw new HttpError(400, input.scope === "selection" ? "所选内容里没有可分析的卡片" : "画布里还没有参考内容");

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
      "你是面向专业设计师的设计策略助手。必须先理解设计目标，再基于提供的参考卡片给出可执行思路。",
      "只使用卡片中真实存在的信息；每个关键判断都用【卡片标题】标注依据。不要虚构图片细节或来源。",
      "如果目标过于模糊，先提出最多 3 个关键澄清问题；否则按‘方向判断、落地建议、需要取舍、下一步’组织回答。",
      `设计目标：${input.goal}`,
      `分析范围：${input.scope === "selection" ? "当前选择" : "整张画布"}`,
      `参考卡片：\n${references}`,
      `用户问题：${input.question}`,
    ].join("\n\n");
    const messages: TextMessage[] = [
      ...input.history.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: prompt },
    ];
    const startedAt = Date.now();
    const answer = await generateTextWithProvider(messages, credential);
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
        latencyMs: Date.now() - startedAt,
      },
      createdAt: new Date().toISOString(),
    });
    return Response.json({
      id: responseId,
      answer,
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
