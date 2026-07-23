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

type RuntimeD1Statement = { run(): Promise<unknown>; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> };
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
      d1.prepare("CREATE INDEX IF NOT EXISTS boards_owner_updated_idx ON boards(owner_id, updated_at)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT, object_key TEXT, extracted_text TEXT, metadata TEXT DEFAULT '{}' NOT NULL, status TEXT DEFAULT 'idle' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS assets_owner_created_idx ON assets(owner_id, created_at)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS relations (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, type TEXT NOT NULL, layer TEXT DEFAULT 'association' NOT NULL, status TEXT DEFAULT 'confirmed' NOT NULL, origin TEXT NOT NULL, explanation TEXT, score REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, asset_id TEXT NOT NULL UNIQUE, schema_version INTEGER DEFAULT 2 NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, result TEXT, status TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, type TEXT NOT NULL, subject_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER DEFAULT 0 NOT NULL, result TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS ai_credentials (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT NOT NULL, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL, last_four TEXT NOT NULL, supports_vision INTEGER DEFAULT 0 NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ai_credentials_owner_provider_idx ON ai_credentials(owner_id, provider)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS confirmed_elements (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL, asset_id TEXT NOT NULL, analysis_id TEXT NOT NULL, region_id TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, rect TEXT NOT NULL, object_key TEXT, metadata TEXT DEFAULT '{}' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS design_contracts (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL UNIQUE, version INTEGER DEFAULT 1 NOT NULL, status TEXT DEFAULT 'draft' NOT NULL, content TEXT NOT NULL, provider TEXT, model TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS share_links (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL, owner_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
    ]).then(async () => {
      await ensureColumns(d1, "relations", [
        ["layer", "TEXT NOT NULL DEFAULT 'association'"], ["status", "TEXT NOT NULL DEFAULT 'confirmed'"],
        ["explanation", "TEXT"], ["created_at", "TEXT"],
      ]);
      await ensureColumns(d1, "analyses", [
        ["owner_id", "TEXT NOT NULL DEFAULT ''"], ["updated_at", "TEXT"],
      ]);
      await d1.prepare("DROP INDEX IF EXISTS boards_owner_title_idx").run();
      await d1.prepare("CREATE INDEX IF NOT EXISTS boards_owner_updated_idx ON boards(owner_id, updated_at)").run();
      await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS analyses_asset_id_idx ON analyses(asset_id)").run();
    }).catch((error) => {
      coreTablesPromise = undefined;
      throw error;
    });
  }

  return coreTablesPromise;
}

async function ensureColumns(d1: RuntimeD1Database, table: string, columns: Array<[string, string]>) {
  const info = await d1.prepare("PRAGMA table_info(" + table + ")").all<{ name: string }>();
  const existing = new Set((info.results ?? []).map((item) => item.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) await d1.prepare("ALTER TABLE " + table + " ADD COLUMN " + name + " " + definition).run();
  }
}
