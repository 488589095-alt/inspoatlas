import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { migrateBoardScene } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../../../../_lib";

const schema = z.object({ selectedIds: z.array(z.string()).max(500).optional(), lockedIds: z.array(z.string()).max(500).default([]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const input = schema.parse(await request.json().catch(() => ({})));
    await ensureCoreTables(); const [board] = await getDb().select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    const scene = migrateBoardScene(board.scene); const locked = new Set(input.lockedIds);
    const included = input.selectedIds?.length ? new Set(input.selectedIds) : null;
    const roots = scene.nodes.filter((node) => !node.parentId && node.kind !== "group" && (!included || included.has(node.id)));
    const positions: Record<string, { x: number; y: number; parentId?: string }> = {};
    let y = 80;
    for (const source of roots.filter((node) => node.kind !== "analysis")) {
      if (!locked.has(source.id)) positions[source.id] = { x: 80, y };
      const companion = roots.find((node) => node.kind === "analysis" && node.data.sourceAssetId === (source.data.assetId || source.id));
      if (companion && !locked.has(companion.id)) positions[companion.id] = { x: 80 + source.width + 44, y };
      y += Math.max(source.height, companion?.height ?? 0) + 72;
    }
    return Response.json({ proposal: { id: newId("proposal"), boardId: id, baseVersion: board.version, groups: scene.nodes.filter((node) => node.kind === "group").map((node) => ({ id: node.id, title: String(node.data.title), memberIds: scene.nodes.filter((item) => item.parentId === node.id).map((item) => item.id) })), positions, suggestedRelations: [], lockedIds: [...locked] } });
  } catch (error) { return errorResponse(error); }
}
