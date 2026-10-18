import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { MAX_IMAGE_BYTES } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assetDerivatives, assets } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";
import { getAssetBucket, verifyUploadedBlob } from "../../../_storage";

const operationSchema = z.enum(["crop", "mask", "ai-edit"]);
const metadataSchema = z.object({
  sourceWidth: z.number().int().positive().max(16_384).optional(),
  sourceHeight: z.number().int().positive().max(16_384).optional(),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(.001).max(1), height: z.number().min(.001).max(1) }).optional(),
  rotation: z.number().finite().min(-360).max(360).optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  outputScale: z.number().min(.1).max(2).optional(),
  proposal: z.object({ label: z.string().max(120), category: z.string().max(80), confidence: z.number().min(0).max(1) }).optional(),
}).passthrough();

/** Save a client-rendered PNG as a new private asset. The original object is never modified. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: sourceAssetId } = await context.params;
    await ensureCoreTables();
    const [source] = await getDb().select().from(assets).where(and(eq(assets.id, sourceAssetId), eq(assets.ownerId, user.id))).limit(1);
    if (!source) throw new HttpError(404, "原始素材不存在");
    if (source.kind !== "image" || !source.objectKey) throw new HttpError(400, "只能从图片素材创建图层");

    let derivativeId: string;
    let objectKey: string;
    let title: string;
    let operation: "crop" | "mask" | "ai-edit";
    let metadata: z.infer<typeof metadataSchema>;
    if (request.headers.get("content-type")?.includes("application/json")) {
      if (!process.env.VERCEL) throw new HttpError(400, "上传登记仅适用于独立部署");
      const input = z.object({
        uploadedDerivative: z.literal(true), id: z.string().regex(/^derivative_[0-9a-f-]+$/),
        pathname: z.string(), title: z.string().trim().min(1).max(500),
        operation: operationSchema, metadata: metadataSchema, size: z.number().int().positive().max(MAX_IMAGE_BYTES),
      }).parse(await request.json());
      derivativeId = input.id;
      objectKey = `derivatives/${user.id}/${sourceAssetId}/${derivativeId}.png`;
      if (input.pathname !== objectKey) throw new HttpError(403, "图层路径不属于当前用户");
      const blob = await verifyUploadedBlob(objectKey, "image/png", MAX_IMAGE_BYTES);
      if (blob.size !== input.size) throw new HttpError(400, "图层大小与上传文件不一致");
      title = input.title; operation = input.operation; metadata = input.metadata;
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "请选择要保存的 PNG");
      if (file.type !== "image/png" || file.size > MAX_IMAGE_BYTES) throw new HttpError(400, "仅支持 20 MB 内的 PNG 图层");
      operation = operationSchema.parse(form.get("operation") || "crop");
      title = z.string().trim().min(1).max(500).parse(form.get("title") || "图层");
      metadata = metadataSchema.parse(JSON.parse(String(form.get("metadata") || "{}")));
      derivativeId = newId("derivative");
      objectKey = `derivatives/${user.id}/${sourceAssetId}/${derivativeId}.png`;
      await getAssetBucket().put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { ownerId: user.id, derivativeId, sourceAssetId },
      });
    }
    await getDb().insert(assetDerivatives).values({
      id: derivativeId, ownerId: user.id, boardId: source.boardId, sourceAssetId, title, operation, objectKey, metadata,
      status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return Response.json({ derivative: { id: derivativeId, sourceAssetId, boardId: source.boardId, title, operation, metadata, contentUrl: `/api/assets/${derivativeId}/content` } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
