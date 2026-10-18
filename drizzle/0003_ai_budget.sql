CREATE TABLE IF NOT EXISTS `ai_budget_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `action` text NOT NULL,
  `reserved_fen` integer NOT NULL,
  `day_key` text NOT NULL,
  `month_key` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_budget_day_idx` ON `ai_budget_ledger` (`day_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_budget_month_idx` ON `ai_budget_ledger` (`month_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_budget_owner_day_idx` ON `ai_budget_ledger` (`owner_id`, `day_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_budget_owner_month_idx` ON `ai_budget_ledger` (`owner_id`, `month_key`);
