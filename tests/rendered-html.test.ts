import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("产品页面指向真实工作台且没有固定 AI 演示回答", async () => {
  const [page, workspace] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /InspoWorkspace/);
  assert.match(workspace, /\/api\/analyses/);
  assert.match(workspace, /\/api\/boards/);
  assert.match(workspace, /设计系统合同/);
  assert.doesNotMatch(workspace, /该素材通过单一视觉焦点/);
  assert.doesNotMatch(workspace, /问问这张画布/);
  assert.doesNotMatch(workspace, /setTimeout\(\(\) => \{\s*const analysisId/);
});

test("可用性入口都有状态变更或服务端调用", async () => {
  const [workspace, card] = await Promise.all([
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
  ]);
  for (const feature of ["createCluster", "renameBoard", "deleteBoard", "previewContract", "saveCredential", "exportPackage"]) {
    assert.match(workspace, new RegExp("function " + feature));
  }
  assert.match(card, /NodeResizer/);
  assert.match(workspace, /onlyRenderVisibleElements/);
  assert.match(workspace, /Background id="fine-dots"/);
});
