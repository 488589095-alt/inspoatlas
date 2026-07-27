import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { analysisResultSchema } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../../../_lib";
import { buildContract } from "../_build";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const input = z.object({ assetIds: z.array(z.string()).max(100).optional() }).parse(await request.json().catch(() => ({}))); await ensureCoreTables(); const db = getDb();
    const [board] = await db.select().from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    const sourceAssets = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.boardId, id), eq(assets.ownerId, user.id)));
    if (!sourceAssets.length) throw new HttpError(409, "请先导入并分析素材");
    const rows = await db.select().from(analyses).where(and(eq(analyses.ownerId, user.id), inArray(analyses.assetId, sourceAssets.map((item) => item.id))));
    const ready = rows.flatMap((row) => {
      const parsed = analysisResultSchema.safeParse(row.result); return parsed.success ? [{ assetId: row.assetId, result: parsed.data }] : [];
    });
    if (!ready.length) throw new HttpError(409, "至少拆解一张参考后才能生成设计方案");
    return Response.json({ contract: buildContract(board.title, ready) });
  } catch (error) { return errorResponse(error); }
}
