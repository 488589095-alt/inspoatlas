import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantTurn } from "../app/workspace/assistantConversation";

test("设计助手解析回答和用户视角追问，去除重复建议", () => {
  const turn = parseAssistantTurn('```json\n{"answer":"先确定受众，再比较参考网站。","followUps":["我该怎么确定受众？","我该怎么确定受众？","我该比较哪些页面？"]}\n```');
  assert.equal(turn.answer, "先确定受众，再比较参考网站。");
  assert.deepEqual(turn.followUps, ["我该怎么确定受众？", "我该比较哪些页面？"]);
});

test("模型返回普通文本时仍能给出可点击的追问", () => {
  const turn = parseAssistantTurn("先收集三个同类网站，比较它们的导航和首屏。");
  assert.match(turn.answer, /先收集三个同类网站/);
  assert.equal(turn.followUps.length, 2);
});
