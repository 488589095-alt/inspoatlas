import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderConfig, decryptApiKey, encryptApiKey, generateTextWithProvider, parseModelJson, proposeImageLayers } from "../packages/ai/src/index.ts";
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
  assert.deepEqual(providerIds, ["openai", "anthropic", "gemini", "qwen", "deepseek", "moonshot", "zhipu", "doubao", "minimax", "gateway"]);
  for (const provider of providerIds) {
    assert.match(providerCatalog[provider].platformUrl, /^https:\/\//);
    assert.ok(providerCatalog[provider].models.length > 0);
  }
  assert.equal(providerCatalog.deepseek.supportsVision, false);
  assert.equal(providerCatalog.minimax.supportsVision, false);
  assert.equal(providerCatalog.moonshot.models[0], "kimi-k3");
  assert.ok(!providerCatalog.moonshot.models.includes("kimi-k2.5"));
});
test("模型 JSON 解析可处理思考标签、代码围栏和前后说明", () => {
  assert.deepEqual(parseModelJson('<think>先分析</think>\n结果如下：\n```json\n{"summary":"包含 } 字符也不截断","items":[1,2]}\n```\n完成'), {
    summary: "包含 } 字符也不截断",
    items: [1, 2],
  });
  assert.deepEqual(parseModelJson('说明文字 {"ok":true,"nested":{"value":"x"}} 尾部文字'), {
    ok: true,
    nested: { value: "x" },
  });
  assert.throws(() => parseModelJson("不是 JSON"), /JSON 无法解析/);
});

test("AI 图层候选只把有效轮廓交给一键蒙版", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ layers: [
    { id: "person-1", label: "人物", category: "person", rect: { x: .1, y: .1, width: .6, height: .8 }, contours: [[{ x: .2, y: .2 }, { x: .3, y: .1 }, { x: .4, y: .1 }, { x: .7, y: .3 }, { x: .7, y: .8 }, { x: .4, y: .9 }, { x: .2, y: .8 }, { x: .1, y: .4 }, { x: 2, y: .9 }]], confidence: .9 },
    { id: "object-1", label: "模糊物体", category: "object", rect: { x: .1, y: .1, width: .2, height: .2 }, contours: [[{ x: .1, y: .1 }, { x: .2, y: .2 }]], confidence: .3 },
  ] }) } }] });
  try {
    const result = await proposeImageLayers({ title: "测试图片", imageDataUrl: "data:image/png;base64,AA==" }, { provider: "qwen", apiKey: "test", model: "vision", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", supportsVision: true });
    assert.equal(result[0].contours[0].length, 8);
    assert.deepEqual(result[1].contours, []);
  } finally { globalThis.fetch = originalFetch; }
});

test("小in 普通对话关闭百炼深度思考，图片任务沿用默认设置", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: "你好" } }] });
  };
  try {
    const config = { provider: "qwen" as const, apiKey: "test", model: "qwen3.7-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", supportsVision: true };
    await generateTextWithProvider([{ role: "user", content: "你好" }], config, { maxTokens: 950, disableThinking: true });
    await generateTextWithProvider([{ role: "user", content: "分析图片" }], config);
    assert.equal(requests[0].enable_thinking, false);
    assert.equal(requests[0].max_tokens, 950);
    assert.equal("enable_thinking" in requests[1], false);
  } finally { globalThis.fetch = originalFetch; }
});
