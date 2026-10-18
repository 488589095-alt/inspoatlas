import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  AI_BUDGET_LIMITS_FEN,
  AI_BUDGET_RESERVATION_SQL,
  aiBudgetReservationArgs,
  chinaBudgetKeys,
  type AiBudgetAction,
} from "../app/api/aiBudgetPolicy";

function budgetDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ai_budget_ledger (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, action TEXT NOT NULL, reserved_fen INTEGER NOT NULL, day_key TEXT NOT NULL, month_key TEXT NOT NULL, created_at TEXT NOT NULL)");
  let serial = 0;
  return {
    reserve(ownerId: string, action: AiBudgetAction, now = new Date("2026-10-18T08:00:00Z")) {
      return db.prepare(AI_BUDGET_RESERVATION_SQL).run(...aiBudgetReservationArgs(`r${++serial}`, ownerId, action, now)).changes === 1;
    },
    total(where = "1 = 1") {
      return Number((db.prepare(`SELECT COALESCE(SUM(reserved_fen), 0) AS total FROM ai_budget_ledger WHERE ${where}`).get() as { total: number }).total);
    },
    close() { db.close(); },
  };
}

test("China-time day and month boundaries are used consistently", () => {
  assert.deepEqual(chinaBudgetKeys(new Date("2026-10-31T15:59:59Z")), { dayKey: "2026-10-31", monthKey: "2026-10" });
  assert.deepEqual(chinaBudgetKeys(new Date("2026-10-31T16:00:00Z")), { dayKey: "2026-11-01", monthKey: "2026-11" });
});

test("one conditional write enforces user day/month and site day/month caps", () => {
  const db = budgetDatabase();
  try {
    assert.equal(db.reserve("alice", "analysis"), true);
    assert.equal(db.reserve("alice", "research"), false, "one visitor cannot pass the daily cap");
    assert.equal(db.reserve("bob", "analysis"), true);
    assert.equal(db.reserve("charlie", "analysis"), true);
    assert.equal(db.reserve("dora", "analysis"), false, "the site cannot exceed its daily cap");
    assert.equal(db.total(), 210);
    assert.ok(db.total() <= AI_BUDGET_LIMITS_FEN.siteDay);

    for (let day = 19; day <= 22; day++) {
      const now = new Date(`2026-10-${day}T08:00:00Z`);
      for (let index = 0; index < 3; index++) db.reserve(`visitor-${day}-${index}`, "analysis", now);
    }
    assert.ok(db.total() <= AI_BUDGET_LIMITS_FEN.siteMonth);
    assert.equal(db.reserve("new-visitor", "imageEdit", new Date("2026-10-23T08:00:00Z")), false, "monthly budget blocks new visitors too");
  } finally { db.close(); }
});

test("separate public deployments combined cannot reserve over ¥5/day or ¥20/month", () => {
  assert.equal(AI_BUDGET_LIMITS_FEN.siteDay * 2, 500);
  assert.equal(AI_BUDGET_LIMITS_FEN.siteMonth * 2, 2_000);
});

test("a returning visitor is blocked by the monthly personal cap", () => {
  const db = budgetDatabase();
  try {
    for (let day = 18; day <= 20; day++) {
      const now = new Date(`2026-10-${day}T08:00:00Z`);
      assert.equal(db.reserve("alice", "analysis", now), true);
      assert.equal(db.reserve("alice", "imageEdit", now), true);
    }
    assert.equal(db.total("owner_id = 'alice'"), 285);
    assert.equal(db.reserve("alice", "assistant", new Date("2026-10-21T08:00:00Z")), false);
    assert.equal(db.reserve("bob", "assistant", new Date("2026-10-21T08:00:00Z")), true);
  } finally { db.close(); }
});
