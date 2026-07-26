import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("画布控件支持收起、专注模式且分析错误不会原样展示", async () => {
  const [workspace, card, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v6.css", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /searchExpanded/);
  assert.match(workspace, /toolbarExpanded/);
  assert.match(workspace, /showMinimap/);
  assert.match(workspace, /focusMode/);
  assert.match(workspace, /专注画布/);
  assert.match(workspace, /friendlyAnalysisError/);
  assert.match(card, /displayAnalysisError/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(styles, /\.workspace-shell\.focus-mode/);
});
