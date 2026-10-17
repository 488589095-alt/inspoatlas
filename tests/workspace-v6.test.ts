import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("画布采用底部工具坞、单一专注入口且分析错误不会原样展示", async () => {
  const [workspace, card, styles, dockStyles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v6.css", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v7.css", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /searchExpanded/);
  assert.doesNotMatch(workspace, /\\btoolbarExpanded\\b/);
  assert.ok(workspace.includes("showMiniMap"));
  assert.doesNotMatch(workspace, /<Controls/);
  assert.match(workspace, /<MiniMap/);
  assert.match(workspace, /focusMode/);
  assert.match(workspace, /专注模式/);
  assert.ok(workspace.includes("fitView({ padding: 0.18, duration: 320 })"));
  assert.match(workspace, />定位</);
  assert.doesNotMatch(workspace, />AI 设置<\/button>/);
  assert.match(workspace, /agentWelcome/);
  assert.match(workspace, /friendlyAnalysisError/);
  assert.match(card, /displayAnalysisError/);
  assert.ok(styles.includes("grid-template-columns: repeat(3, minmax(0, 1fr)) !important"));
  assert.ok(styles.includes(".workspace-shell.focus-mode"));
  assert.ok(dockStyles.includes(".canvas-area > .canvas-toolbar"));
  assert.ok(dockStyles.includes("top: auto !important"));
  assert.ok(dockStyles.includes("right: auto !important"));
  assert.ok(dockStyles.includes("width: max-content"));
  assert.ok(dockStyles.includes("height: 52px"));
  assert.ok(dockStyles.includes(".focus-top-button"));
});
