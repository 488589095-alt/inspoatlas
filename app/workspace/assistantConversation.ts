import { parseModelJson } from "@/packages/ai/src";

export type AssistantAction =
  | { type: "add_note"; title: string; body: string }
  | { type: "rename_selected"; nodeId: string; title: string }
  | { type: "analyze_selected"; nodeId: string };
export type AssistantTurn = { answer: string; followUps: string[]; actions: AssistantAction[] };

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
          ? [...new Set(turn.followUps.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 3 && item.length <= 44))].slice(0, 3)
          : [];
        const actions: AssistantAction[] = Array.isArray(turn.actions) ? turn.actions.flatMap((candidate): AssistantAction[] => {
          if (!candidate || typeof candidate !== "object") return [];
          const action = candidate as Record<string, unknown>;
          if (action.type === "add_note" && typeof action.title === "string" && typeof action.body === "string") {
            return [{ type: "add_note" as const, title: action.title.trim().slice(0, 80), body: action.body.trim().slice(0, 1500) }];
          }
          if (action.type === "rename_selected" && typeof action.nodeId === "string" && typeof action.title === "string") {
            return [{ type: "rename_selected" as const, nodeId: action.nodeId, title: action.title.trim().slice(0, 80) }];
          }
          if (action.type === "analyze_selected" && typeof action.nodeId === "string") {
            return [{ type: "analyze_selected" as const, nodeId: action.nodeId }];
          }
          return [];
        }).filter((action) => action.type === "rename_selected" ? Boolean(action.title) : action.type === "add_note" ? Boolean(action.title && action.body) : Boolean(action.nodeId)).slice(0, 1) : [];
        return { answer, followUps: followUps.length >= 2 ? followUps : fallbackFollowUps.slice(0, 2), actions };
      }
    }
  } catch {
    // Keep a usable reply if the model returned prose instead of JSON.
  }
  const plainAnswer = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { answer: plainAnswer || "我还没整理出合适的建议，换个说法再聊聊吧。", followUps: fallbackFollowUps.slice(0, 2), actions: [] };
}
