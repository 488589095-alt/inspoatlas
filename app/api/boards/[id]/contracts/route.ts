import { and, eq } from "drizzle-orm";
import { designContractSchema } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards, designContracts } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; await ensureCoreTables();
    const [contract] = await getDb().select().from(designContracts).where(and(eq(designContracts.boardId, id), eq(designContracts.ownerId, user.id))).limit(1);
    return Response.json({ contract: contract ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; const content = designContractSchema.parse((await request.json()).contract);
    await ensureCoreTables(); const db = getDb();
    const [board] = await db.select({ id: boards.id }).from(boards).where(and(eq(boards.id, id), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    const [existing] = await db.select().from(designContracts).where(eq(designContracts.boardId, id)).limit(1); const now = new Date().toISOString();
    await db.insert(designContracts).values({ id: existing?.id ?? newId("contract"), ownerId: user.id, boardId: id, version: (existing?.version ?? 0) + 1, status: "confirmed", content, updatedAt: now, createdAt: existing?.createdAt ?? now })
      .onConflictDoUpdate({ target: designContracts.boardId, set: { content, status: "confirmed", version: (existing?.version ?? 0) + 1, updatedAt: now } });
    return Response.json({ contract: { content, status: "confirmed", version: (existing?.version ?? 0) + 1 } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
