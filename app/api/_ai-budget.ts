import { ensureCoreTables, insertAiBudgetReservation } from "@/db";
import type { LoadedCredential } from "./_credentials";
import { HttpError, newId } from "./_lib";
import { AI_BUDGET_RESERVATION_SQL, aiBudgetReservationArgs, type AiBudgetAction } from "./aiBudgetPolicy";

export async function reserveAiBudget(ownerId: string, action: AiBudgetAction, credential: LoadedCredential) {
  if (credential.provider !== "qwen" || credential.model !== "qwen3.7-plus") {
    throw new HttpError(503, "当前模型尚未纳入费用上限，请联系站点管理员");
  }
  await ensureCoreTables();
  const reserved = await insertAiBudgetReservation(
    AI_BUDGET_RESERVATION_SQL,
    aiBudgetReservationArgs(newId("ai-budget"), ownerId, action, new Date()),
  );
  if (!reserved) throw new HttpError(429, "AI 今日或本月额度已用完，请稍后再试。额度按北京时间重置。");
}
