import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("百炼模型由工作区统一配置", async () => {
  const [route, workspace, ai, domain] = await Promise.all([
    readFile(new URL("../app/api/ai-credentials/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/domain/src/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /export async function PATCH/);
  assert.match(route, /managedAiSummary/);
  assert.match(route, /AI 服务由工作区统一配置/);
  assert.match(route, /export async function DELETE/);
  assert.doesNotMatch(workspace, /deleteCredential|credentialToDelete/);
  assert.doesNotMatch(workspace, /quota-card|connectedModelLabel/);
  assert.match(domain, /models: \["kimi-k3", "kimi-k2\.6"/);
  assert.doesNotMatch(ai, /messages, temperature:/);
  assert.match(ai, /Kimi API Key 无效/);
});

test("卡片选择、检索导航、缩略图和专注浮层保持联动", async () => {
  const [workspace, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v8.css", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /onNodeClick=\{onNodeClick\}/);
  assert.match(workspace, /setRightTab\("asset"\)/);
  assert.match(workspace, /focusSearchMatch/);
  assert.match(workspace, /fitView\(\{ nodes: \[\{ id \}\]/);
  assert.match(workspace, /<MiniMap pannable zoomable/);
  assert.match(workspace, /添加节点/);
  assert.match(workspace, /<ToolbarMoreMenu onImport=/);
  assert.match(workspace, /<WorkspaceIcon name="fit" \/><small>定位/);
  assert.match(workspace, /<WorkspaceIcon name="map" \/><small>小地图/);
  assert.match(styles, /\.workspace-shell\.focus-mode \.relation-view/);
  assert.match(styles, /right: 154px !important/);
});

test("网页采集卡可以分段滚动查看完整页面", async () => {
  const [contentRoute, clipsRoute, card, styles] = await Promise.all([
    readFile(new URL("../app/api/assets/[id]/content/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clips/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v8.css", import.meta.url), "utf8"),
  ]);

  assert.match(contentRoute, /searchParams\.get\("part"\)/);
  assert.match(clipsRoute, /viewportCaptures/);
  assert.match(card, /screenshotPartCount/);
  assert.match(card, /withScreenshotPart/);
  assert.match(styles, /\.card-image\.web-shot/);
  assert.match(styles, /overflow-y: auto/);
});
