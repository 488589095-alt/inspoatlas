import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式平台模式与 BYOK 实验模式分开运行", async () => {
  const [credentials, route, workspace] = await Promise.all([
    readFile(new URL("../app/api/_credentials.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai-credentials/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(credentials, /runMode: "managed"/);
  assert.match(credentials, /runMode: "byok"/);
  assert.match(credentials, /MANAGED_AI_PROVIDER/);
  assert.match(route, /managedAiSummary/);
  assert.match(workspace, /平台托管 AI/);
  assert.match(workspace, /高级实验/);
  assert.match(workspace, /inspoatlas:ai-run-mode/);
});

test("拆解与设计助手记录版本、运行方式和行为事件", async () => {
  const [analysis, assistant, ai] = await Promise.all([
    readFile(new URL("../app/api/analyses/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/boards/[id]/design-assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/ai/src/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ai, /ANALYSIS_PROMPT_VERSION = "analysis-v3"/);
  assert.match(analysis, /ai\.analysis\.completed/);
  assert.match(analysis, /isRerun/);
  assert.match(assistant, /DESIGN_ASSISTANT_PROMPT_VERSION = "assistant-v2"/);
  assert.match(assistant, /ai\.assistant\.completed/);
  assert.match(assistant, /historyCount/);
});

test("AI 结果支持可诊断反馈并持久化为质量事件", async () => {
  const [feedback, workspace, card, database] = await Promise.all([
    readFile(new URL("../app/api/ai-feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InspoWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/CardNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(feedback, /ai\.feedback/);
  assert.match(feedback, /not-actionable/);
  assert.match(workspace, /submitAssistantFeedback/);
  assert.match(workspace, /不落地/);
  assert.match(card, /不准确/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS events/);
});