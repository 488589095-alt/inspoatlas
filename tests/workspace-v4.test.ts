import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("多选、拖入分组、工作区导航与真实账号入口均已接入", async () => {
  const [workspace, userMenu, session] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/UserMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/session/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /const selection = new Set\(selectedIds\)/);
  assert.match(workspace, /onNodeDragStop=\{onNodeDragStop\}/);
  assert.match(workspace, /ratio >= 0\.42/);
  assert.match(workspace, /双击原位修改画布名称/);
  assert.match(workspace, /className="workspace-modes"/);
  assert.match(workspace, /参考画布/);
  assert.match(workspace, /设计基准工作区/);
  assert.match(workspace, /导出工作区/);
  assert.match(workspace, /本地筛选/);
  assert.doesNotMatch(workspace, /groups\.map\(\(group\).*移入：/);
  assert.match(userMenu, /\/api\/session/);
  assert.match(userMenu, /signout-with-chatgpt/);
  assert.match(session, /currentUser\(request\)/);
});
