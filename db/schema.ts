import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(),
  quotaRemaining: integer("quota_remaining").notNull().default(30),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const emailLoginCodes = sqliteTable("email_login_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  clientHash: text("client_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("email_login_codes_email_created_idx").on(table.email, table.createdAt), index("email_login_codes_client_created_idx").on(table.clientHash, table.createdAt)]);

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), title: text("title").notNull(),
  version: integer("version").notNull().default(1), scene: text("scene", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("boards_owner_updated_idx").on(table.ownerId, table.updatedAt)]);

export const assistantConversations = sqliteTable("assistant_conversations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  boardId: text("board_id").notNull(),
  title: text("title").notNull(),
  messages: text("messages", { mode: "json" }).$type<Array<Record<string, unknown>>>().notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("assistant_conversations_owner_board_updated_idx").on(table.ownerId, table.boardId, table.updatedAt)]);

export const assistantMemories = sqliteTable("assistant_memories", {
  ownerId: text("owner_id").primaryKey(),
  userRole: text("user_role").notNull().default(""),
  preferences: text("preferences").notNull().default(""),
  avoid: text("avoid").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), boardId: text("board_id").notNull(),
  kind: text("kind", { enum: ["image", "video", "audio", "web", "text"] }).notNull(), title: text("title").notNull(), sourceUrl: text("source_url"),
  objectKey: text("object_key"), extractedText: text("extracted_text"), metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: ["idle", "queued", "processing", "ready", "failed"] }).notNull().default("idle"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const relations = sqliteTable("relations", {
  id: text("id").primaryKey(), boardId: text("board_id").notNull(), sourceId: text("source_id").notNull(), targetId: text("target_id").notNull(),
  type: text("type").notNull(), layer: text("layer", { enum: ["provenance", "association"] }).notNull().default("association"),
  status: text("status", { enum: ["confirmed", "suggested", "rejected"] }).notNull().default("confirmed"),
  origin: text("origin", { enum: ["human", "ai", "system"] }).notNull(), explanation: text("explanation"), score: real("score"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), assetId: text("asset_id").notNull().unique(), schemaVersion: integer("schema_version").notNull().default(2),
  provider: text("provider").notNull(), model: text("model").notNull(), result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status", { enum: ["queued", "processing", "ready", "failed"] }).notNull(), error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiCredentials = sqliteTable("ai_credentials", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), provider: text("provider", { enum: ["openai", "anthropic", "gemini", "qwen", "deepseek", "moonshot", "zhipu", "doubao", "minimax"] }).notNull(),
  model: text("model").notNull(), baseUrl: text("base_url").notNull(), ciphertext: text("ciphertext").notNull(), iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(), lastFour: text("last_four").notNull(), supportsVision: integer("supports_vision", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("ai_credentials_owner_provider_idx").on(table.ownerId, table.provider)]);

export const confirmedElements = sqliteTable("confirmed_elements", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), boardId: text("board_id").notNull(), assetId: text("asset_id").notNull(),
  analysisId: text("analysis_id").notNull(), regionId: text("region_id").notNull(), label: text("label").notNull(), type: text("type").notNull(),
  rect: text("rect", { mode: "json" }).$type<Record<string, number>>().notNull(), objectKey: text("object_key"), metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A derivative never replaces its source asset.  The canvas may show it as an
 * `element` card, while this record keeps the original file, operation and
 * transform traceable for export and later re-editing.
 */
export const assetDerivatives = sqliteTable("asset_derivatives", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), boardId: text("board_id").notNull(),
  sourceAssetId: text("source_asset_id").notNull(), title: text("title").notNull(),
  operation: text("operation", { enum: ["crop", "mask", "ai-edit"] }).notNull(), objectKey: text("object_key").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: ["ready", "failed"] }).notNull().default("ready"), error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("asset_derivatives_source_idx").on(table.sourceAssetId), index("asset_derivatives_owner_created_idx").on(table.ownerId, table.createdAt)]);

export const designContracts = sqliteTable("design_contracts", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), boardId: text("board_id").notNull().unique(),
  version: integer("version").notNull().default(1), status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
  content: text("content", { mode: "json" }).$type<Record<string, unknown>>().notNull(), provider: text("provider"), model: text("model"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), type: text("type").notNull(), subjectId: text("subject_id").notNull(),
  status: text("status", { enum: ["queued", "processing", "ready", "failed"] }).notNull(), attempts: integer("attempts").notNull().default(0),
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(), error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(), boardId: text("board_id").notNull(), ownerId: text("owner_id").notNull(), tokenHash: text("token_hash").notNull().unique(),
  revokedAt: text("revoked_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const usageLedger = sqliteTable("usage_ledger", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), action: text("action").notNull(), units: integer("units").notNull(), jobId: text("job_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiBudgetLedger = sqliteTable("ai_budget_ledger", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), action: text("action").notNull(),
  reservedFen: integer("reserved_fen").notNull(), dayKey: text("day_key").notNull(), monthKey: text("month_key").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("ai_budget_day_idx").on(table.dayKey), index("ai_budget_month_idx").on(table.monthKey),
  index("ai_budget_owner_day_idx").on(table.ownerId, table.dayKey),
  index("ai_budget_owner_month_idx").on(table.ownerId, table.monthKey),
]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(), payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
