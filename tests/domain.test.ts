import assert from "node:assert/strict";
import test from "node:test";
import { analysisResultSchema, assertProposalVersion, dedupeRelations, isSafePublicUrl } from "../packages/domain/src/index.ts";

test("URL 安全校验阻止私网和危险协议", () => {
  assert.equal(isSafePublicUrl("https://example.com/inspiration"), true);
  assert.equal(isSafePublicUrl("http://127.0.0.1/admin"), false);
  assert.equal(isSafePublicUrl("http://192.168.1.8"), false);
  assert.equal(isSafePublicUrl("file:///etc/passwd"), false);
});

test("关系去重保留方向性语义", () => {
  const rows = dedupeRelations([
    { id: "1", sourceId: "a", targetId: "b", type: "similar-style", origin: "ai" },
    { id: "2", sourceId: "b", targetId: "a", type: "similar-style", origin: "ai" },
    { id: "3", sourceId: "a", targetId: "b", type: "derived-from", origin: "human" },
    { id: "4", sourceId: "b", targetId: "a", type: "derived-from", origin: "human" },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["1", "3", "4"]);
});

test("整理方案拒绝过期画布版本", () => {
  const proposal = { id: "p", boardId: "b", baseVersion: 2, groups: [], positions: {}, suggestedRelations: [] };
  assert.doesNotThrow(() => assertProposalVersion(proposal, 2));
  assert.throws(() => assertProposalVersion(proposal, 3), /重新生成/);
});

test("分析 Schema 拒绝越界置信度", () => {
  const value = { summary: "x", purpose: [], copy: [], tags: [{ value: "x", category: "style", confidence: 2 }], palette: [{ hex: "#FFFFFF", ratio: 1, role: "background", confidence: 1 }], typography: [], spacing: { values: [], confidence: 1 }, radii: [], shadows: [], layout: { description: "x", confidence: 1 }, components: [], accessibility: [], sourceAssetId: "a" };
  assert.equal(analysisResultSchema.safeParse(value).success, false);
});

