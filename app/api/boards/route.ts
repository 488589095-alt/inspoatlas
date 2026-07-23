import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { EMPTY_SCENE, migrateBoardScene } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { boards, profiles } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).default("未命名画布"),
  sourceBoardId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = currentUser(request);
    await ensureCoreTables();
    const rows = await getDb().select({
      id: boards.id, title: boards.title, version: boards.version,
      updatedAt: boards.updatedAt, createdAt: boards.createdAt,
    }).from(boards).where(eq(boards.ownerId, user.id)).orderBy(desc(boards.updatedAt));
    return Response.json({ boards: rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = currentUser(request);
    const input = createSchema.parse(await request.json().catch(() => ({})));
    await ensureCoreTables();
    const db = getDb();
    await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
    let scene = structuredClone(EMPTY_SCENE);
    if (input.sourceBoardId) {
      const [source] = await db.select().from(boards).where(eq(boards.id, input.sourceBoardId)).limit(1);
      if (!source || source.ownerId !== user.id) throw new HttpError(404, "找不到要复制的画布");
      scene = migrateBoardScene(source.scene);
    }
    const id = newId("board");
    const now = new Date().toISOString();
    await db.insert(boards).values({ id, ownerId: user.id, title: input.title, scene, version: 1, updatedAt: now, createdAt: now });
    return Response.json({ board: { id, title: input.title, version: 1, scene, updatedAt: now } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
