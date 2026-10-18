import { Buffer } from "node:buffer";
import { analysisResultSchema, type AnalysisResult, type ProviderId } from "@inspoatlas/domain";

export interface ProviderConfig { provider: ProviderId; apiKey: string; model: string; baseUrl: string; supportsVision: boolean; }
export interface AnalyzeInput { assetId: string; title: string; text?: string; imageDataUrl?: string; computedStyles?: Record<string, unknown>[]; }
export const ANALYSIS_PROMPT_VERSION = "analysis-v3";
export const LAYER_PROPOSAL_PROMPT_VERSION = "layers-v2-contours";
export const RESEARCH_PROMPT_VERSION = "research-v1";
export interface TextMessage { role: "user" | "assistant"; content: string; }
export const providerDefaults: Record<ProviderId, { model: string; baseUrl: string; supportsVision: boolean }> = {
  gateway: { model: "google/gemini-2.5-flash", baseUrl: "https://ai-gateway.vercel.sh/v1", supportsVision: true },
  openai: { model: "gpt-5.6-terra", baseUrl: "https://api.openai.com/v1", supportsVision: true },
  anthropic: { model: "claude-sonnet-4-20250514", baseUrl: "https://api.anthropic.com/v1", supportsVision: true },
  gemini: { model: "gemini-3.6-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", supportsVision: true },
  qwen: { model: "qwen3.7-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", supportsVision: true },
  deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", supportsVision: false },
  moonshot: { model: "kimi-k3", baseUrl: "https://api.moonshot.cn/v1", supportsVision: true },
  zhipu: { model: "glm-4.5v", baseUrl: "https://open.bigmodel.cn/api/paas/v4", supportsVision: true },
  doubao: { model: "doubao-seed-2-0-lite-260215", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", supportsVision: true },
  minimax: { model: "MiniMax-M2.7", baseUrl: "https://api.minimax.io/v1", supportsVision: false },
};
const allowedEndpoints: Record<ProviderId, RegExp[]> = {
  gateway: [/^https:\/\/ai-gateway\.vercel\.sh\/v1\/?$/],
  openai: [/^https:\/\/api\.openai\.com\/v1\/?$/],
  anthropic: [/^https:\/\/api\.anthropic\.com\/v1\/?$/],
  gemini: [/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/?$/],
  qwen: [/^https:\/\/dashscope(-intl|-us)?\.aliyuncs\.com\/compatible-mode\/v1\/?$/, /^https:\/\/[a-z0-9-]+\.(cn-beijing|ap-southeast-1|ap-northeast-1|eu-central-1)\.maas\.aliyuncs\.com\/compatible-mode\/v1\/?$/],
  deepseek: [/^https:\/\/api\.deepseek\.com\/v1\/?$/],
  moonshot: [/^https:\/\/api\.moonshot\.cn\/v1\/?$/],
  zhipu: [/^https:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/?$/],
  doubao: [/^https:\/\/ark\.cn-beijing\.volces\.com\/api\/v3\/?$/],
  minimax: [/^https:\/\/api\.minimax\.io\/v1\/?$/],
};

export function assertProviderConfig(config: ProviderConfig) {
  if (!allowedEndpoints[config.provider].some((pattern) => pattern.test(config.baseUrl))) throw new Error("模型端点不在允许列表中");
  if (["deepseek", "minimax"].includes(config.provider) && config.supportsVision) throw new Error("当前模型服务仅用于文字分析");
}
export async function analyzeWithProvider(input: AnalyzeInput, config: ProviderConfig): Promise<AnalysisResult> {
  assertProviderConfig(config);
  if (input.imageDataUrl && !config.supportsVision) throw new Error("当前模型不支持图片输入，请配置 OpenAI 或 Qwen 视觉模型");
  const raw = await requestJson(buildMessages(input), config);
  const first = analysisResultSchema.safeParse(normalizeAnalysisPayload(raw, input.assetId));
  if (first.success) return { ...first.data, analyzedAt: new Date().toISOString(), model: { provider: config.provider, id: config.model } };

  const repairMessages = [{
    role: "user",
    content: [
      "将下面的模型输出修复为指定 JSON 结构。不要解释，不要使用 Markdown。",
      analysisSchemaGuide(input.assetId),
      "校验问题：" + JSON.stringify(first.error.issues.slice(0, 20)),
      "待修复输出：" + JSON.stringify(raw),
    ].join("\n\n"),
  }];
  const repairedRaw = await requestJson(repairMessages, config);
  const repaired = analysisResultSchema.safeParse(normalizeAnalysisPayload(repairedRaw, input.assetId));
  if (!repaired.success) {
    throw new Error("模型返回的结构与设计分析格式不兼容。请重试；若持续失败，请重新连接 AI 服务。");
  }
  return { ...repaired.data, analyzedAt: new Date().toISOString(), model: { provider: config.provider, id: config.model } };
}
export async function testProvider(config: ProviderConfig) {
  assertProviderConfig(config);
  const result = await requestJson([{ role: "user", content: "只返回 JSON：{\"ok\":true}" }], config);
  if (!result || typeof result !== "object") throw new Error("模型没有返回有效 JSON");
}

export type ImageLayerProposal = {
  id: string;
  label: string;
  category: string;
  rect: { x: number; y: number; width: number; height: number };
  contours: Array<Array<{ x: number; y: number }>>;
  confidence: number;
};

/** Vision contours are editable suggestions, not pixel-accurate segmentation. */
export async function proposeImageLayers(input: { title: string; imageDataUrl: string }, config: ProviderConfig): Promise<ImageLayerProposal[]> {
  assertProviderConfig(config);
  if (!config.supportsVision) throw new Error("当前百炼连接不支持图片定位");
  const prompt = [
    "识别图片里可独立选择的人物、动物及具体物体，给每个主体的可见外轮廓。只返回 JSON。",
    "不要把背景、光影、纹理或不确定区域列为主体。相互分离的部分用多个 contours。轮廓尽量贴边，不能只输出矩形四角。",
    "所有坐标按 0-1 归一化；最多 6 个主体，每个主体最多 2 条轮廓，每条轮廓按顺序给 8-24 个点。看不清时返回空 contours，不要编造精确边界。",
    "严格结构：{\"layers\":[{\"id\":\"layer-1\",\"label\":\"人物\",\"category\":\"person\",\"rect\":{\"x\":0.1,\"y\":0.1,\"width\":0.3,\"height\":0.6},\"contours\":[[{\"x\":0.2,\"y\":0.1},{\"x\":0.3,\"y\":0.11},{\"x\":0.38,\"y\":0.2},{\"x\":0.4,\"y\":0.55},{\"x\":0.32,\"y\":0.7},{\"x\":0.17,\"y\":0.68},{\"x\":0.12,\"y\":0.4},{\"x\":0.15,\"y\":0.2}]],\"confidence\":0.8}]}",
    "图片标题：" + input.title,
  ].join("\n");
  const raw = await requestJson([{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: input.imageDataUrl } }] }], config);
  return asArray(asRecord(raw).layers).slice(0, 6).flatMap((value, index) => {
    const item = asRecord(value); const box = asRecord(item.rect ?? item.bbox);
    const rect = { x: clamp(asNumber(box.x, -1), 0, 1), y: clamp(asNumber(box.y, -1), 0, 1), width: clamp(asNumber(box.width ?? box.w, 0), 0, 1), height: clamp(asNumber(box.height ?? box.h, 0), 0, 1) };
    const label = asText(item.label ?? item.name);
    if (!label || !rect.width || !rect.height || rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001) return [];
    const contours = asArray(item.contours).slice(0, 2).map((contour) => asArray(contour).slice(0, 24).flatMap((point) => {
      const record = asRecord(point);
      const x = Number(record.x); const y = Number(record.y);
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [{ x, y }] : [];
    })).filter((contour) => contour.length >= 6);
    return [{ id: asText(item.id, `layer-${index + 1}`), label, category: asText(item.category, "object"), rect, contours, confidence: asConfidence(item.confidence) }];
  });
}

export type ResearchCandidate = { title: string; domain: string; url: string; quote: string; reason: string; searchTerms: string[] };

/** Results are intentionally ephemeral; a candidate becomes a source only after the user accepts it. */
export async function researchWithQwen(input: { brief: string; limit: number }, config: ProviderConfig): Promise<ResearchCandidate[]> {
  assertProviderConfig(config);
  if (config.provider !== "qwen" && config.provider !== "gateway") throw new Error("当前模型不支持灵感联网搜索");
  const prompt = [
    "基于联网搜索，为设计师找公开可访问的视觉参考候选。只返回 JSON，不要解释。",
    `返回 ${input.limit} 条以内。每条必须有来自搜索结果的真实 https URL，不能编造 URL、标题、引文或网页内容。`,
    "严格结构：{\"candidates\":[{\"title\":\"页面标题\",\"domain\":\"example.com\",\"url\":\"https://example.com\",\"quote\":\"不超过80字的页面片段\",\"reason\":\"适配理由\",\"searchTerms\":[\"词\"]}]}",
    "需求：" + input.brief,
  ].join("\n");
  const searchOptions = config.provider === "gateway"
    ? { tools: [{ type: "vercel:perplexity_search", config: { query: input.brief.slice(0, 240), max_results: Math.min(input.limit, 8) } }] }
    : { enable_search: true };
  const raw = await requestJson([{ role: "user", content: prompt }], config, { ...searchOptions, max_tokens: 1_200 }, 12_000);
  const seen = new Set<string>();
  return asArray(asRecord(raw).candidates).flatMap((value) => {
    const item = asRecord(value); const url = asText(item.url);
    if (!/^https:\/\//i.test(url) || seen.has(url)) return [];
    try { new URL(url); } catch { return []; }
    seen.add(url);
    const title = asText(item.title); if (!title) return [];
    return [{ title: title.slice(0, 180), domain: asText(item.domain, new URL(url).hostname).slice(0, 180), url, quote: asText(item.quote).slice(0, 300), reason: asText(item.reason).slice(0, 280), searchTerms: asArray(item.searchTerms).map((term) => asText(term)).filter(Boolean).slice(0, 8) }];
  }).slice(0, input.limit);
}
export async function generateTextWithProvider(messages: TextMessage[], config: ProviderConfig, options: { maxTokens?: number; timeoutMs?: number } = {}) {
  assertProviderConfig(config);
  const controller = new AbortController();
  const maxTokens = options.maxTokens ?? 2_200;
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
  try {
    if (config.provider === "anthropic") {
      const response = await fetch(config.baseUrl.replace(/\/$/, "") + "/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: config.model, max_tokens: maxTokens, messages }),
      });
      if (!response.ok) throw await providerRequestError(response, config);
      const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
      const text = payload.content?.find((item) => item.type === "text")?.text;
      if (!text) throw new Error("模型没有返回设计建议");
      return text.trim();
    }
    const response = await fetch(config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: "Bearer " + config.apiKey },
      body: JSON.stringify({ model: config.model, messages, ...(config.provider === "openai" ? { max_completion_tokens: maxTokens, reasoning_effort: "low" } : { max_tokens: maxTokens }) }),
    });
    if (!response.ok) throw await providerRequestError(response, config);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("模型没有返回设计建议");
    return text.trim();
  } catch (error) {
    if (isAbortError(error)) throw new Error("模型响应超时，请重试或更换响应更快的模型。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(messages: Array<Record<string, unknown>>, config: ProviderConfig, options: Record<string, unknown> = {}, timeoutMs = 240_000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestRaw = async (requestMessages: Array<Record<string, unknown>>) => {
      if (config.provider === "anthropic") {
        const response = await fetch(config.baseUrl.replace(/\/$/, "") + "/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 3_500,
            messages: toAnthropicMessages(requestMessages),
            ...options,
          }),
        });
        if (!response.ok) throw await providerRequestError(response, config);
        const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
        const raw = payload.content?.find((item) => item.type === "text")?.text;
        if (!raw) throw new Error("模型没有返回分析结果");
        return raw;
      }

      const response = await fetch(config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: "Bearer " + config.apiKey },
        body: JSON.stringify({ model: config.model, messages: requestMessages, ...(config.provider === "openai" ? { max_completion_tokens: 8_000, reasoning_effort: "low" } : { max_tokens: 3_500 }), response_format: { type: "json_object" }, ...options }),
      });
      if (!response.ok) throw await providerRequestError(response, config);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = payload.choices?.[0]?.message?.content;
      if (!raw) throw new Error("模型没有返回分析结果");
      return raw;
    };

    const raw = await requestRaw(messages);
    try {
      return parseModelJson(raw);
    } catch {
      const repairedRaw = await requestRaw([{
        role: "user",
        content: [
          "把下面内容修复为一个可被 JSON.parse 读取的 JSON 对象。",
          "保留原字段和值，不要解释，不要使用 Markdown，不要添加 JSON 之外的文字。",
          raw.slice(0, 28_000),
        ].join("\n\n"),
      }]);
      return parseModelJson(repairedRaw);
    }
  } catch (error) {
    if (isAbortError(error)) throw new Error("拆解超时，请重试。");
    throw error;
  } finally { clearTimeout(timer); }
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|timed? out|timeout/i.test(error.message));
}

async function providerRequestError(response: Response, config: ProviderConfig) {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } | string; message?: string };
  const raw = typeof payload.error === "string" ? payload.error : payload.error?.message ?? payload.message ?? "";
  const detail = String(raw).replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏]").slice(0, 180);
  if (response.status === 401) {
    if (config.provider === "moonshot") return new Error("Kimi API Key 无效。请确认它来自 Kimi API 开放平台，而不是 Kimi 会员或 Kimi Code。");
    return new Error("API Key 无效或已失效，请前往对应开放平台重新创建。");
  }
  if (response.status === 403) return new Error("当前 API Key 没有使用该模型的权限。");
  if (response.status === 404) return new Error(`模型 ${config.model} 当前不可用，请改用该平台现有模型。`);
  if (response.status === 429) return new Error("模型服务额度不足或请求过于频繁，请检查余额后重试。");
  return new Error(detail ? `模型服务返回 ${response.status}：${detail}` : `模型服务连接失败（${response.status}）`);
}

function toAnthropicMessages(messages: Array<Record<string, unknown>>) {
  return messages.map((message) => {
    const content = message.content;
    if (!Array.isArray(content)) return { role: message.role, content };
    const blocks: Array<Record<string, unknown>> = [];
    for (const block of content) {
      const item = asRecord(block);
      if (item.type === "text") blocks.push({ type: "text", text: asText(item.text) });
      if (item.type === "image_url") {
        const image = asRecord(item.image_url);
        const value = asText(image.url);
        const match = value.match(/^data:([^;]+);base64,(.+)$/);
        if (match) blocks.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
      }
    }
    return { role: message.role, content: blocks };
  });
}
function buildMessages(input: AnalyzeInput) {
  const prompt = [
    "你是专业 UI、品牌与产品设计系统分析师。只返回 JSON。",
    analysisSchemaGuide(input.assetId),
    "principles 必须为 1-8 条可执行规则。所有 confidence 范围 0-1。",
    "components 的 rect 使用 0-1 归一化坐标，字段为 x、y、width、height；无法可靠定位时不要虚构区域。",
    "字体无法精确确认时 inferred=true。只描述素材真实存在的信息，不添加功能和营销文案。",
    "素材 ID：" + input.assetId, "标题：" + input.title, "文本：" + (input.text ?? "").slice(0, 16_000),
    "计算样式：" + JSON.stringify(input.computedStyles ?? []).slice(0, 16_000),
  ].join("\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (input.imageDataUrl) content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  return [{ role: "user", content }];
}
export function normalizeAnalysisPayload(value: unknown, assetId: string): unknown {
  const raw = asRecord(value);
  const allowedCategories = new Set(["style", "mood", "industry", "pattern"]);
  const allowedComponentTypes = new Set(["button", "card", "input", "navigation", "icon", "image", "text", "other"]);

  const copy = asArray(raw.copy).flatMap((item) => {
    if (typeof item === "string") return [{ text: item, role: "reference" }];
    const entry = asRecord(item);
    const value = asText(entry.text ?? entry.value ?? entry.copy);
    return value ? [{ text: value, role: asText(entry.role, "reference"), ...(entry.sourceRegion ? { sourceRegion: asText(entry.sourceRegion) } : {}) }] : [];
  });
  const tags = asArray(raw.tags).flatMap((item) => {
    if (typeof item === "string") return [{ value: item, category: "style", confidence: .5 }];
    const entry = asRecord(item);
    const tag = asText(entry.value ?? entry.name ?? entry.label);
    if (!tag) return [];
    const category = asText(entry.category, "style");
    return [{ value: tag, category: allowedCategories.has(category) ? category : "style", confidence: asConfidence(entry.confidence) }];
  });
  const palette = asArray(raw.palette ?? raw.colors).flatMap((item) => {
    const entry = asRecord(item);
    const color = normalizeHex(typeof item === "string" ? item : entry.hex ?? entry.value ?? entry.code ?? entry.color);
    if (!color) return [];
    return [{
      hex: color,
      ratio: clamp(asNumber(entry.ratio ?? entry.proportion, 0), 0, 1),
      role: asText(entry.role ?? entry.name, "参考色"),
      confidence: asConfidence(entry.confidence),
    }];
  });
  const typography = asArray(raw.typography ?? raw.fonts).flatMap((item) => {
    const entry = asRecord(item);
    const familyGuess = typeof item === "string" ? item : asText(entry.familyGuess ?? entry.family ?? entry.name);
    if (!familyGuess) return [];
    const weight = asOptionalNumber(entry.weight);
    return [{
      familyGuess,
      role: asText(entry.role, "正文"),
      ...(weight === undefined ? {} : { weight: Math.round(clamp(weight, 100, 900) / 100) * 100 }),
      confidence: asConfidence(entry.confidence),
      inferred: typeof entry.inferred === "boolean" ? entry.inferred : true,
    }];
  });
  const spacingRaw = asRecord(raw.spacing);
  const spacingValues = asArray(Array.isArray(raw.spacing) ? raw.spacing : spacingRaw.values)
    .map((item) => asNumber(item, Number.NaN))
    .filter((item) => Number.isFinite(item) && item >= 0);
  const layoutRaw = asRecord(raw.layout);
  const layoutDescription = typeof raw.layout === "string"
    ? raw.layout
    : asText(layoutRaw.description ?? layoutRaw.summary);
  const components = asArray(raw.components ?? raw.regions).flatMap((item, index) => {
    const entry = asRecord(item);
    const rectRaw = asRecord(entry.rect ?? entry.bounds ?? entry.bbox);
    const rect = {
      x: clamp(asNumber(rectRaw.x, 0), 0, 1),
      y: clamp(asNumber(rectRaw.y, 0), 0, 1),
      width: clamp(asNumber(rectRaw.width ?? rectRaw.w, 0), 0, 1),
      height: clamp(asNumber(rectRaw.height ?? rectRaw.h, 0), 0, 1),
    };
    if (!rect.width || !rect.height) return [];
    const type = asText(entry.type, "other");
    return [{
      id: asText(entry.id, `region-${index + 1}`),
      type: allowedComponentTypes.has(type) ? type : "other",
      label: asText(entry.label ?? entry.name, "未命名元素"),
      rect,
      confidence: asConfidence(entry.confidence),
      confirmed: typeof entry.confirmed === "boolean" ? entry.confirmed : false,
    }];
  });
  const accessibility = asArray(raw.accessibility).flatMap((item) => {
    if (typeof item === "string") return [{ level: "info", message: item }];
    const entry = asRecord(item);
    const message = asText(entry.message ?? entry.text);
    if (!message) return [];
    return [{
      level: entry.level === "warning" ? "warning" : "info",
      message,
      ...(entry.sourceRegion ? { sourceRegion: asText(entry.sourceRegion) } : {}),
    }];
  });

  return {
    ...raw,
    schemaVersion: 2,
    summary: asText(raw.summary ?? raw.description),
    purpose: asArray(raw.purpose).map((item) => asText(item)).filter(Boolean),
    principles: asArray(raw.principles).map((item) => asText(item)).filter(Boolean),
    copy,
    tags,
    palette,
    typography,
    spacing: {
      ...(asOptionalNumber(spacingRaw.base) === undefined ? {} : { base: asOptionalNumber(spacingRaw.base) }),
      values: spacingValues,
      confidence: asConfidence(spacingRaw.confidence),
    },
    radii: asArray(raw.radii ?? raw.borderRadius).map((item) => asNumber(item, Number.NaN)).filter((item) => Number.isFinite(item) && item >= 0),
    shadows: asArray(raw.shadows).map((item) => asText(item)).filter(Boolean),
    layout: {
      description: layoutDescription,
      ...(layoutRaw.grid ? { grid: asText(layoutRaw.grid) } : {}),
      confidence: asConfidence(layoutRaw.confidence),
    },
    components,
    accessibility,
    sourceAssetId: assetId,
  };
}

function analysisSchemaGuide(assetId: string) {
  return [
    "严格返回以下 JSON 对象结构，数组元素不得简写成字符串（purpose、principles、radii、shadows 除外）：",
    JSON.stringify({
      schemaVersion: 2,
      summary: "一句中文摘要",
      purpose: ["用途"],
      principles: ["可执行设计规则"],
      copy: [{ text: "原文", role: "headline", sourceRegion: "可选区域ID" }],
      tags: [{ value: "标签", category: "style|mood|industry|pattern", confidence: 0.8 }],
      palette: [{ hex: "#RRGGBB", ratio: 0.5, role: "主色", confidence: 0.8 }],
      typography: [{ familyGuess: "字体推断", role: "正文", weight: 400, confidence: 0.5, inferred: true }],
      spacing: { base: 8, values: [8, 16, 24], confidence: 0.7 },
      radii: [8, 16],
      shadows: ["0 8px 24px rgba(0,0,0,.12)"],
      layout: { description: "布局说明", grid: "可选网格说明", confidence: 0.8 },
      components: [{ id: "region-1", type: "button|card|input|navigation|icon|image|text|other", label: "元素名", rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, confidence: 0.8, confirmed: false }],
      accessibility: [{ level: "info|warning", message: "提醒", sourceRegion: "可选区域ID" }],
      sourceAssetId: assetId,
    }),
  ].join("\n");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}
function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : fallback;
}
function asNumber(value: unknown, fallback: number) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return fallback;
}
function asOptionalNumber(value: unknown) {
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function asConfidence(value: unknown) {
  return clamp(asNumber(value, .5), 0, 1);
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function normalizeHex(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(clean)) return ("#" + clean.slice(1).split("").map((part) => part + part).join("")).toUpperCase();
  return "";
}

export function parseModelJson(value: string): unknown {
  const cleaned = value
    .replace(/^\uFEFF/, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fenced = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
  const extracted = extractBalancedJson(cleaned);
  const candidates = [cleaned, ...fenced, extracted].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try { return JSON.parse(parsed); } catch { continue; }
      }
      return parsed;
    } catch {
      // Try the next safe extraction strategy.
    }
  }
  throw new Error("模型返回的 JSON 无法解析");
}

function extractBalancedJson(value: string) {
  const start = value.search(/[\[{]/);
  if (start < 0) return "";
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") stack.push(character);
    if (character === "}" || character === "]") {
      const opening = stack.pop();
      if ((character === "}" && opening !== "{") || (character === "]" && opening !== "[")) return "";
      if (!stack.length) return value.slice(start, index + 1);
    }
  }
  return "";
}
export async function encryptApiKey(apiKey: string, hexKey: string) {
  const keyBytes = fromHex(hexKey); if (keyBytes.length !== 32) throw new Error("AI_CREDENTIAL_KEY 必须为 32 字节十六进制密钥");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(apiKey)));
  const tag = encrypted.slice(-16); const ciphertext = encrypted.slice(0, -16);
  return { ciphertext: Buffer.from(ciphertext).toString("base64"), iv: Buffer.from(iv).toString("base64"), authTag: Buffer.from(tag).toString("base64") };
}
export async function decryptApiKey(payload: { ciphertext: string; iv: string; authTag: string }, hexKey: string) {
  const key = await crypto.subtle.importKey("raw", fromHex(hexKey), "AES-GCM", false, ["decrypt"]);
  const encrypted = Buffer.concat([Buffer.from(payload.ciphertext, "base64"), Buffer.from(payload.authTag, "base64")]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(payload.iv, "base64") }, key, encrypted);
  return new TextDecoder().decode(clear);
}
function fromHex(value: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}
