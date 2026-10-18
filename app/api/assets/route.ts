import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { MAX_ASSETS_PER_USER, MAX_IMAGE_BYTES, MAX_MEDIA_BYTES, MAX_TEXT_LENGTH, isSafePublicUrl } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, boards, profiles } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";
import { supportedMedia } from "../_media";
import { getAssetBucket, verifyUploadedBlob } from "../_storage";

const inputSchema = z.object({
  boardId: z.string().min(1), kind: z.enum(["web", "text"]), title: z.string().trim().min(1).max(500),
  text: z.string().max(MAX_TEXT_LENGTH).optional(), sourceUrl: z.string().optional(),
});
const uploadedSchema = z.object({
  uploadedAsset: z.literal(true),
  id: z.string().regex(/^asset_[0-9a-f-]+$/),
  pathname: z.string(),
  boardId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  contentType: z.string(),
  size: z.number().int().positive(),
});

async function assertBoard(ownerId: string, boardId: string) {
  const [board] = await getDb().select({ id: boards.id }).from(boards).where(and(eq(boards.id, boardId), eq(boards.ownerId, ownerId))).limit(1);
  if (!board) throw new HttpError(404, "画布不存在");
}

export async function POST(request: Request) {
  try {
    const user = currentUser(request); await ensureCoreTables();
    const db = getDb();
    const [usage] = await db.select({ value: count() }).from(assets).where(eq(assets.ownerId, user.id));
    if ((usage?.value ?? 0) >= MAX_ASSETS_PER_USER) throw new HttpError(409, "素材数量已达到 500 个上限");
    await db.insert(profiles).values({ id: user.id, email: user.email }).onConflictDoNothing();
    const assetId = newId("asset"); const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData(); const boardId = String(form.get("boardId") ?? ""); const file = form.get("file");
      if (!(file instanceof File) || !boardId) throw new HttpError(400, "请选择素材和目标画布");
      const media = supportedMedia(file.type);
      if (!media || file.size > (media.kind === "image" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES)) {
        throw new HttpError(400, "仅支持图片、MP4/WebM 视频或常见音频；图片最大 20 MB，音视频最大 100 MB");
      }
      await assertBoard(user.id, boardId);
      const objectKey = "assets/" + user.id + "/" + assetId + "/original." + media.extension;
      await getAssetBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: user.id, assetId } });
      await db.insert(assets).values({ id: assetId, ownerId: user.id, boardId, kind: media.kind, title: file.name.slice(0, 500), objectKey, metadata: { contentType: file.type, size: file.size }, status: "idle" });
      return Response.json({ asset: { id: assetId, boardId, kind: media.kind, title: file.name, contentUrl: "/api/assets/" + assetId + "/content", status: "idle" } }, { status: 201 });
    }
    const body = await request.json();
    if (body?.uploadedAsset === true) {
      if (!process.env.VERCEL) throw new HttpError(400, "上传登记仅适用于独立部署");
      const input = uploadedSchema.parse(body);
      const media = supportedMedia(input.contentType);
      if (!media || input.size > (media.kind === "image" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES)) throw new HttpError(400, "素材格式或大小无效");
      const expectedPath = `assets/${user.id}/${input.id}/original.${media.extension}`;
      if (input.pathname !== expectedPath) throw new HttpError(403, "素材路径不属于当前用户");
      await assertBoard(user.id, input.boardId);
      const blob = await verifyUploadedBlob(input.pathname, input.contentType, media.kind === "image" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES);
      if (blob.size !== input.size) throw new HttpError(400, "素材大小与上传文件不一致");
      await db.insert(assets).values({ id: input.id, ownerId: user.id, boardId: input.boardId, kind: media.kind, title: input.title, objectKey: input.pathname, metadata: { contentType: input.contentType, size: input.size }, status: "idle" });
      return Response.json({ asset: { id: input.id, boardId: input.boardId, kind: media.kind, title: input.title, contentUrl: "/api/assets/" + input.id + "/content", status: "idle" } }, { status: 201 });
    }
    const input = inputSchema.parse(body);
    await assertBoard(user.id, input.boardId);
    if (input.sourceUrl && !isSafePublicUrl(input.sourceUrl)) throw new HttpError(400, "该 URL 不允许抓取");
    await db.insert(assets).values({ id: assetId, ownerId: user.id, boardId: input.boardId, kind: input.kind, title: input.title, sourceUrl: input.sourceUrl, extractedText: input.text, metadata: {}, status: "idle" });
    return Response.json({ asset: { id: assetId, ownerId: user.id, status: "idle", ...input } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
