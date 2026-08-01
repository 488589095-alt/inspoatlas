import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("框选仅命中完全覆盖的卡片并精简画布浮层", async () => {
  const [workspace, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v9.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /selectionMode=\{SelectionMode\.Full\}/);
  assert.doesNotMatch(workspace, /className="canvas-tip"/);
  assert.doesNotMatch(workspace, /className="shortcut-card"/);
  assert.match(workspace, /className=\{"minimap-toggle"/);
  assert.doesNotMatch(workspace, /<small>缩略图<\/small>/);
  assert.match(styles, /\.minimap-toggle/);
  assert.match(styles, /\.canvas-area \.react-flow__minimap/);
});

test("模型弹窗精简排版且视觉分析超时可恢复", async () => {
  const [styles, ai, workspace] = await Promise.all([
    readFile(new URL("../app/workspace-v9.css", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(styles, /width: min\(640px/);
  assert.match(styles, /credential-form-note/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(ai, /240_000/);
  assert.match(ai, /max_tokens: 3_500/);
  assert.match(ai, /isAbortError/);
  assert.match(workspace, /视觉分析用时超过当前限制/);
});

test("网页正文可滚动且无截图素材不再发起图片请求", async () => {
  const [workspace, card, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v9.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /Array\.isArray\(metadata\.screenshotKeys\)/);
  assert.match(workspace, /count \? "\/api\/assets\/"/);
  assert.match(card, /card-body-scroll nodrag nowheel/);
  assert.match(styles, /\.card-content \.card-body-scroll/);
  assert.match(styles, /overflow-y: auto/);
});

test("设计助手要求目标并支持选择或整张画布", async () => {
  const [workspace, route, ai, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/boards/[id]/design-assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v11.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /这次要做什么/);
  assert.match(workspace, /assistantScope === "selection"/);
  assert.match(workspace, /全部参考/);
  assert.match(route, /eq\(boards\.ownerId, user\.id\)/);
  assert.match(route, /关键判断用【卡片标题】标注依据/);
  assert.match(ai, /generateTextWithProvider/);
  assert.match(styles, /\.direction-panel/);
});
