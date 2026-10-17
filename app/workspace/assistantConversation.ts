import { parseModelJson } from "@/packages/ai/src";

export type AssistantTurn = { answer: string; followUps: string[] };

const fallbackFollowUps = [
  "你能把这个方向具体化成页面结构吗？",
  "我下一步该找哪些参考？",
  "如果想更有辨识度，可以从哪里调整？",
];

export function parseAssistantTurn(raw: string): AssistantTurn {
  try {
    const parsed = parseModelJson(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const turn = parsed as Record<string, unknown>;
      const answer = typeof turn.answer === "string" ? turn.answer.trim() : "";
      if (answer) {
        const followUps = Array.isArray(turn.followUps)
          ? [...new Set(turn.followUps.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 3 && item.length <= 100))].slice(0, 3)
          : [];
        return { answer, followUps: followUps.length >= 2 ? followUps : fallbackFollowUps.slice(0, 2) };
      }
    }
  } catch {
    // Keep a usable reply if the model returned prose instead of JSON.
  }
  const plainAnswer = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { answer: plainAnswer || "我还没整理出合适的建议，换个说法再聊聊吧。", followUps: fallbackFollowUps.slice(0, 2) };
}
