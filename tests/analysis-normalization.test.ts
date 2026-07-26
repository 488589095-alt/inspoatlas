import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnalysisPayload } from "../packages/ai/src/index";
import { analysisResultSchema } from "../packages/domain/src/index";

test("常见的简写模型输出可归一化为分析 Schema", () => {
  const normalized = normalizeAnalysisPayload({
    summary: "深色活动页面",
    purpose: "品牌活动",
    principles: ["高对比标题"],
    copy: ["探索更多"],
    tags: ["dark", { name: "科技", category: "industry", confidence: 82 }],
    colors: ["#123", { code: "#112233", role: "背景" }],
    typography: ["Inter"],
    spacing: ["8px", 16],
    borderRadius: ["8px"],
    shadows: ["0 8px 24px rgba(0,0,0,.2)"],
    layout: "顶部导航与首屏主视觉",
    components: [{
      type: "button",
      name: "主按钮",
      bounds: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 },
    }],
    accessibility: ["检查深色背景上的正文对比度"],
  }, "asset-test");

  const parsed = analysisResultSchema.parse(normalized);
  assert.equal(parsed.sourceAssetId, "asset-test");
  assert.equal(parsed.copy[0]?.text, "探索更多");
  assert.equal(parsed.palette[0]?.hex, "#112233");
  assert.equal(parsed.components[0]?.label, "主按钮");
});

