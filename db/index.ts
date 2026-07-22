import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

type RuntimeD1Statement = { run(): Promise<unknown> };
type RuntimeD1Database = {
  prepare(sql: string): RuntimeD1Statement;
  batch(statements: RuntimeD1Statement[]): Promise<unknown>;
};

let coreTablesPromise: Promise<void> | undefined;

/**
 * Sites provisions the D1 binding, but a newly-created site database may not
 * have received the repository migration yet. Keep the small runtime bootstrap
 * idempotent so capture never reports success after a failed insert.
 */
export function ensureCoreTables(): Promise<void> {
  if (!env.DB) {
    return Promise.reject(new Error("Cloudflare D1 binding `DB` is unavailable."));
  }

  if (!coreTablesPromise) {
    const d1 = env.DB as unknown as RuntimeD1Database;
    coreTablesPromise = d1.batch([
      d1.prepare("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, quota_remaining INTEGER DEFAULT 30 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL, version INTEGER DEFAULT 1 NOT NULL, scene TEXT DEFAULT '{}' NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS boards_owner_title_idx ON boards(owner_id, title)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT, object_key TEXT, extracted_text TEXT, metadata TEXT DEFAULT '{}' NOT NULL, status TEXT DEFAULT 'idle' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS assets_owner_created_idx ON assets(owner_id, created_at)"),
    ]).then(() => undefined).catch((error) => {
      coreTablesPromise = undefined;
      throw error;
    });
  }

  return coreTablesPromise;
}
