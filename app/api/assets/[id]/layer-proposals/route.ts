import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { proposeImageLayers, LAYER_PROPOSAL_PROMPT_VERSION } from "@/packages/ai/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, events } from "@/db/schema";
import { loadCredential } from "../../../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../../../_lib";
import { getAssetBucket } from "../../../_storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = currentUser(request);
    const { id: assetId } = await context.params;
    await ensureCoreTables();
    const [asset] = await getDb().select().from(assets).where(and(eq(assets.id, assetId), eq(assets.ownerId, user.id))).limit(1);
    if (!asset) throw new HttpError(404, "图片素材不存在");
    if (asset.kind !== "image" || !asset.objectKey) throw new HttpError(400, "只能拆分图片素材");
    const credential = await loadCredential(user.id, "qwen", true);
    if (!credential) throw new HttpError(503, "工作区 AI 服务暂不可用，请稍后重试");
    const object = await getAssetBucket().get(asset.objectKey);
    if (!object) throw new HttpError(404, "图片文件不存在");
    const contentType = String((asset.metadata as { contentType?: string }).contentType || object.httpMetadata?.contentType || "image/png");
    const bytes = await new Response(object.body).arrayBuffer();
    const startedAt = Date.now();
    const proposals = await proposeImageLayers({ title: asset.title, imageDataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}` }, credential);
    await getDb().insert(events).values({
      id: newId("event"), ownerId: user.id, name: "ai.layers.completed",
      payload: { assetId, provider: credential.provider, model: credential.model, promptVersion: LAYER_PROPOSAL_PROMPT_VERSION, runMode: credential.runMode, candidateCount: proposals.length, latencyMs: Date.now() - startedAt },
      createdAt: new Date().toISOString(),
    });
    return Response.json({ proposals, provider: credential.provider, model: credential.model, promptVersion: LAYER_PROPOSAL_PROMPT_VERSION });
  } catch (error) {
    return errorResponse(error);
  }
}
