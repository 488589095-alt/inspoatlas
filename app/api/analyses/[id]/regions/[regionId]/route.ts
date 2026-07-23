import { and, eq } from "drizzle-orm";
import { analysisResultSchema, componentRegionSchema, rectSchema } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, confirmedElements } from "@/db/schema";
import { currentUser, errorResponse, HttpError, newId } from "../../../../_lib";
import { getAssetBucket } from "../../../../_storage";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; regionId: string }> }) {
  try {
    const user = currentUser(request); const { id, regionId } = await context.params; await ensureCoreTables(); const db = getDb();
    const [analysis] = await db.select().from(analyses).where(and(eq(analyses.id, id), eq(analyses.ownerId, user.id))).limit(1);
    if (!analysis?.result) throw new HttpError(404, "分析结果不存在");
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, analysis.assetId), eq(assets.ownerId, user.id))).limit(1);
    if (!asset) throw new HttpError(404, "来源素材不存在");
    const form = await request.formData();
    const label = String(form.get("label") ?? "").trim();
    const type = componentRegionSchema.shape.type.parse(String(form.get("type") ?? "other"));
    const rect = rectSchema.parse(JSON.parse(String(form.get("rect") ?? "{}")));
    const file = form.get("file");
    const result = analysisResultSchema.parse(analysis.result);
    const region = result.components.find((item) => item.id === regionId);
    if (!region) throw new HttpError(404, "检测区域不存在");
    region.label = label || region.label; region.type = type; region.rect = rect; region.confirmed = true;
    let [element] = await db.select().from(confirmedElements).where(and(eq(confirmedElements.analysisId, id), eq(confirmedElements.regionId, regionId))).limit(1);
    const elementId = element?.id ?? newId("element"); let objectKey = element?.objectKey ?? null;
    if (file instanceof File && file.size) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new HttpError(400, "元素切图格式无效");
      objectKey = "elements/" + user.id + "/" + elementId + "/crop.png";
      await getAssetBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: user.id, assetId: asset.id } });
    }
    if (element) {
      await db.update(confirmedElements).set({ label: region.label, type: region.type, rect, objectKey, metadata: { analysisVersion: analysis.schemaVersion } }).where(eq(confirmedElements.id, elementId));
    } else {
      await db.insert(confirmedElements).values({ id: elementId, ownerId: user.id, boardId: asset.boardId, assetId: asset.id, analysisId: id, regionId, label: region.label, type: region.type, rect, objectKey, metadata: { analysisVersion: analysis.schemaVersion } });
    }
    await db.update(analyses).set({ result, updatedAt: new Date().toISOString() }).where(eq(analyses.id, id));
    return Response.json({ element: { id: elementId, assetId: asset.id, analysisId: id, regionId, label: region.label, type: region.type, rect, contentUrl: objectKey ? "/api/assets/" + elementId + "/content" : null }, analysis: { ...analysis, result } });
  } catch (error) { return errorResponse(error); }
}
