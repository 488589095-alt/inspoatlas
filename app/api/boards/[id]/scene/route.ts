import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { boardSceneSchema } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../../_lib";

const saveSchema = z.object({ baseVersion: z.number().int().positive(), scene: boardSceneSchema });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const input = saveSchema.parse(await request.json());
    await ensureCoreTables(); const db = getDb();
    const [board] = await db.select({ version: boards.version }).from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    if (board.version !== input.baseVersion) return Response.json({ error: "画布版本已变化", currentVersion: board.version }, { status: 409 });
    const version = board.version + 1; const updatedAt = new Date().toISOString();
    await db.update(boards).set({ scene: input.scene, version, updatedAt }).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)));
    return Response.json({ saved: true, version, updatedAt });
  } catch (error) { return errorResponse(error); }
}
