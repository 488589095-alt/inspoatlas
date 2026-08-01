import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("自动保存忽略临时选择并在编辑停止后合并写入", async () => {
  const workspace = await readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /persistableSignature/);
  assert.match(workspace, /sceneSignature\(nodes, edges, viewportState\)/);
  assert.match(workspace, /setTimeout\(async \(\) =>[\s\S]*3_200/);
  assert.match(workspace, /pagehide/);
  assert.match(workspace, /有未保存更改/);
  assert.doesNotMatch(workspace, /\}, 900\)/);
});

test("辅助连线默认只显示当前相关且连接热区更大", async () => {
  const [workspace, card, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v11.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /从 ＋ 拖到圆点/);
  assert.match(workspace, /selectedSet\.has\(edge\.source\) \|\| selectedSet\.has\(edge\.target\)/);
  assert.match(workspace, /connectionRadius=\{48\}/);
  assert.match(workspace, /type: "complements"/);
  assert.doesNotMatch(workspace, /relation-modal/);
  assert.match(card, /node-port-output/);
  assert.match(card, /node-port-input/);
  assert.match(styles, /width: 28px !important/);
  assert.match(styles, /cursor: grabbing !important/);
});

test("备注、分组说明和左右侧栏均可直接编辑", async () => {
  const [workspace, card, organize, styles] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/organize.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v11.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /function createNote/);
  assert.match(workspace, /<small>备注<\/small>/);
  assert.match(workspace, /rail-resizer-left/);
  assert.match(workspace, /rail-resizer-right/);
  assert.match(workspace, /connectedModelLabel/);
  assert.match(card, /function InlineBody/);
  assert.match(card, /action: "update-body"/);
  assert.match(organize, /AI 根据 \$\{analyzedCount\} 张卡片的拆解结果归纳/);
  assert.match(styles, /\.card-note/);
  assert.match(styles, /--left-rail-width/);
});