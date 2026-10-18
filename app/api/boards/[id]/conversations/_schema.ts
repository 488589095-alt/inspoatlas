import { z } from "zod";

const sourceSchema = z.object({
  title: z.string().max(200),
  url: z.string().url().max(2_048),
  reason: z.string().max(500),
});

export const assistantMessageSchema = z.object({
  id: z.string().max(100).optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(16_000),
  followUps: z.array(z.string().max(200)).max(3).optional(),
  sources: z.array(sourceSchema).max(3).optional(),
  provider: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  promptVersion: z.string().max(80).optional(),
  runMode: z.enum(["managed", "byok"]).optional(),
  feedback: z.enum(["helpful", "needs-work"]).optional(),
});

export const conversationMessagesSchema = z.array(assistantMessageSchema).max(500);

export function conversationTitle(question: string) {
  return question.replace(/\s+/g, " ").trim().slice(0, 28) || "新对话";
}
