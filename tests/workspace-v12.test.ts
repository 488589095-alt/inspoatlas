import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("拆解结果与方案作为可持久化画布节点串联", async () => {
  const [workspace, card, model, preview] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/boards/[id]/contracts/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /analysis-card-/);
  assert.match(workspace, /workflowStage: "contract"/);
  assert.match(workspace, /保存为方案卡/);
  assert.match(workspace, /整合所选拆解/);
  assert.match(workspace, /已选取舍（可选）/);
  assert.match(workspace, /contract-evidence/);
  assert.match(workspace, /检查证据与取舍/);
  assert.match(workspace, /workflowOverlay === "purpose"/);
  assert.match(workspace, /这批参考要帮你完成什么？/);
  assert.match(workspace, /focusEvidence/);
  assert.match(workspace, /已定位 \$\{targets\.length\} 张来源参考/);
  assert.match(card, /workflowStage === "analysis"/);
  assert.match(card, /workflowStage === "contract"/);
  assert.match(card, /待核对/);
  assert.match(card, /仅整理灵感/);
  assert.match(model, /nodes: nodes\.map/);
  assert.match(preview, /requested\.size && !requested\.has\(row\.assetId\)/);
  assert.match(preview, /brief: designBriefSchema\.optional\(\)/);
});

test("端口拖出下一步、连线文字编辑与节点搜索均在画布内", async () => {
  const [workspace, edge, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/RelationEdge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v11.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /onConnectEnd=\{\(event\) => finishConnection\(event\)\}/);
  assert.match(workspace, /className="next-step-menu"/);
  assert.match(workspace, /edgeTypes=\{edgeTypes\}/);
  assert.match(edge, /inspo:edge-label/);
  assert.match(edge, /点击修改连线说明/);
  assert.match(workspace, /node-search-results/);
  assert.match(workspace, /searchKindOptions/);
  assert.match(styles, /\.workspace-shell\.focus-mode[\s\S]*grid-template: 1fr \/ minmax\(0, 1fr\) !important/);
  assert.match(styles, /\.assistant-orb/);
  assert.match(styles, /background: var\(--desk-iris\)/);
});
