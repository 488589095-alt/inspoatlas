import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boards, profiles } from "@/db/schema";
import { currentUser } from "../../_lib";

export async function GET(request: Request) {
  const user = currentUser(request);
  try {
    const [board] = await getDb().select().from(boards).where(eq(boards.id, `demo-${user.id}`)).limit(1);
    return Response.json({ board: board ?? null });
  } catch { return Response.json({ board: null, mode: "local-demo" }); }
}

export async function PUT(request: Request) {
  const user = currentUser(request); const scene = await request.json() as Record<string, unknown>;
  try {
    const db = getDb();
    await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
    await db.insert(boards).values({ id: `demo-${user.id}`, ownerId: user.id, title: "水润产品视觉", scene }).onConflictDoUpdate({ target: boards.id, set: { scene, updatedAt: new Date().toISOString() } });
    return Response.json({ saved: true });
  } catch { return Response.json({ saved: true, mode: "local-demo" }); }
}

