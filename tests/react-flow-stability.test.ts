import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("React Flow 事件处理器保持稳定且选择状态只有一个写入源", async () => {
  const source = await readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /const onSelectionChange = useCallback/);
  assert.match(source, /current\.length === next\.length && next\.every/);
  assert.match(source, /onSelectionChange=\{onSelectionChange\}/);
  assert.match(source, /onNodeContextMenu=\{onNodeContextMenu\}/);
  assert.doesNotMatch(source, /const selection = new Set\(selectedIds\)/);
  assert.doesNotMatch(source, /\{ \.\.\.node, selected, hidden \}/);
  assert.doesNotMatch(source, /onSelectionChange=\{\(\{ nodes: selection \}\) => setSelectedIds/);
});
