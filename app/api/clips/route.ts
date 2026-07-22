import { clipPayloadSchema } from "@/packages/domain/src";
import { assets, boards, profiles } from "@/db/schema";
import { ensureCoreTables, getDb } from "@/db";
import { desc, eq } from "drizzle-orm";
import { currentUser, errorResponse, newId } from "../_lib";

export async function GET(request: Request) {
  const user = currentUser(request);
  try {
    await ensureCoreTables();
    const rows = await getDb()
      .select({
        id: assets.id,
        kind: assets.kind,
        title: assets.title,
        sourceUrl: assets.sourceUrl,
        extractedText: assets.extractedText,
        metadata: assets.metadata,
        status: assets.status,
        createdAt: assets.createdAt,
      })
      .from(assets)
      .where(eq(assets.ownerId, user.id))
      .orderBy(desc(assets.createdAt))
      .limit(100);

    const browserClips = rows.filter((row) => {
      const metadata = row.metadata as { captureSource?: string; viewportCaptures?: number } | null;
      return metadata?.captureSource === "browser-extension" || typeof metadata?.viewportCaptures === "number";
    });

    return Response.json({ assets: browserClips }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "采集收件箱暂不可用" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const clip = clipPayloadSchema.parse(await request.json());
    const assetId = newId("asset");
    await ensureCoreTables();
    const db = getDb(); const boardId = `demo-${user.id}`;
    await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
    await db.insert(boards).values({ id: boardId, ownerId: user.id, title: "网页采集", scene: {} }).onConflictDoNothing();
    await db.insert(assets).values({
      id: assetId,
      ownerId: user.id,
      boardId,
      kind: "web",
      title: clip.title,
      sourceUrl: clip.url,
      extractedText: clip.readableText,
      status: "queued",
      metadata: {
        styles: clip.styles,
        viewportCaptures: clip.screenshotParts.length,
        capturedAt: new Date().toISOString(),
        captureSource: "browser-extension",
      },
    });
    return Response.json({ asset: { id: assetId, kind: "web", title: clip.title, sourceUrl: clip.url }, queued: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

