import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureCoreTables, getDb } from "@/db";
import { assistantConversations } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../../../_lib";
import { conversationMessagesSchema } from "../_schema";

const saveSchema = z.object({ version: z.number().int().positive(), messages: conversationMessagesSchema });

type ConversationContext = { params: Promise<{ id: string; conversationId: string }> };

export async function GET(request: Request, context: ConversationContext) {
  try {
    const user = currentUser(request);
    const { id: boardId, conversationId } = await context.params;
    await ensureCoreTables();
    const [conversation] = await getDb().select().from(assistantConversations)
      .where(and(eq(assistantConversations.id, conversationId), eq(assistantConversations.boardId, boardId), eq(assistantConversations.ownerId, user.id)))
      .limit(1);
    if (!conversation) throw new HttpError(404, "对话不存在");
    return Response.json({ conversation }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, context: ConversationContext) {
  try {
    const user = currentUser(request);
    const { id: boardId, conversationId } = await context.params;
    const input = saveSchema.parse(await request.json());
    await ensureCoreTables();
    const now = new Date().toISOString();
    const [conversation] = await getDb().update(assistantConversations).set({
      messages: input.messages,
      version: input.version + 1,
      updatedAt: now,
    }).where(and(
      eq(assistantConversations.id, conversationId),
      eq(assistantConversations.boardId, boardId),
      eq(assistantConversations.ownerId, user.id),
      eq(assistantConversations.version, input.version),
    )).returning();
    if (!conversation) throw new HttpError(409, "这段对话已在其他页面更新，请重新打开后继续");
    return Response.json({ conversation }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
