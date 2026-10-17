import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ANALYSIS_PROMPT_VERSION, analyzeWithProvider } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { analyses, assets, events } from "@/db/schema";
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
    const startedAt = Date.now();
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
    if (!credential) throw new HttpError(503, "工作区 AI 服务暂不可用，请稍后重试");

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
    const analyzed = await analyzeWithProvider({
      assetId: asset.id,
      title: asset.title,
      text: asset.extractedText ?? undefined,
      imageDataUrl,
      computedStyles: metadata.styles,
    }, credential);
    const result = { ...analyzed, promptVersion: ANALYSIS_PROMPT_VERSION, runMode: credential.runMode };

    await db.update(analyses).set({
      result,
      status: "ready",
      error: null,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    }).where(eq(analyses.id, analysisId));
    await db.update(assets).set({ status: "ready" }).where(eq(assets.id, asset.id));
    await db.insert(events).values({
      id: newId("event"),
      ownerId: user.id,
      name: "ai.analysis.completed",
      payload: {
        analysisId,
        assetId: asset.id,
        assetKind: asset.kind,
        provider: credential.provider,
        model: credential.model,
        promptVersion: ANALYSIS_PROMPT_VERSION,
        runMode: credential.runMode,
        latencyMs: Date.now() - startedAt,
        componentCount: result.components.length,
        isRerun: Boolean(existing),
      },
      createdAt: new Date().toISOString(),
    });
    return Response.json({
      analysis: {
        id: analysisId,
        assetId: asset.id,
        status: "ready",
        provider: credential.provider,
        model: credential.model,
        promptVersion: ANALYSIS_PROMPT_VERSION,
        runMode: credential.runMode,
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
