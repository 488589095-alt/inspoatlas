import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(),
  quotaRemaining: integer("quota_remaining").notNull().default(30),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), title: text("title").notNull(),
  version: integer("version").notNull().default(1), scene: text("scene", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("boards_owner_title_idx").on(table.ownerId, table.title)]);

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), boardId: text("board_id").notNull(),
  kind: text("kind", { enum: ["image", "web", "text"] }).notNull(), title: text("title").notNull(), sourceUrl: text("source_url"),
  objectKey: text("object_key"), extractedText: text("extracted_text"), metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: ["idle", "queued", "processing", "ready", "failed"] }).notNull().default("idle"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const relations = sqliteTable("relations", {
  id: text("id").primaryKey(), boardId: text("board_id").notNull(), sourceId: text("source_id").notNull(), targetId: text("target_id").notNull(),
  type: text("type").notNull(), origin: text("origin", { enum: ["human", "ai"] }).notNull(), score: real("score"),
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(), assetId: text("asset_id").notNull(), schemaVersion: integer("schema_version").notNull().default(1),
  provider: text("provider").notNull(), model: text("model").notNull(), result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status", { enum: ["queued", "processing", "ready", "failed"] }).notNull(), error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(), payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

