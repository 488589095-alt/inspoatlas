import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { MAX_IMAGE_BYTES } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assetDerivatives, assets, events } from "@/db/schema";
import { loadCredential } from "../../../_credentials";
import { reserveAiBudget } from "../../../_ai-budget";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";
import { getAssetBucket } from "../../../_storage";

const requestSchema = z.object({ prompt: z.string().trim().min(5).max(600) });
const QWEN_IMAGE_EDIT_MODEL = "qwen-image-edit-plus";
const MAX_QWEN_INPUT_BYTES = 10 * 1024 * 1024;

/** Generate a new private derivative from an owned image; the original stays untouched. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: sourceAssetId } = await context.params;
    const { prompt } = requestSchema.parse(await request.json());
    await ensureCoreTables();
    const [source] = await getDb().select().from(assets).where(and(eq(assets.id, sourceAssetId), eq(assets.ownerId, user.id))).limit(1);
    if (!source) throw new HttpError(404, "原始素材不存在");
    if (source.kind !== "image" || !source.objectKey) throw new HttpError(400, "请选择图片素材进行 AI 改造");

    const credential = await loadCredential(user.id, "qwen", true);
    if (!credential || credential.provider !== "qwen") throw new HttpError(503, "工作区 AI 服务暂不可用，请稍后重试");
    const object = await getAssetBucket().get(source.objectKey);
    if (!object) throw new HttpError(404, "图片文件不存在");
    const original = await new Response(object.body).arrayBuffer();
    if (original.byteLength > MAX_QWEN_INPUT_BYTES) throw new HttpError(413, "这张图片超过 AI 改造的 10 MB 限制，请先压缩后重试");
    const mime = String((source.metadata as { contentType?: string }).contentType || object.httpMetadata?.contentType || "image/png");
    if (!/^image\/(png|jpeg|webp|gif|bmp|tiff)$/i.test(mime)) throw new HttpError(400, "AI 改造暂不支持这张图片的格式");

    const startedAt = Date.now();
    const origin = new URL(credential.baseUrl).origin;
    await reserveAiBudget(user.id, "imageEdit", credential);
    const response = await fetch(`${origin}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${credential.apiKey}` },
      body: JSON.stringify({
        model: QWEN_IMAGE_EDIT_MODEL,
        input: { messages: [{ role: "user", content: [{ image: `data:${mime};base64,${Buffer.from(original).toString("base64")}` }, { text: prompt }] }] },
        parameters: { n: 1, watermark: false, prompt_extend: true },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const result = await response.json().catch(() => ({})) as {
      code?: string; message?: string;
      output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
    };
    if (!response.ok || result.code) throw new HttpError(502, result.message || "图片生成失败，请稍后重试");
    const imageUrl = result.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
    if (!imageUrl) throw new HttpError(502, "AI 没有返回图片，请重试");
    const outputUrl = new URL(imageUrl);
    if (outputUrl.protocol !== "https:" || !/^dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(outputUrl.hostname)) {
      throw new HttpError(502, "AI 返回的图片地址不受支持");
    }
    const imageResponse = await fetch(outputUrl, { redirect: "error", signal: AbortSignal.timeout(45_000) });
    if (!imageResponse.ok) throw new HttpError(502, "无法获取 AI 生成的图片，请重试");
    if (Number(imageResponse.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) throw new HttpError(502, "AI 生成的图片超过保存上限");
    const generated = await imageResponse.arrayBuffer();
    if (!generated.byteLength || generated.byteLength > MAX_IMAGE_BYTES) throw new HttpError(502, "AI 生成的图片无法保存");

    const derivativeId = newId("derivative");
    const title = `${source.title} · AI 改造`.slice(0, 500);
    const objectKey = `derivatives/${user.id}/${sourceAssetId}/${derivativeId}.png`;
    const metadata = { prompt, provider: credential.provider, model: QWEN_IMAGE_EDIT_MODEL, runMode: credential.runMode };
    await getAssetBucket().put(objectKey, generated, {
      httpMetadata: { contentType: "image/png" }, customMetadata: { ownerId: user.id, derivativeId, sourceAssetId },
    });
    await getDb().insert(assetDerivatives).values({
      id: derivativeId, ownerId: user.id, boardId: source.boardId, sourceAssetId, title,
      operation: "ai-edit", objectKey, metadata, status: "ready",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await getDb().insert(events).values({
      id: newId("event"), ownerId: user.id, name: "ai.image.edit.completed",
      payload: { sourceAssetId, derivativeId, model: QWEN_IMAGE_EDIT_MODEL, runMode: credential.runMode, latencyMs: Date.now() - startedAt },
      createdAt: new Date().toISOString(),
    });
    return Response.json({ derivative: { id: derivativeId, sourceAssetId, boardId: source.boardId, title, operation: "ai-edit", metadata, contentUrl: `/api/assets/${derivativeId}/content` } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
