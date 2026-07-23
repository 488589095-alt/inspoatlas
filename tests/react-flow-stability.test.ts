import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("React Flow 事件处理器保持稳定且选择状态避免重复写入", async () => {
  const source = await readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /const onSelectionChange = useCallback/);
  assert.match(source, /current\.length === next\.length && current\.every/);
  assert.match(source, /onSelectionChange=\{onSelectionChange\}/);
  assert.match(source, /onNodeContextMenu=\{onNodeContextMenu\}/);
  assert.doesNotMatch(source, /onSelectionChange=\{\(\{ nodes: selection \}\) => setSelectedIds/);
});
