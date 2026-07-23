import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { decryptApiKey, type ProviderConfig } from "@/packages/ai/src";
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

export async function loadCredential(ownerId: string, provider?: string, needsVision = false) {
  const rows = await getDb().select().from(aiCredentials).where(eq(aiCredentials.ownerId, ownerId)).orderBy(desc(aiCredentials.updatedAt));
  const row = rows.find((item) => (!provider || item.provider === provider) && (!needsVision || item.supportsVision));
  if (!row) return null;
  const apiKey = await decryptApiKey({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, credentialMasterKey());
  return { provider: row.provider, apiKey, model: row.model, baseUrl: row.baseUrl, supportsVision: row.supportsVision } satisfies ProviderConfig;
}
