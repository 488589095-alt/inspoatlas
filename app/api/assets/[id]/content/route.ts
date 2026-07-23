import { and, eq } from "drizzle-orm";
import { ensureCoreTables, getDb } from "@/db";
import { assets, confirmedElements } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../../../_lib";
import { getAssetBucket } from "../../../_storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request); const { id } = await context.params; await ensureCoreTables();
    const [asset] = await getDb().select({ objectKey: assets.objectKey, metadata: assets.metadata }).from(assets).where(and(eq(assets.id, id), eq(assets.ownerId, user.id))).limit(1);
    const [element] = asset ? [] : await getDb().select({ objectKey: confirmedElements.objectKey }).from(confirmedElements).where(and(eq(confirmedElements.id, id), eq(confirmedElements.ownerId, user.id))).limit(1);
    const screenshotKeys = (asset?.metadata as { screenshotKeys?: string[] } | null)?.screenshotKeys;
    const objectKey = asset?.objectKey ?? screenshotKeys?.[0] ?? element?.objectKey;
    if (!objectKey) throw new HttpError(404, "素材文件不存在");
    const object = await getAssetBucket().get(objectKey);
    if (!object) throw new HttpError(404, "素材文件不存在");
    const headers = new Headers({ "cache-control": "private, max-age=3600" }); object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
}
