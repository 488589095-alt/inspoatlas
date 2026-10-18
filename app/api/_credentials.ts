import { env } from "cloudflare:workers";
import { assertProviderConfig, providerDefaults, type ProviderConfig } from "@/packages/ai/src";
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
  MANAGED_AI_API_KEY?: string;
  MANAGED_AI_BASE_URL?: string;
  AI_GATEWAY_API_KEY?: string;
  VERCEL_OIDC_TOKEN?: string;
};

function managedEnv(): ManagedAiEnv {
  const runtime = env as unknown as ManagedAiEnv;
  return {
    MANAGED_AI_API_KEY: runtime.MANAGED_AI_API_KEY ?? process.env.MANAGED_AI_API_KEY,
    MANAGED_AI_BASE_URL: runtime.MANAGED_AI_BASE_URL ?? process.env.MANAGED_AI_BASE_URL,
    AI_GATEWAY_API_KEY: runtime.AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY,
    VERCEL_OIDC_TOKEN: runtime.VERCEL_OIDC_TOKEN ?? process.env.VERCEL_OIDC_TOKEN,
  };
}

export function managedAiSummary() {
  const values = managedEnv();
  const provider = values.MANAGED_AI_API_KEY ? "qwen" as const
    : values.AI_GATEWAY_API_KEY || values.VERCEL_OIDC_TOKEN ? "gateway" as const : null;
  if (!provider) return { available: false as const, provider: null, model: null, supportsVision: false };
  const defaults = providerDefaults[provider];
  return {
    available: true,
    provider,
    model: defaults.model,
    supportsVision: defaults.supportsVision,
  };
}

function managedCredential(needsVision: boolean): LoadedCredential | null {
  const values = managedEnv();
  const summary = managedAiSummary();
  if (!summary.available || !summary.provider || (needsVision && !summary.supportsVision)) return null;
  const defaults = providerDefaults[summary.provider];
  const config: LoadedCredential = {
    provider: summary.provider,
    apiKey: summary.provider === "qwen" ? values.MANAGED_AI_API_KEY! : (values.AI_GATEWAY_API_KEY ?? values.VERCEL_OIDC_TOKEN!),
    model: defaults.model,
    baseUrl: summary.provider === "qwen" ? (values.MANAGED_AI_BASE_URL ?? defaults.baseUrl) : defaults.baseUrl,
    supportsVision: defaults.supportsVision,
    runMode: "managed",
  };
  assertProviderConfig(config);
  return config;
}

export async function loadCredential(_ownerId: string, _provider?: string, needsVision = false) {
  // User requests always use the workspace-managed model. Existing personal keys stay stored for migration.
  return managedCredential(needsVision);
}
