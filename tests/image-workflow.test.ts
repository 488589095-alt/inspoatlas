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

test("灵感搜索候选不改写画布，并通过对话提供可打开的来源", async () => {
  const [route, assistant, workspace, ai] = await Promise.all([
    readFile(new URL("../app/api/boards/[id]/research/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/boards/[id]/design-assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /Search results deliberately do not touch the board or asset tables/);
  assert.match(route, /researchWithQwen/);
  assert.match(ai, /enable_search: true/);
  assert.match(assistant, /searchCandidates/);
  assert.match(assistant, /researchWithQwen/);
  assert.match(workspace, /className="agent-sources"/);
});
