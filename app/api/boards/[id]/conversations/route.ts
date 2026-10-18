import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureCoreTables, getDb } from "@/db";
import { assistantConversations, boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";
import { conversationTitle } from "./_schema";

const createSchema = z.object({
  message: z.object({ id: z.string().max(100), content: z.string().trim().min(1).max(2_000) }),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: boardId } = await context.params;
    await ensureCoreTables();
    const db = getDb();
    const [board] = await db.select({ id: boards.id }).from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "作品不存在");
    const conversations = await db.select({
      id: assistantConversations.id,
      title: assistantConversations.title,
      createdAt: assistantConversations.createdAt,
      updatedAt: assistantConversations.updatedAt,
    }).from(assistantConversations)
      .where(and(eq(assistantConversations.boardId, boardId), eq(assistantConversations.ownerId, user.id)))
      .orderBy(desc(assistantConversations.updatedAt));
    return Response.json({ conversations }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: boardId } = await context.params;
    const input = createSchema.parse(await request.json());
    await ensureCoreTables();
    const db = getDb();
    const [board] = await db.select({ id: boards.id }).from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "作品不存在");
    const now = new Date().toISOString();
    const conversation = {
      id: newId("conversation"), ownerId: user.id, boardId,
      title: conversationTitle(input.message.content),
      messages: [{ id: input.message.id, role: "user", content: input.message.content }],
      version: 1, createdAt: now, updatedAt: now,
    };
    await db.insert(assistantConversations).values(conversation);
    return Response.json({ conversation }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
