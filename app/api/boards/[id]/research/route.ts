import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { RESEARCH_PROMPT_VERSION, researchWithQwen } from "@/packages/ai/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards, events } from "@/db/schema";
import { loadCredential } from "../../../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";

const inputSchema = z.object({ brief: z.string().trim().min(4).max(1_200), limit: z.number().int().min(8).max(12).default(10) });

/** Search results deliberately do not touch the board or asset tables. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: boardId } = await context.params;
    const input = inputSchema.parse(await request.json());
    await ensureCoreTables();
    const [board] = await getDb().select({ id: boards.id }).from(boards).where(and(eq(boards.id, boardId), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    const credential = await loadCredential(user.id, "qwen", false);
    if (!credential) throw new HttpError(503, "工作区 AI 服务暂不可用，请稍后重试");
    const startedAt = Date.now();
    const candidates = await researchWithQwen(input, credential);
    await getDb().insert(events).values({
      id: newId("event"), ownerId: user.id, name: "ai.research.completed",
      payload: { boardId, provider: credential.provider, model: credential.model, promptVersion: RESEARCH_PROMPT_VERSION, runMode: credential.runMode, resultCount: candidates.length, latencyMs: Date.now() - startedAt },
      createdAt: new Date().toISOString(),
    });
    return Response.json({ candidates, provider: credential.provider, model: credential.model, promptVersion: RESEARCH_PROMPT_VERSION }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
