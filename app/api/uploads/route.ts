import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { MAX_ASSETS_PER_USER, MAX_IMAGE_BYTES, MAX_MEDIA_BYTES } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, boards } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";
import { supportedMedia } from "../_media";

const prepareSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("asset"), boardId: z.string().min(1), contentType: z.string(), size: z.number().int().positive() }),
  z.object({ scope: z.literal("derivative"), sourceAssetId: z.string().min(1), contentType: z.literal("image/png"), size: z.number().int().positive() }),
]);
const tokenPayload = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("asset"), boardId: z.string().min(1) }),
  z.object({ scope: z.literal("derivative"), sourceAssetId: z.string().min(1) }),
]);

async function assertAssetLimit(ownerId: string) {
  const [usage] = await getDb().select({ value: count() }).from(assets).where(eq(assets.ownerId, ownerId));
  if ((usage?.value ?? 0) >= MAX_ASSETS_PER_USER) throw new HttpError(409, "素材数量已达到 500 个上限");
}
export async function POST(request: Request) {
  try {
    if (!process.env.VERCEL) throw new HttpError(404, "仅在独立部署中使用");
    const body = await request.json();
    if (body?.type === "blob.generate-client-token" || body?.type === "blob.upload-completed") {
      return handleTokenRequest(request, body as HandleUploadBody);
    }
    const user = currentUser(request);
    await ensureCoreTables();
    const input = prepareSchema.parse(body);
    const db = getDb();
    if (input.scope === "asset") {
      const media = supportedMedia(input.contentType);
      if (!media || input.size > (media.kind === "image" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES)) {
        throw new HttpError(400, "仅支持图片、MP4/WebM 视频或常见音频；图片最大 20 MB，音视频最大 100 MB");
      }
      await assertAssetLimit(user.id);
      const [board] = await db.select({ id: boards.id }).from(boards).where(and(eq(boards.id, input.boardId), eq(boards.ownerId, user.id))).limit(1);
      if (!board) throw new HttpError(404, "画布不存在");
      const id = newId("asset");
      return Response.json({ id, pathname: `assets/${user.id}/${id}/original.${media.extension}`, clientPayload: JSON.stringify({ scope: "asset", boardId: input.boardId }) });
    }
    if (input.size > MAX_IMAGE_BYTES) throw new HttpError(400, "仅支持 20 MB 内的 PNG 图层");
    const [source] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, input.sourceAssetId), eq(assets.ownerId, user.id))).limit(1);
    if (!source) throw new HttpError(404, "原始素材不存在");
    const id = newId("derivative");
    return Response.json({ id, pathname: `derivatives/${user.id}/${input.sourceAssetId}/${id}.png`, clientPayload: JSON.stringify({ scope: "derivative", sourceAssetId: input.sourceAssetId }) });
  } catch (error) { return errorResponse(error); }
}

async function handleTokenRequest(request: Request, body: HandleUploadBody) {
  try {
    if (!process.env.VERCEL) throw new HttpError(404, "仅在独立部署中使用");
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, rawPayload) => {
        const user = currentUser(request);
        await ensureCoreTables();
        const payload = tokenPayload.parse(JSON.parse(rawPayload ?? "{}"));
        if (payload.scope === "asset") {
          const match = /^assets\/([^/]+)\/(asset_[0-9a-f-]+)\/original\.([a-z0-9]+)$/.exec(pathname);
          if (!match || match[1] !== user.id) throw new HttpError(403, "上传路径不属于当前用户");
          const [board] = await getDb().select({ id: boards.id }).from(boards).where(and(eq(boards.id, payload.boardId), eq(boards.ownerId, user.id))).limit(1);
          if (!board) throw new HttpError(404, "画布不存在");
          await assertAssetLimit(user.id);
          const formats = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"];
          return { allowedContentTypes: formats.filter((type) => supportedMedia(type)?.extension === match[3]), maximumSizeInBytes: match[3] === "jpg" || match[3] === "png" || match[3] === "webp" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES, addRandomSuffix: false, allowOverwrite: false };
        }
        const match = /^derivatives\/([^/]+)\/(asset_[0-9a-f-]+)\/(derivative_[0-9a-f-]+)\.png$/.exec(pathname);
        if (!match || match[1] !== user.id || match[2] !== payload.sourceAssetId) throw new HttpError(403, "上传路径不属于当前用户");
        const [source] = await getDb().select({ id: assets.id }).from(assets).where(and(eq(assets.id, payload.sourceAssetId), eq(assets.ownerId, user.id))).limit(1);
        if (!source) throw new HttpError(404, "原始素材不存在");
        return { allowedContentTypes: ["image/png"], maximumSizeInBytes: MAX_IMAGE_BYTES, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}
