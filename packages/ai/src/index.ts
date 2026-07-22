import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { analysisResultSchema, type AnalysisResult } from "@inspoatlas/domain";

export type ProviderId = "openai" | "qwen" | "deepseek";

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AnalyzeInput {
  assetId: string;
  title: string;
  text?: string;
  imageDataUrl?: string;
  computedStyles?: Record<string, string>[];
}

const ENDPOINTS: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com/v1",
};

export async function analyzeWithProvider(input: AnalyzeInput, config: ProviderConfig): Promise<AnalysisResult> {
  const baseUrl = config.baseUrl ?? ENDPOINTS[config.provider];
  if (!Object.values(ENDPOINTS).some((endpoint) => baseUrl.startsWith(endpoint))) {
    throw new Error("模型端点不在允许列表中");
  }

  const messages = [{
    role: "user",
    content: [
      { type: "text", text: buildPrompt(input) },
      ...(input.imageDataUrl ? [{ type: "image_url", image_url: { url: input.imageDataUrl } }] : []),
    ],
  }];

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.1, response_format: { type: "json_object" } }),
  });
  if (!response.ok) throw new Error(`模型请求失败 (${response.status})`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("模型未返回分析结果");

  const parsed = safeJson(raw);
  const first = analysisResultSchema.safeParse(parsed);
  if (first.success) return first.data;

  const repaired = normalizeAnalysis(parsed, input.assetId);
  return analysisResultSchema.parse(repaired);
}

export function createDemoAnalysis(assetId: string): AnalysisResult {
  return {
    summary: "清透、高饱和的产品视觉，以大面积留白和玻璃质感突出核心对象。",
    purpose: ["产品视觉", "营销落地页", "氛围参考"],
    copy: [{ text: "让灵感变成可以复用的设计语言", role: "主标题" }],
    tags: [
      { value: "玻璃拟态", category: "style", confidence: 0.94 },
      { value: "清透", category: "mood", confidence: 0.91 },
      { value: "高饱和点缀", category: "pattern", confidence: 0.88 },
    ],
    palette: [
      { hex: "#F8F5F2", ratio: 0.48, role: "背景", confidence: 0.96 },
      { hex: "#E74A4A", ratio: 0.24, role: "强调", confidence: 0.93 },
      { hex: "#C6D7FF", ratio: 0.18, role: "冷色光", confidence: 0.89 },
      { hex: "#242326", ratio: 0.1, role: "正文", confidence: 0.98 },
    ],
    typography: [
      { familyGuess: "现代无衬线体", role: "标题", weight: 600, confidence: 0.72, inferred: true },
      { familyGuess: "现代无衬线体", role: "正文", weight: 400, confidence: 0.68, inferred: true },
    ],
    spacing: { base: 8, values: [8, 12, 16, 24, 32], confidence: 0.81 },
    radii: [12, 20, 28],
    shadows: ["0 18px 50px rgba(76, 65, 108, .16)"],
    layout: { description: "主体居中，辅助信息沿右侧纵向排布，使用不对称留白建立层级。", grid: "12 列弹性网格", confidence: 0.84 },
    components: [
      { id: `${assetId}-hero`, type: "image", label: "主视觉", rect: { x: 0.08, y: 0.1, width: 0.58, height: 0.72 }, confidence: 0.92, confirmed: false },
      { id: `${assetId}-cta`, type: "button", label: "主操作按钮", rect: { x: 0.7, y: 0.66, width: 0.2, height: 0.1 }, confidence: 0.86, confirmed: false },
    ],
    accessibility: [{ level: "warning", message: "浅色玻璃背景上的辅助文字需要复核对比度。" }],
    sourceAssetId: assetId,
  };
}

export function encryptApiKey(apiKey: string, hexKey: string) {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("AI_CREDENTIAL_KEY 必须为 32 字节十六进制密钥");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptApiKey(payload: { ciphertext: string; iv: string; authTag: string }, hexKey: string) {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function buildPrompt(input: AnalyzeInput) {
  return `你是 UI/产品设计分析师。只返回 JSON，必须包含 summary、purpose、copy、tags、palette、typography、spacing、radii、shadows、layout、components、accessibility、sourceAssetId。所有置信度范围 0-1；字体必须标记 inferred: true。素材 ID: ${input.assetId}；标题: ${input.title}；文本: ${(input.text ?? "").slice(0, 12000)}；计算样式: ${JSON.stringify(input.computedStyles ?? []).slice(0, 12000)}`;
}

function safeJson(value: string): unknown {
  const cleaned = value.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { return {}; }
}

function normalizeAnalysis(value: unknown, assetId: string): AnalysisResult {
  const demo = createDemoAnalysis(assetId);
  if (!value || typeof value !== "object") return demo;
  return { ...demo, ...(value as Partial<AnalysisResult>), sourceAssetId: assetId };
}

