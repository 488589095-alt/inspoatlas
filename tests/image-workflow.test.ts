import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("衍生图层不会覆盖原图，且可沿 element-of 回溯", async () => {
  const [schema, route, content, workspace, model] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assets/[id]/derivatives/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assets/[id]/content/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/model.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /assetDerivatives/);
  assert.match(route, /derivatives\/\$\{user\.id\}/);
  assert.match(route, /sourceAssetId/);
  assert.match(content, /assetDerivatives/);
  assert.match(workspace, /addDerivativeLayer/);
  assert.match(workspace, /type: "element-of"/);
  assert.doesNotMatch(model, /scene\.nodes\.filter\(\(item\) => item\.kind !== "element"\)/);
});

test("灵感搜索是临时候选，只有用户确认才加入来源", async () => {
  const [route, workspace, ai] = await Promise.all([
    readFile(new URL("../app/api/boards/[id]/research/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /Search results deliberately do not touch the board or asset tables/);
  assert.match(route, /researchWithQwen/);
  assert.match(ai, /enable_search: true/);
  assert.match(workspace, /探索灵感/);
  assert.match(workspace, /加入链接/);
  assert.match(workspace, /打开采集/);
});
