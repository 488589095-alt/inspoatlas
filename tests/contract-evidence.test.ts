import assert from "node:assert/strict";
import test from "node:test";
import { analysisResultSchema, designContractSchema } from "../packages/domain/src/index";
import { buildContract } from "../app/api/boards/[id]/contracts/_build";

function analysis(sourceAssetId: string, principle: string, color: string, fontConfidence = .92) {
  return analysisResultSchema.parse({
    summary: "测试参考", purpose: ["网页"], principles: [principle], copy: [],
    tags: [], palette: [{ hex: color, ratio: 1, role: "主色", confidence: .9 }],
    typography: [{ familyGuess: "Inter", role: "正文", confidence: fontConfidence, inferred: true }],
    spacing: { values: [8], confidence: .8 }, radii: [8], shadows: [],
    layout: { description: "单列", confidence: .8 }, components: [], accessibility: [], sourceAssetId,
  });
}

test("设计方案逐条保留证据，并兼容此前保存的方案", () => {
  const contract = buildContract("春季专题", [
    { assetId: "asset-a", result: analysis("asset-a", "标题保持紧凑层级", "#112233") },
    { assetId: "asset-b", result: analysis("asset-b", "标题保持紧凑层级", "#223344", .6) },
  ]);
  assert.deepEqual(contract.evidence.principles[0]?.sourceAssetIds, ["asset-a", "asset-b"]);
  assert.deepEqual(contract.evidence.unresolved[0]?.sourceAssetIds, ["asset-b"]);
  const legacy = designContractSchema.parse({ ...contract, evidence: undefined, review: undefined });
  assert.deepEqual(legacy.evidence, { principles: [], conflicts: [], unresolved: [] });
  assert.deepEqual(legacy.review, { conflictDecisions: [], unresolvedNotes: [] });
});
