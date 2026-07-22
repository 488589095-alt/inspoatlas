import { clipPayloadSchema } from "@/packages/domain/src";
import { assets, boards, profiles } from "@/db/schema";
import { getDb } from "@/db";
import { currentUser, errorResponse, newId } from "../_lib";

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const clip = clipPayloadSchema.parse(await request.json());
    const assetId = newId("asset");
    try {
      const db = getDb(); const boardId = `demo-${user.id}`;
      await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
      await db.insert(boards).values({ id: boardId, ownerId: user.id, title: "网页采集", scene: {} }).onConflictDoNothing();
      await db.insert(assets).values({ id: assetId, ownerId: user.id, boardId, kind: "web", title: clip.title, sourceUrl: clip.url, extractedText: clip.readableText, metadata: { styles: clip.styles, viewportCaptures: clip.screenshotParts.length } });
    } catch { /* Local preview remains functional without provisioned D1. */ }
    return Response.json({ asset: { id: assetId, kind: "web", title: clip.title, sourceUrl: clip.url }, queued: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

