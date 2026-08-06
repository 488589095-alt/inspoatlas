import type { AnalysisResult, DesignContract } from "@/packages/domain/src";

export function buildContract(title: string, rows: Array<{ assetId: string; result: AnalysisResult }>): DesignContract {
  const principles = unique(rows.flatMap((row) => row.result.principles)).slice(0, 8);
  const colors = new Map<string, Set<string>>();
  for (const row of rows) for (const color of row.result.palette) {
    if (!colors.has(color.hex.toUpperCase())) colors.set(color.hex.toUpperCase(), new Set());
    colors.get(color.hex.toUpperCase())?.add(row.assetId);
  }
  const components = new Map<string, { rules: Set<string>; sourceAssetIds: Set<string> }>();
  for (const row of rows) for (const item of row.result.components) {
    const key = item.label || item.type; if (!components.has(key)) components.set(key, { rules: new Set(), sourceAssetIds: new Set() });
    const entry = components.get(key); entry?.rules.add(item.type + " · 区域比例 " + Math.round(item.rect.width * 100) + "%×" + Math.round(item.rect.height * 100) + "%"); entry?.sourceAssetIds.add(row.assetId);
  }
  const lowConfidenceFonts = rows.flatMap((row) => row.result.typography.filter((item) => item.confidence < .75).map((item) => item.familyGuess));
  const dominantColors = rows.map((row) => row.result.palette[0]?.hex).filter(Boolean);
  const conflicts = new Set(dominantColors).size > 3 ? ["不同参考的主色差异较大；应用前需确认主品牌色和场景色的优先级"] : [];
  const unresolved = lowConfidenceFonts.length ? ["字体为视觉推断，需在 Figma 或代码中人工确认：" + unique(lowConfidenceFonts).join("、")] : [];
  const allAssetIds = rows.map((row) => row.assetId);
  const lowConfidenceAssetIds = rows
    .filter((row) => row.result.typography.some((item) => item.confidence < .75))
    .map((row) => row.assetId);
  return {
    schemaVersion: 1, title, principles: principles.length ? principles : ["保持参考素材中反复出现的层级、比例和间距节奏"],
    tokens: {
      colors: [...colors].map(([value, ids], index) => ({ name: "color/palette-" + (index + 1), value, sourceAssetIds: [...ids] })),
      spacing: uniqueNumbers(rows.flatMap((row) => row.result.spacing.values)),
      radii: uniqueNumbers(rows.flatMap((row) => row.result.radii)),
      shadows: unique(rows.flatMap((row) => row.result.shadows)),
    },
    components: [...components].map(([name, value]) => ({ name, rules: [...value.rules], sourceAssetIds: [...value.sourceAssetIds] })),
    dos: principles.slice(0, 6),
    donts: unique(rows.flatMap((row) => row.result.accessibility.filter((item) => item.level === "warning").map((item) => item.message))),
    conflicts,
    unresolved,
    evidence: {
      principles: (principles.length ? principles : ["保持参考素材中反复出现的层级、比例和间距节奏"]).map((value) => ({
        value,
        sourceAssetIds: rows.filter((row) => row.result.principles.includes(value)).map((row) => row.assetId).filter(Boolean).length
          ? rows.filter((row) => row.result.principles.includes(value)).map((row) => row.assetId)
          : allAssetIds,
      })),
      conflicts: conflicts.map((value) => ({ value, sourceAssetIds: allAssetIds })),
      unresolved: unresolved.map((value) => ({ value, sourceAssetIds: lowConfidenceAssetIds.length ? lowConfidenceAssetIds : allAssetIds })),
    },
    review: { conflictDecisions: [], unresolvedNotes: [] },
    sourceAssetIds: allAssetIds, generatedAt: new Date().toISOString(),
  };
}
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function uniqueNumbers(values: number[]) { return [...new Set(values)].sort((a, b) => a - b); }
