import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, boards, events } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";

const schema = z.object({
  feature: z.enum(["analysis", "design-assistant"]),
  boardId: z.string().min(1),
  targetId: z.string().min(1),
  rating: z.enum(["helpful", "needs-work"]),
  reason: z.enum(["inaccurate", "not-grounded", "not-actionable", "wrong-format", "other"]).optional(),
  provider: z.string().max(80).optional(),
  model: z.string().max(160).optional(),
  promptVersion: z.string().max(80).optional(),
  runMode: z.enum(["managed", "byok"]).optional(),
});

export async function POST(request: Request) {
  try {
    const user = currentUser(request);
    const input = schema.parse(await request.json());
    await ensureCoreTables();
    const db = getDb();

    if (input.feature === "analysis") {
      const [owned] = await db.select({ id: analyses.id })
        .from(analyses)
        .innerJoin(assets, eq(analyses.assetId, assets.id))
        .where(and(
          eq(analyses.id, input.targetId),
          eq(analyses.ownerId, user.id),
          eq(assets.ownerId, user.id),
          eq(assets.boardId, input.boardId),
        ))
        .limit(1);
      if (!owned) throw new HttpError(404, "拆解结果不存在");
    } else {
      const [owned] = await db.select({ id: boards.id }).from(boards)
        .where(and(eq(boards.id, input.boardId), eq(boards.ownerId, user.id)))
        .limit(1);
      if (!owned) throw new HttpError(404, "画布不存在");
    }

    await db.insert(events).values({
      id: newId("event"),
      ownerId: user.id,
      name: "ai.feedback",
      payload: input,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}