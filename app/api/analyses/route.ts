import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { analyzeWithProvider } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets } from "@/db/schema";
import { loadCredential } from "../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";
import { getAssetBucket } from "../_storage";

const schema = z.object({
  assetId: z.string().min(1),
  provider: z.enum(providerIds).optional(),
  mode: z.literal("replace").default("replace"),
});

export async function GET(request: Request) {
  try {
    const user = currentUser(request);
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    const boardId = url.searchParams.get("boardId");
    await ensureCoreTables();
    const db = getDb();

    if (boardId) {
      const rows = await db.select({
        id: analyses.id,
        assetId: analyses.assetId,
        provider: analyses.provider,
        model: analyses.model,
        result: analyses.result,
        status: analyses.status,
        error: analyses.error,
        updatedAt: analyses.updatedAt,
      }).from(analyses)
        .innerJoin(assets, eq(analyses.assetId, assets.id))
        .where(and(
          eq(assets.boardId, boardId),
          eq(assets.ownerId, user.id),
          eq(analyses.ownerId, user.id),
        ));
      return Response.json({ analyses: rows }, { headers: { "cache-control": "no-store" } });
    }

    if (!assetId) throw new HttpError(400, "缺少素材 ID 或画布 ID");
    const [analysis] = await db.select().from(analyses)
      .where(and(eq(analyses.assetId, assetId), eq(analyses.ownerId, user.id)))
      .limit(1);
    return Response.json({ analysis: analysis ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let analysisId = "";
  let ownerId = "";
  try {
    const user = currentUser(request);
    ownerId = user.id;
    const input = schema.parse(await request.json());
    await ensureCoreTables();
    const db = getDb();
    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, input.assetId), eq(assets.ownerId, user.id)))
      .limit(1);
    if (!asset) throw new HttpError(404, "素材不存在，请重新导入后分析");

    const metadata = (asset.metadata ?? {}) as {
      contentType?: string;
      screenshotKeys?: string[];
      styles?: Array<Record<string, unknown>>;
    };
    const objectKey = asset.objectKey ?? metadata.screenshotKeys?.[0];
    const needsVision = asset.kind === "image" || Boolean(objectKey);
    const credential = await loadCredential(user.id, input.provider, needsVision);
    if (!credential) {
      throw new HttpError(
        409,
        needsVision ? "请先配置支持图片输入的 OpenAI 或 Qwen Key" : "请先添加模型 Key",
      );
    }

    const [existing] = await db.select().from(analyses)
      .where(and(eq(analyses.assetId, asset.id), eq(analyses.ownerId, user.id)))
      .limit(1);
    analysisId = existing?.id ?? newId("analysis");
    const now = new Date().toISOString();
    await db.insert(analyses).values({
      id: analysisId,
      ownerId: user.id,
      assetId: asset.id,
      schemaVersion: 2,
      provider: credential.provider,
      model: credential.model,
      result: existing?.result,
      status: "processing",
      error: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: analyses.assetId,
      set: {
        provider: credential.provider,
        model: credential.model,
        status: "processing",
        error: null,
        updatedAt: now,
      },
    });
    await db.update(assets).set({ status: "processing" }).where(eq(assets.id, asset.id));

    let imageDataUrl: string | undefined;
    if (objectKey) {
      const object = await getAssetBucket().get(objectKey);
      if (!object) throw new HttpError(404, "素材文件不存在");
      const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
      imageDataUrl = "data:" + (metadata.contentType ?? "image/jpeg") + ";base64," + Buffer.from(bytes).toString("base64");
    }
    const result = await analyzeWithProvider({
      assetId: asset.id,
      title: asset.title,
      text: asset.extractedText ?? undefined,
      imageDataUrl,
      computedStyles: metadata.styles,
    }, credential);

    await db.update(analyses).set({
      result,
      status: "ready",
      error: null,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    }).where(eq(analyses.id, analysisId));
    await db.update(assets).set({ status: "ready" }).where(eq(assets.id, asset.id));
    return Response.json({
      analysis: {
        id: analysisId,
        assetId: asset.id,
        status: "ready",
        provider: credential.provider,
        model: credential.model,
        result,
      },
    });
  } catch (error) {
    try {
      if (analysisId && ownerId) {
        await getDb().update(analyses).set({
          status: "failed",
          error: error instanceof Error ? error.message : "分析失败",
          updatedAt: new Date().toISOString(),
        }).where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)));
      }
    } catch {
      // Preserve the original error.
    }
    return errorResponse(error);
  }
}
