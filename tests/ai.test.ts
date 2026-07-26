import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderConfig, decryptApiKey, encryptApiKey } from "../packages/ai/src/index.ts";
import { providerCatalog, providerIds } from "../packages/domain/src/index.ts";

test("BYOK Key 使用 AES-GCM 加密且可正确解密", async () => {
  const master = "11".repeat(32);
  const encrypted = await encryptApiKey("sk-private-example", master);
  assert.notEqual(encrypted.ciphertext, "sk-private-example");
  assert.equal(Buffer.from(encrypted.iv, "base64").length, 12);
  assert.equal(Buffer.from(encrypted.authTag, "base64").length, 16);
  assert.equal(await decryptApiKey(encrypted, master), "sk-private-example");
});

test("Provider 端点白名单与视觉能力不可伪造", () => {
  assert.throws(() => assertProviderConfig({ provider: "openai", apiKey: "x", model: "x", baseUrl: "https://evil.example/v1", supportsVision: true }), /允许列表/);
  assert.throws(() => assertProviderConfig({ provider: "deepseek", apiKey: "x", model: "x", baseUrl: "https://api.deepseek.com/v1", supportsVision: true }), /仅用于文字分析/);
  assert.doesNotThrow(() => assertProviderConfig({ provider: "qwen", apiKey: "x", model: "x", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", supportsVision: true }));
});

test("模型服务目录覆盖常用平台并提供官方入口", () => {
  assert.deepEqual(providerIds, ["openai", "anthropic", "gemini", "qwen", "deepseek", "moonshot", "zhipu", "doubao", "minimax"]);
  for (const provider of providerIds) {
    assert.match(providerCatalog[provider].platformUrl, /^https:\/\//);
    assert.ok(providerCatalog[provider].models.length > 0);
  }
  assert.equal(providerCatalog.deepseek.supportsVision, false);
  assert.equal(providerCatalog.minimax.supportsVision, false);
});
