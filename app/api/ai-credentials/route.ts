import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { decryptApiKey, encryptApiKey, providerDefaults, testProvider, type ProviderConfig } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { aiCredentials } from "@/db/schema";
import { credentialMasterKey, managedAiSummary } from "../_credentials";
import { currentUser, errorResponse, HttpError, newId } from "../_lib";

const activateSchema = z.object({
  provider: z.enum(providerIds),
  model: z.string().trim().min(1).max(120).optional(),
});

const schema = z.object({
  provider: z.enum(providerIds), apiKey: z.string().trim().min(8).max(500),
  model: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).max(120).optional()),
  baseUrl: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
});

export async function GET(request: Request) {
  try {
    const user = currentUser(request); await ensureCoreTables();
    const rows = await getDb().select({
      provider: aiCredentials.provider, model: aiCredentials.model, baseUrl: aiCredentials.baseUrl,
      lastFour: aiCredentials.lastFour, supportsVision: aiCredentials.supportsVision, updatedAt: aiCredentials.updatedAt,
    }).from(aiCredentials).where(eq(aiCredentials.ownerId, user.id)).orderBy(desc(aiCredentials.updatedAt));
    return Response.json({ credentials: rows.map((row, index) => ({ ...row, active: index === 0 })), managed: managedAiSummary() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const input = schema.parse(await request.json()); await ensureCoreTables();
    const defaults = providerDefaults[input.provider];
    const config: ProviderConfig = { provider: input.provider, apiKey: input.apiKey, model: input.provider === "openai" ? defaults.model : input.model ?? defaults.model, baseUrl: input.baseUrl ?? defaults.baseUrl, supportsVision: defaults.supportsVision };
    await testProvider(config);
    const encrypted = await encryptApiKey(input.apiKey, credentialMasterKey());
    const now = new Date().toISOString();
    await getDb().insert(aiCredentials).values({
      id: newId("credential"), ownerId: user.id, provider: input.provider, model: config.model, baseUrl: config.baseUrl,
      ...encrypted, lastFour: input.apiKey.slice(-4), supportsVision: config.supportsVision, updatedAt: now, createdAt: now,
    }).onConflictDoUpdate({
      target: [aiCredentials.ownerId, aiCredentials.provider],
      set: { model: config.model, baseUrl: config.baseUrl, ...encrypted, lastFour: input.apiKey.slice(-4), supportsVision: config.supportsVision, updatedAt: now },
    });
    return Response.json({ credential: { provider: input.provider, model: config.model, lastFour: input.apiKey.slice(-4), supportsVision: config.supportsVision, updatedAt: now } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = currentUser(request); const input = activateSchema.parse(await request.json()); await ensureCoreTables();
    const [row] = await getDb().select().from(aiCredentials).where(and(eq(aiCredentials.ownerId, user.id), eq(aiCredentials.provider, input.provider))).limit(1);
    if (!row) throw new HttpError(404, "没有找到已保存的模型服务");
    const config: ProviderConfig = {
      provider: row.provider,
      apiKey: await decryptApiKey({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, credentialMasterKey()),
      model: input.provider === "openai" ? providerDefaults.openai.model : input.model ?? row.model,
      baseUrl: row.baseUrl,
      supportsVision: row.supportsVision,
    };
    await testProvider(config);
    const now = new Date().toISOString();
    await getDb().update(aiCredentials).set({ model: config.model, updatedAt: now }).where(and(eq(aiCredentials.ownerId, user.id), eq(aiCredentials.provider, input.provider)));
    return Response.json({ credential: { provider: input.provider, model: config.model, lastFour: row.lastFour, supportsVision: row.supportsVision, active: true, updatedAt: now } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = currentUser(request); const provider = new URL(request.url).searchParams.get("provider");
    await ensureCoreTables();
    if (provider && providerIds.includes(provider as (typeof providerIds)[number])) await getDb().delete(aiCredentials).where(and(eq(aiCredentials.ownerId, user.id), eq(aiCredentials.provider, provider as (typeof providerIds)[number])));
    else await getDb().delete(aiCredentials).where(eq(aiCredentials.ownerId, user.id));
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
