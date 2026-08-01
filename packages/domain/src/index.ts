import { z } from "zod";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;
export const MAX_ASSETS_PER_USER = 500;
export const assetKinds = ["image", "web", "text"] as const;
export const canvasItemTypes = ["image", "web", "text", "analysis", "element", "group"] as const;
export const relationTypes = ["analysis-of", "element-of", "contract-derived-from", "similar-style", "same-component", "complements", "contrasts", "same-project"] as const;
export const relationLayers = ["provenance", "association"] as const;
export const relationStatuses = ["confirmed", "suggested", "rejected"] as const;
export const exportPurposes = ["web-rebuild", "visual-remix", "campaign-system", "figma-bridge"] as const;
export const productionGoals = ["recreate", "explore", "scale"] as const;
export const exportDestinations = ["figma-design", "coding-ai", "image-ai", "figma-make", "figma-buzz"] as const;
export const providerIds = ["openai", "anthropic", "gemini", "qwen", "deepseek", "moonshot", "zhipu", "doubao", "minimax"] as const;

export type AssetKind = (typeof assetKinds)[number];
export type CanvasItemType = (typeof canvasItemTypes)[number];
export type RelationType = (typeof relationTypes)[number];
export type RelationLayer = (typeof relationLayers)[number];
export type RelationStatus = (typeof relationStatuses)[number];
export type JobStatus = "queued" | "processing" | "ready" | "failed";
export type ExportPurpose = (typeof exportPurposes)[number];
export type ProductionGoal = (typeof productionGoals)[number];
export type ExportDestination = (typeof exportDestinations)[number];
export type ProviderId = (typeof providerIds)[number];

export const providerCatalog: Record<ProviderId, {
  label: string;
  description: string;
  platformUrl: string;
  models: readonly string[];
  supportsVision: boolean;
}> = {
  openai: {
    label: "OpenAI",
    description: "适合网页、图片和文字拆解",
    platformUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-5.6-terra"],
    supportsVision: true,
  },
  anthropic: {
    label: "Anthropic Claude",
    description: "适合视觉理解与长文档分析",
    platformUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-1-20250805"],
    supportsVision: true,
  },
  gemini: {
    label: "Google Gemini",
    description: "适合多模态参考与长上下文",
    platformUrl: "https://aistudio.google.com/apikey",
    models: ["gemini-3.6-flash", "gemini-3.6-pro"],
    supportsVision: true,
  },
  qwen: {
    label: "阿里云百炼 · Qwen",
    description: "中文视觉分析与结构化输出",
    platformUrl: "https://bailian.console.aliyun.com/",
    models: ["qwen3.7-plus", "qwen3.6-flash", "qwen3.6-plus", "qwen3-vl-plus"],
    supportsVision: true,
  },
  deepseek: {
    label: "DeepSeek",
    description: "用于文字参考、规范合并与 QA",
    platformUrl: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner"],
    supportsVision: false,
  },
  moonshot: {
    label: "Moonshot · Kimi",
    description: "适合中文长上下文与视觉参考",
    platformUrl: "https://platform.kimi.com/",
    models: ["kimi-k3", "kimi-k2.6", "kimi-k2.7-code", "moonshot-v1-128k-vision-preview"],
    supportsVision: true,
  },
  zhipu: {
    label: "智谱开放平台 · GLM",
    description: "GLM 视觉与文本模型",
    platformUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: ["glm-4.5v", "glm-5", "glm-4.7"],
    supportsVision: true,
  },
  doubao: {
    label: "火山方舟 · 豆包",
    description: "视觉理解与中文内容分析",
    platformUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apikey",
    models: ["doubao-seed-2-0-lite-260215", "doubao-seed-2-0-pro-260215"],
    supportsVision: true,
  },
  minimax: {
    label: "MiniMax",
    description: "用于文字规范、总结和一致性 QA",
    platformUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5"],
    supportsVision: false,
  },
};

export const rectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
export const componentRegionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["button", "card", "input", "navigation", "icon", "image", "text", "other"]),
  label: z.string().min(1), rect: rectSchema,
  confidence: z.number().min(0).max(1), confirmed: z.boolean().default(false),
});

export const analysisResultSchema = z.object({
  schemaVersion: z.literal(2).default(2), summary: z.string().min(1), purpose: z.array(z.string()).max(8),
  principles: z.array(z.string()).min(1).max(8),
  copy: z.array(z.object({ text: z.string(), role: z.string(), sourceRegion: z.string().optional() })).max(40),
  tags: z.array(z.object({ value: z.string(), category: z.enum(["style", "mood", "industry", "pattern"]), confidence: z.number().min(0).max(1) })).max(30),
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), ratio: z.number().min(0).max(1), role: z.string(), confidence: z.number().min(0).max(1) })).min(1).max(12),
  typography: z.array(z.object({ familyGuess: z.string(), role: z.string(), weight: z.number().int().min(100).max(900).optional(), confidence: z.number().min(0).max(1), inferred: z.boolean() })).max(12),
  spacing: z.object({ base: z.number().positive().optional(), values: z.array(z.number().nonnegative()), confidence: z.number().min(0).max(1) }),
  radii: z.array(z.number().nonnegative()), shadows: z.array(z.string()),
  layout: z.object({ description: z.string(), grid: z.string().optional(), confidence: z.number().min(0).max(1) }),
  components: z.array(componentRegionSchema).max(80),
  accessibility: z.array(z.object({ level: z.enum(["info", "warning"]), message: z.string(), sourceRegion: z.string().optional() })),
  sourceAssetId: z.string().min(1), analyzedAt: z.string().datetime().optional(),
  model: z.object({ provider: z.enum(providerIds), id: z.string() }).optional(),
  promptVersion: z.string().optional(),
  runMode: z.enum(["managed", "byok"]).optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type ComponentRegion = z.infer<typeof componentRegionSchema>;

export const clipPayloadSchema = z.object({
  boardId: z.string().min(1).optional(),
  url: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "仅支持 HTTP(S)"),
  title: z.string().trim().min(1).max(500),
  screenshotParts: z.array(z.object({ index: z.number().int().nonnegative(), width: z.number().int().positive().max(10_000), height: z.number().int().positive().max(20_000), dataUrl: z.string().startsWith("data:image/") })).max(30),
  readableText: z.string().max(MAX_TEXT_LENGTH),
  styles: z.array(z.object({ selectorHint: z.string().max(300), role: z.string().max(100), rect: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }), style: z.record(z.string(), z.string()) })).max(300),
});

export type ClipPayload = z.infer<typeof clipPayloadSchema>;
export const relationSchema = z.object({
  id: z.string().min(1), sourceId: z.string().min(1), targetId: z.string().min(1), type: z.enum(relationTypes),
  layer: z.enum(relationLayers), status: z.enum(relationStatuses).default("confirmed"), origin: z.enum(["human", "ai", "system"]),
  explanation: z.string().max(500).optional(), score: z.number().min(0).max(1).optional(),
});
export type Relation = z.infer<typeof relationSchema>;
export const sceneNodeSchema = z.object({
  id: z.string().min(1), kind: z.enum(canvasItemTypes), position: z.object({ x: z.number(), y: z.number() }),
  width: z.number().min(120).max(2400), height: z.number().min(44).max(2400), parentId: z.string().optional(),
  pinned: z.boolean().optional(), collapsed: z.boolean().optional(), data: z.record(z.string(), z.unknown()),
});
export const boardSceneSchema = z.object({
  schemaVersion: z.literal(2), nodes: z.array(sceneNodeSchema).max(500), relations: z.array(relationSchema).max(2_000),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().min(0.05).max(4) }).optional(),
});
export type BoardSceneV2 = z.infer<typeof boardSceneSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export const EMPTY_SCENE: BoardSceneV2 = { schemaVersion: 2, nodes: [], relations: [], viewport: { x: 0, y: 0, zoom: 1 } };
export const designContractSchema = z.object({
  schemaVersion: z.literal(1).default(1), title: z.string().min(1), principles: z.array(z.string()).min(1).max(8),
  tokens: z.object({ colors: z.array(z.object({ name: z.string(), value: z.string(), sourceAssetIds: z.array(z.string()) })), spacing: z.array(z.number()), radii: z.array(z.number()), shadows: z.array(z.string()) }),
  components: z.array(z.object({ name: z.string(), rules: z.array(z.string()), sourceAssetIds: z.array(z.string()) })),
  dos: z.array(z.string()), donts: z.array(z.string()), conflicts: z.array(z.string()), unresolved: z.array(z.string()),
  sourceAssetIds: z.array(z.string()), generatedAt: z.string(),
});
export type DesignContract = z.infer<typeof designContractSchema>;
export interface OrganizeProposal { id: string; boardId: string; baseVersion: number; groups: Array<{ id: string; title: string; memberIds: string[] }>; positions: Record<string, { x: number; y: number; parentId?: string }>; suggestedRelations: Relation[]; }
export const exportRequestSchema = z.object({
  boardId: z.string().min(1),
  purpose: z.enum(exportPurposes),
  goal: z.enum(productionGoals).optional(),
  destination: z.enum(exportDestinations).optional(),
  format: z.enum(["quick", "full"]).default("full"),
});
export const exportFilesByPurpose: Record<ExportPurpose, string[]> = {
  "web-rebuild": ["DESIGN.md", "STRUCTURE.md", "MAPPING.md", "IMPLEMENTATION_PROMPT.md", "tokens/tokens.json", "tokens/variables.css", "components.md", "STRUCTURE_QA.md", "DESIGN_QA.md", "sources.json"],
  "visual-remix": ["IMAGE_PROMPT.md", "PROMPT_VARIANTS.md", "NEGATIVE_PROMPT.md", "palette.json", "composition.md", "sources.json"],
  "campaign-system": ["DESIGN.md", "CAMPAIGN_SYSTEM.md", "PAGE_BRIEF_TEMPLATE.md", "content-schema.json", "components.md", "QA_CHECKLIST.md", "tokens/tokens.json", "tokens/variables.css", "sources.json"],
  "figma-bridge": ["DESIGN.md", "figma-import.json", "FIGMA_IMPORT.md", "tokens.json", "sources.json", "components/README.md", "figma-plugin/manifest.json", "figma-plugin/code.js", "figma-plugin/ui.html"],
};
export interface DesignPackage { id: string; boardId: string; purpose: ExportPurpose; files: string[]; sourceAssetIds: string[]; generatedAt: string; }

export function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (["localhost", "0.0.0.0", "::1", "169.254.169.254"].includes(host)) return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./); if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return !host.endsWith(".internal");
  } catch { return false; }
}

export function migrateBoardScene(value: unknown): BoardSceneV2 {
  const parsed = boardSceneSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (!value || typeof value !== "object") return structuredClone(EMPTY_SCENE);
  const legacy = value as { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>>; viewport?: BoardSceneV2["viewport"] };
  const nodes = (legacy.nodes ?? []).map((node) => {
    const data = (node.data && typeof node.data === "object" ? node.data : {}) as Record<string, unknown>;
    const kind = canvasItemTypes.includes(data.kind as CanvasItemType) ? data.kind as CanvasItemType : "text";
    const position = node.position && typeof node.position === "object" ? node.position as { x?: unknown; y?: unknown } : {};
    const style = node.style && typeof node.style === "object" ? node.style as { width?: unknown; height?: unknown } : {};
    return {
      id: String(node.id ?? crypto.randomUUID()), kind,
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
      width: Math.max(120, Number(style.width ?? node.width) || (kind === "analysis" ? 340 : 286)),
      height: Math.max(44, Number(style.height ?? node.height) || (kind === "group" ? 520 : 180)),
      parentId: typeof node.parentId === "string" ? node.parentId : undefined, data,
    } satisfies SceneNode;
  });
  const relations = (legacy.edges ?? []).flatMap((edge, index) => {
    if (typeof edge.source !== "string" || typeof edge.target !== "string") return [];
    const label = String(edge.label ?? "");
    const provenance = /分析|拆分|来源/.test(label);
    return [{
      id: String(edge.id ?? "relation-" + index), sourceId: edge.source, targetId: edge.target,
      type: label.includes("分析") ? "analysis-of" : label.includes("拆分") ? "element-of" : "similar-style",
      layer: provenance ? "provenance" : "association", status: "confirmed", origin: "human",
    } satisfies Relation];
  });
  return { schemaVersion: 2, nodes, relations: dedupeRelations(relations), viewport: legacy.viewport };
}

export function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const directional = relation.layer === "provenance" || relation.type === "complements";
    const endpoints = directional ? `${relation.sourceId}:${relation.targetId}` : [relation.sourceId, relation.targetId].sort().join(":");
    const key = `${endpoints}:${relation.type}`;
    if (seen.has(key) || relation.sourceId === relation.targetId) return false;
    seen.add(key); return true;
  });
}

export function assertProposalVersion(proposal: OrganizeProposal, currentVersion: number): void {
  if (proposal.baseVersion !== currentVersion) throw new Error("画布已发生变化，请重新生成整理预览");
}
