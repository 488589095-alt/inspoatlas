import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { migrateBoardScene } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, boards, designContracts, relations, shareLinks } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../_lib";

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params;
    await ensureCoreTables();
    const [board] = await getDb().select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    return Response.json({ board: { ...board, scene: migrateBoardScene(board.scene) } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const input = renameSchema.parse(await request.json());
    await ensureCoreTables();
    const result = await getDb().update(boards).set({ title: input.title, updatedAt: new Date().toISOString() }).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).returning({ id: boards.id, title: boards.title });
    if (!result.length) throw new HttpError(404, "画布不存在");
    return Response.json({ board: result[0] });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params;
    await ensureCoreTables(); const db = getDb();
    const [board] = await db.select({ id: boards.id }).from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    await db.delete(relations).where(eq(relations.boardId, id));
    await db.delete(designContracts).where(eq(designContracts.boardId, id));
    await db.delete(shareLinks).where(eq(shareLinks.boardId, id));
    await db.delete(assets).where(and(eq(assets.boardId, id), eq(assets.ownerId, user.id)));
    await db.delete(boards).where(eq(boards.id, id));
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
