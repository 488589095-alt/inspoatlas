import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("多选、自动分组、画布查找、文件夹导入与真实账号入口均已接入", async () => {
  const [workspace, styles, userMenu, session] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-v5.css", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/UserMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/session/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /onNodeDragStop=\{onNodeDragStop\}/);
  assert.match(workspace, /ratio >= 0\.42/);
  assert.match(workspace, /双击重命名当前作品/);
  assert.doesNotMatch(workspace, /className="workspace-modes"/);
  assert.match(workspace, /<h2>整合参考<\/h2>/);
  assert.match(workspace, /<h2>输出任务<\/h2>/);
  assert.match(workspace, /is-search-match/);
  assert.match(workspace, /webkitdirectory/);
  assert.match(workspace, /addMedia\(event\.target\.files, true\)/);
  assert.match(workspace, /video\/mp4/);
  assert.match(workspace, /audio\/mpeg/);
  assert.match(workspace, /panOnDrag=\{\[2\]\}/);
  assert.match(styles, /\.canvas-toolbar[\s\S]*flex-direction: row/);
  assert.match(styles, /\.inspector-tabs[\s\S]*flex-wrap: nowrap/);
  assert.doesNotMatch(workspace, /groups\.map\(\(group\).*移入：/);
  assert.match(userMenu, /\/api\/session/);
  assert.match(userMenu, /signout-with-chatgpt/);
  assert.match(userMenu, /最近作品/);
  assert.match(session, /boardCount/);
  assert.match(session, /assetCount/);
  assert.match(session, /currentUser\(request\)/);
});
