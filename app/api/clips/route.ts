import { clipPayloadSchema } from "@/packages/domain/src";
import { assets, boards, profiles } from "@/db/schema";
import { ensureCoreTables, getDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { currentUser, errorResponse, newId } from "../_lib";
import { decodeDataUrl, getAssetBucket } from "../_storage";

export async function GET(request: Request) {
  const user = currentUser(request);
  try {
    await ensureCoreTables();
    const boardId = new URL(request.url).searchParams.get("boardId");
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
      .where(boardId ? and(eq(assets.ownerId, user.id), eq(assets.boardId, boardId)) : eq(assets.ownerId, user.id))
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
    const db = getDb();
    await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
    let boardId = clip.boardId;
    if (boardId) {
      const [target] = await db.select({ id: boards.id }).from(boards).where(and(eq(boards.id, boardId), eq(boards.ownerId, user.id))).limit(1);
      if (!target) throw new Error("目标画布不存在");
    } else {
      const [recent] = await db.select({ id: boards.id }).from(boards).where(eq(boards.ownerId, user.id)).orderBy(desc(boards.updatedAt)).limit(1);
      boardId = recent?.id;
    }
    if (!boardId) {
      boardId = newId("board");
      await db.insert(boards).values({ id: boardId, ownerId: user.id, title: "网页采集", scene: { schemaVersion: 2, nodes: [], relations: [] } });
    }
    const screenshotKeys: string[] = [];
    for (const part of clip.screenshotParts) {
      const decoded = decodeDataUrl(part.dataUrl);
      const objectKey = "assets/" + user.id + "/" + assetId + "/capture-" + part.index + ".jpg";
      await getAssetBucket().put(objectKey, decoded.bytes, { httpMetadata: { contentType: decoded.contentType }, customMetadata: { ownerId: user.id, assetId } });
      screenshotKeys.push(objectKey);
    }
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
        screenshotKeys,
        viewportCaptures: clip.screenshotParts.length,
        capturedAt: new Date().toISOString(),
        captureSource: "browser-extension",
      },
    });
    return Response.json({ asset: { id: assetId, boardId, kind: "web", title: clip.title, sourceUrl: clip.url, contentUrl: screenshotKeys.length ? "/api/assets/" + assetId + "/content" : null }, queued: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

