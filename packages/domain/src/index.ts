import { z } from "zod";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;
export const MAX_ASSETS_PER_USER = 500;
export const PLATFORM_ANALYSIS_QUOTA = 30;

export const assetKinds = ["image", "web", "text"] as const;
export const canvasItemTypes = ["image", "web", "text", "analysis", "element", "group"] as const;
export const relationTypes = ["similar-style", "same-component", "same-project", "supports", "contrasts", "derived-from"] as const;
export const exportPurposes = ["web-rebuild", "visual-remix", "campaign-system", "figma-bridge"] as const;

export type AssetKind = (typeof assetKinds)[number];
export type CanvasItemType = (typeof canvasItemTypes)[number];
export type RelationType = (typeof relationTypes)[number];
export type JobStatus = "queued" | "processing" | "ready" | "failed";
export type ExportPurpose = (typeof exportPurposes)[number];

export const rectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
export const componentRegionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["button", "card", "input", "navigation", "icon", "image", "text", "other"]),
  label: z.string().min(1), rect: rectSchema,
  confidence: z.number().min(0).max(1), confirmed: z.boolean().default(false),
});

export const analysisResultSchema = z.object({
  summary: z.string().min(1), purpose: z.array(z.string()).max(8),
  copy: z.array(z.object({ text: z.string(), role: z.string(), sourceRegion: z.string().optional() })).max(40),
  tags: z.array(z.object({ value: z.string(), category: z.enum(["style", "mood", "industry", "pattern"]), confidence: z.number().min(0).max(1) })).max(30),
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), ratio: z.number().min(0).max(1), role: z.string(), confidence: z.number().min(0).max(1) })).min(1).max(12),
  typography: z.array(z.object({ familyGuess: z.string(), role: z.string(), weight: z.number().int().min(100).max(900).optional(), confidence: z.number().min(0).max(1), inferred: z.literal(true) })).max(12),
  spacing: z.object({ base: z.number().positive().optional(), values: z.array(z.number().nonnegative()), confidence: z.number().min(0).max(1) }),
  radii: z.array(z.number().nonnegative()), shadows: z.array(z.string()),
  layout: z.object({ description: z.string(), grid: z.string().optional(), confidence: z.number().min(0).max(1) }),
  components: z.array(componentRegionSchema).max(80),
  accessibility: z.array(z.object({ level: z.enum(["info", "warning"]), message: z.string(), sourceRegion: z.string().optional() })),
  sourceAssetId: z.string().min(1),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type ComponentRegion = z.infer<typeof componentRegionSchema>;

export const clipPayloadSchema = z.object({
  url: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "仅支持 HTTP(S)"),
  title: z.string().trim().min(1).max(500),
  screenshotParts: z.array(z.object({ index: z.number().int().nonnegative(), width: z.number().int().positive().max(10_000), height: z.number().int().positive().max(20_000), dataUrl: z.string().startsWith("data:image/") })).max(30),
  readableText: z.string().max(MAX_TEXT_LENGTH),
  styles: z.array(z.object({ selectorHint: z.string().max(300), role: z.string().max(100), rect: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }), style: z.record(z.string(), z.string()) })).max(300),
});

export type ClipPayload = z.infer<typeof clipPayloadSchema>;
export interface CanvasCardData { title: string; body?: string; sourceUrl?: string; imageUrl?: string; tags?: string[]; colors?: string[]; status?: JobStatus | "idle"; analysis?: AnalysisResult; parentAssetId?: string; }
export interface CanvasItem { id: string; type: CanvasItemType; x: number; y: number; width: number; height: number; data: CanvasCardData; }
export interface Relation { id: string; sourceId: string; targetId: string; type: RelationType; origin: "human" | "ai"; score?: number; }
export interface OrganizeProposal { id: string; boardId: string; baseVersion: number; groups: Array<{ id: string; title: string; memberIds: string[] }>; positions: Record<string, { x: number; y: number }>; suggestedRelations: Relation[]; }
export const exportRequestSchema = z.object({ boardId: z.string().min(1), purpose: z.enum(exportPurposes) });
export const exportFilesByPurpose: Record<ExportPurpose, string[]> = {
  "web-rebuild": ["DESIGN.md", "REBUILD_PROMPT.md", "STRUCTURE.md", "tokens/tokens.json", "tokens/variables.css", "components.md", "QA_CHECKLIST.md", "sources.json"],
  "visual-remix": ["IMAGE_PROMPT.md", "PROMPT_VARIANTS.md", "NEGATIVE_PROMPT.md", "palette.json", "composition.md", "sources.json"],
  "campaign-system": ["DESIGN.md", "CAMPAIGN_SYSTEM.md", "PAGE_BRIEF_TEMPLATE.md", "content-schema.json", "components.md", "QA_CHECKLIST.md", "tokens/tokens.json", "tokens/variables.css", "sources.json"],
  "figma-bridge": ["DESIGN.md", "figma-import.json", "FIGMA_IMPORT.md", "tokens.json", "sources.json", "elements/README.md"],
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

export function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const directional = relation.type === "supports" || relation.type === "derived-from";
    const endpoints = directional ? `${relation.sourceId}:${relation.targetId}` : [relation.sourceId, relation.targetId].sort().join(":");
    const key = `${endpoints}:${relation.type}`;
    if (seen.has(key) || relation.sourceId === relation.targetId) return false;
    seen.add(key); return true;
  });
}

export function assertProposalVersion(proposal: OrganizeProposal, currentVersion: number): void {
  if (proposal.baseVersion !== currentVersion) throw new Error("画布已发生变化，请重新生成整理预览");
}
