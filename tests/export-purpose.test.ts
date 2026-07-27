import assert from "node:assert/strict";
import test from "node:test";
import { exportFilesByPurpose, exportRequestSchema } from "../packages/domain/src/index";

test("导出任务必须选择明确生产目标", () => {
  assert.equal(exportRequestSchema.parse({ boardId: "board-1", purpose: "web-rebuild" }).purpose, "web-rebuild");
  const routed = exportRequestSchema.parse({ boardId: "board-1", purpose: "campaign-system", goal: "scale", destination: "figma-buzz" });
  assert.equal(routed.goal, "scale");
  assert.equal(routed.destination, "figma-buzz");
  assert.throws(() => exportRequestSchema.parse({ boardId: "board-1", purpose: "mixed-zip" }));
  assert.throws(() => exportRequestSchema.parse({ boardId: "board-1", purpose: "campaign-system", goal: "scale", destination: "unknown-tool" }));
});

test("四类任务包不混入无关文件", () => {
  assert.ok(exportFilesByPurpose["web-rebuild"].includes("DESIGN.md"));
  assert.ok(exportFilesByPurpose["visual-remix"].includes("IMAGE_PROMPT.md"));
  assert.ok(!exportFilesByPurpose["visual-remix"].includes("variables.css"));
  assert.ok(exportFilesByPurpose["campaign-system"].includes("content-schema.json"));
  assert.ok(exportFilesByPurpose["figma-bridge"].includes("figma-import.json"));
});
