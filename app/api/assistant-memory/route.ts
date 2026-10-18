import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureCoreTables, getDb } from "@/db";
import { assistantMemories } from "@/db/schema";
import { currentUser, errorResponse } from "../_lib";

const memorySchema = z.object({
  userRole: z.string().trim().max(300),
  preferences: z.string().trim().max(800),
  avoid: z.string().trim().max(500),
});

export async function GET(request: Request) {
  try {
    const user = currentUser(request);
    await ensureCoreTables();
    const [memory] = await getDb().select().from(assistantMemories).where(eq(assistantMemories.ownerId, user.id)).limit(1);
    return Response.json({ memory: memory ?? { userRole: "", preferences: "", avoid: "" } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const user = currentUser(request);
    const input = memorySchema.parse(await request.json());
    await ensureCoreTables();
    const [memory] = await getDb().insert(assistantMemories).values({ ownerId: user.id, ...input, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: assistantMemories.ownerId, set: { ...input, updatedAt: new Date().toISOString() } }).returning();
    return Response.json({ memory }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
