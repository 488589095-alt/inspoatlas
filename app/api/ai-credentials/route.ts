import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { encryptApiKey, providerDefaults, testProvider, type ProviderConfig } from "@/packages/ai/src";
import { providerIds } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { aiCredentials } from "@/db/schema";
import { credentialMasterKey } from "../_credentials";
import { currentUser, errorResponse, newId } from "../_lib";

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
    return Response.json({ credentials: rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const input = schema.parse(await request.json()); await ensureCoreTables();
    const defaults = providerDefaults[input.provider];
    const config: ProviderConfig = { provider: input.provider, apiKey: input.apiKey, model: input.model ?? defaults.model, baseUrl: input.baseUrl ?? defaults.baseUrl, supportsVision: defaults.supportsVision };
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

export async function DELETE(request: Request) {
  try {
    const user = currentUser(request); const provider = new URL(request.url).searchParams.get("provider");
    await ensureCoreTables();
    if (provider && providerIds.includes(provider as (typeof providerIds)[number])) await getDb().delete(aiCredentials).where(and(eq(aiCredentials.ownerId, user.id), eq(aiCredentials.provider, provider as (typeof providerIds)[number])));
    else await getDb().delete(aiCredentials).where(eq(aiCredentials.ownerId, user.id));
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
