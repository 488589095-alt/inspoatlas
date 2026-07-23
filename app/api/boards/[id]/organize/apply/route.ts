import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { migrateBoardScene } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../../../_lib";

const schema = z.object({
  baseVersion: z.number().int().positive(),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number(), parentId: z.string().optional() })),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const input = schema.parse(await request.json());
    await ensureCoreTables(); const db = getDb();
    const [board] = await db.select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    if (board.version !== input.baseVersion) return Response.json({ error: "画布已发生变化，请重新生成整理预览", currentVersion: board.version }, { status: 409 });
    const scene = migrateBoardScene(board.scene);
    scene.nodes = scene.nodes.map((node) => input.positions[node.id] ? { ...node, position: { x: input.positions[node.id].x, y: input.positions[node.id].y }, parentId: input.positions[node.id].parentId ?? node.parentId } : node);
    const version = board.version + 1; const updatedAt = new Date().toISOString();
    await db.update(boards).set({ scene, version, updatedAt }).where(and(eq(boards.id, id), eq(boards.ownerId, user.id)));
    return Response.json({ applied: true, version, scene, undoable: true });
  } catch (error) { return errorResponse(error); }
}
