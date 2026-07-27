import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { assertProviderConfig, decryptApiKey, providerDefaults, type ProviderConfig } from "@/packages/ai/src";
import { providerIds, type ProviderId } from "@/packages/domain/src";
import { getDb } from "@/db";
import { aiCredentials } from "@/db/schema";
import { HttpError } from "./_lib";

const developmentKey = "5c497cd39f8ccf5cf8c96f430db1a1f78f6b9810f103811492442076c9537730";

export function credentialMasterKey() {
  const value = (env as unknown as { AI_CREDENTIAL_KEY?: string }).AI_CREDENTIAL_KEY
    ?? process.env.AI_CREDENTIAL_KEY
    ?? (process.env.NODE_ENV === "production" ? "" : developmentKey);
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new HttpError(503, "部署环境尚未配置 AI_CREDENTIAL_KEY");
  return value;
}

export type AiRunMode = "managed" | "byok";
export type LoadedCredential = ProviderConfig & { runMode: AiRunMode };

type ManagedAiEnv = {
  MANAGED_AI_PROVIDER?: string;
  MANAGED_AI_API_KEY?: string;
  MANAGED_AI_MODEL?: string;
  MANAGED_AI_BASE_URL?: string;
};

function managedEnv(): ManagedAiEnv {
  const runtime = env as unknown as ManagedAiEnv;
  return {
    MANAGED_AI_PROVIDER: runtime.MANAGED_AI_PROVIDER ?? process.env.MANAGED_AI_PROVIDER,
    MANAGED_AI_API_KEY: runtime.MANAGED_AI_API_KEY ?? process.env.MANAGED_AI_API_KEY,
    MANAGED_AI_MODEL: runtime.MANAGED_AI_MODEL ?? process.env.MANAGED_AI_MODEL,
    MANAGED_AI_BASE_URL: runtime.MANAGED_AI_BASE_URL ?? process.env.MANAGED_AI_BASE_URL,
  };
}

export function managedAiSummary() {
  const values = managedEnv();
  const provider = providerIds.includes(values.MANAGED_AI_PROVIDER as ProviderId)
    ? values.MANAGED_AI_PROVIDER as ProviderId
    : null;
  if (!provider) return { available: false as const, provider: null, model: null, supportsVision: false };
  const defaults = providerDefaults[provider];
  return {
    available: Boolean(values.MANAGED_AI_API_KEY),
    provider,
    model: values.MANAGED_AI_MODEL ?? defaults.model,
    supportsVision: defaults.supportsVision,
  };
}

function managedCredential(needsVision: boolean): LoadedCredential | null {
  const values = managedEnv();
  const summary = managedAiSummary();
  if (!summary.available || !summary.provider || (needsVision && !summary.supportsVision) || !values.MANAGED_AI_API_KEY) return null;
  const defaults = providerDefaults[summary.provider];
  const config: LoadedCredential = {
    provider: summary.provider,
    apiKey: values.MANAGED_AI_API_KEY,
    model: summary.model ?? defaults.model,
    baseUrl: values.MANAGED_AI_BASE_URL ?? defaults.baseUrl,
    supportsVision: defaults.supportsVision,
    runMode: "managed",
  };
  assertProviderConfig(config);
  return config;
}

export async function loadCredential(ownerId: string, provider?: string, needsVision = false) {
  const managed = !provider ? managedCredential(needsVision) : null;
  if (managed) return managed;
  const rows = await getDb().select().from(aiCredentials).where(eq(aiCredentials.ownerId, ownerId)).orderBy(desc(aiCredentials.updatedAt));
  const row = rows.find((item) => (!provider || item.provider === provider) && (!needsVision || item.supportsVision));
  if (!row) return null;
  const apiKey = await decryptApiKey({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, credentialMasterKey());
  return { provider: row.provider, apiKey, model: row.model, baseUrl: row.baseUrl, supportsVision: row.supportsVision, runMode: "byok" } satisfies LoadedCredential;
}
