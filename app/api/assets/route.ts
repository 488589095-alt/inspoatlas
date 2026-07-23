import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { MAX_ASSETS_PER_USER, MAX_IMAGE_BYTES, MAX_TEXT_LENGTH, isSafePublicUrl } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, boards, profiles } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";
import { getAssetBucket } from "../_storage";

const inputSchema = z.object({
  boardId: z.string().min(1), kind: z.enum(["web", "text"]), title: z.string().trim().min(1).max(500),
  text: z.string().max(MAX_TEXT_LENGTH).optional(), sourceUrl: z.string().optional(),
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
      if (!(file instanceof File) || !boardId) throw new HttpError(400, "请选择图片和目标画布");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_IMAGE_BYTES) throw new HttpError(400, "仅支持 20 MB 内的 JPG、PNG、WebP");
      await assertBoard(user.id, boardId);
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const objectKey = "assets/" + user.id + "/" + assetId + "/original." + extension;
      await getAssetBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: user.id, assetId } });
      await db.insert(assets).values({ id: assetId, ownerId: user.id, boardId, kind: "image", title: file.name.slice(0, 500), objectKey, metadata: { contentType: file.type, size: file.size }, status: "idle" });
      return Response.json({ asset: { id: assetId, boardId, kind: "image", title: file.name, contentUrl: "/api/assets/" + assetId + "/content", status: "idle" } }, { status: 201 });
    }
    const input = inputSchema.parse(await request.json());
    await assertBoard(user.id, input.boardId);
    if (input.sourceUrl && !isSafePublicUrl(input.sourceUrl)) throw new HttpError(400, "该 URL 不允许抓取");
    await db.insert(assets).values({ id: assetId, ownerId: user.id, boardId: input.boardId, kind: input.kind, title: input.title, sourceUrl: input.sourceUrl, extractedText: input.text, metadata: {}, status: "idle" });
    return Response.json({ asset: { id: assetId, ownerId: user.id, status: "idle", ...input } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
