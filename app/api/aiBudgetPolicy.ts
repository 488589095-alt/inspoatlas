/** Limits are split evenly between the public Vercel and Sites deployments.
 * Their databases are separate, so either one can use at most half of the
 * owner's combined ¥5/day and ¥20/month allowance. Days use China time.
 */
export const AI_BUDGET_LIMITS_FEN = {
  siteDay: 250,
  siteMonth: 1_000,
  userDay: 100,
  userMonth: 300,
} as const;

/** Conservative upper-bound reservations; never refunded after dispatch. */
export const AI_BUDGET_RESERVATIONS_FEN = {
  assistant: 20,
  research: 50,
  analysis: 70,
  layers: 50,
  imageEdit: 25,
} as const;

export type AiBudgetAction = keyof typeof AI_BUDGET_RESERVATIONS_FEN;

export function chinaBudgetKeys(now: Date) {
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
  const dayKey = chinaTime.toISOString().slice(0, 10);
  return { dayKey, monthKey: dayKey.slice(0, 7) };
}

/** One SQLite write checks all four caps and inserts the reservation atomically. */
export const AI_BUDGET_RESERVATION_SQL = `
  INSERT INTO ai_budget_ledger (id, owner_id, action, reserved_fen, day_key, month_key, created_at)
  SELECT ?, ?, ?, ?, ?, ?, ?
  WHERE (SELECT COALESCE(SUM(reserved_fen), 0) FROM ai_budget_ledger WHERE day_key = ?) + ? <= ?
    AND (SELECT COALESCE(SUM(reserved_fen), 0) FROM ai_budget_ledger WHERE month_key = ?) + ? <= ?
    AND (SELECT COALESCE(SUM(reserved_fen), 0) FROM ai_budget_ledger WHERE owner_id = ? AND day_key = ?) + ? <= ?
    AND (SELECT COALESCE(SUM(reserved_fen), 0) FROM ai_budget_ledger WHERE owner_id = ? AND month_key = ?) + ? <= ?
`;

export function aiBudgetReservationArgs(id: string, ownerId: string, action: AiBudgetAction, now: Date) {
  const fen = AI_BUDGET_RESERVATIONS_FEN[action];
  const { dayKey, monthKey } = chinaBudgetKeys(now);
  return [
    id, ownerId, action, fen, dayKey, monthKey, now.toISOString(),
    dayKey, fen, AI_BUDGET_LIMITS_FEN.siteDay,
    monthKey, fen, AI_BUDGET_LIMITS_FEN.siteMonth,
    ownerId, dayKey, fen, AI_BUDGET_LIMITS_FEN.userDay,
    ownerId, monthKey, fen, AI_BUDGET_LIMITS_FEN.userMonth,
  ];
}
