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

test("仅解析明确允许的画布动作，过长追问使用简短建议", () => {
  const turn = parseAssistantTurn(JSON.stringify({
    answer: "我会为你记录这条灵感。",
    followUps: ["我想进一步把这个非常复杂的设计方向拆成很多个不同的小步骤，而且希望每一步都有完整解释，你能继续吗？"],
    actions: [{ type: "add_note", title: "配色方向", body: "使用柔和的蓝紫色" }, { type: "delete_node", nodeId: "image-1" }],
  }));
  assert.deepEqual(turn.actions, [{ type: "add_note", title: "配色方向", body: "使用柔和的蓝紫色" }]);
  assert.equal(turn.followUps.length, 2);
  assert.ok(turn.followUps.every((item) => item.length <= 44));
});
