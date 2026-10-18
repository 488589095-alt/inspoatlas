import { env } from "cloudflare:workers";
import { createClient, type Client } from "@libsql/client/web";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibSQL } from "drizzle-orm/libsql/web";
import * as schema from "./schema";

let vercelClient: Client | undefined;

function getVercelClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("Turso is not connected to this Vercel project.");
  }
  return (vercelClient ??= createClient({ url, authToken }));
}

export function getDb() {
  if (process.env.VERCEL) {
    // Both drivers use the same SQLite schema and query builder. Keep the D1
    // type at this boundary so route handlers do not need provider branches.
    return drizzleLibSQL(getVercelClient(), { schema }) as unknown as ReturnType<typeof drizzleD1<typeof schema>>;
  }
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzleD1(env.DB, { schema });
}

type RuntimeD1Statement = { sql?: string; run(): Promise<unknown>; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> };
type RuntimeD1Database = {
  prepare(sql: string): RuntimeD1Statement;
  batch(statements: RuntimeD1Statement[]): Promise<unknown>;
};

let coreTablesPromise: Promise<void> | undefined;

function getBootstrapDb(): RuntimeD1Database {
  if (!process.env.VERCEL) {
    if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
    return env.DB as unknown as RuntimeD1Database;
  }
  const client = getVercelClient();
  return {
    prepare(sql) {
      return {
        sql,
        async run() { return client.execute(sql); },
        async all<T>() {
          const result = await client.execute(sql);
          return { results: result.rows as unknown as T[] };
        },
      };
    },
    async batch(statements) {
      await client.batch(statements.map((statement) => statement.sql ?? ""), "write");
    },
  };
}

/**
 * Sites provisions the D1 binding, but a newly-created site database may not
 * have received the repository migration yet. Keep the small runtime bootstrap
 * idempotent so capture never reports success after a failed insert.
 */
export function ensureCoreTables(): Promise<void> {
  if (!coreTablesPromise) {
    let d1: RuntimeD1Database;
    try { d1 = getBootstrapDb(); }
    catch (error) { return Promise.reject(error); }
    coreTablesPromise = d1.batch([
      d1.prepare("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, quota_remaining INTEGER DEFAULT 30 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS email_login_codes (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, code_hash TEXT NOT NULL, client_hash TEXT NOT NULL, attempts INTEGER DEFAULT 0 NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS email_login_codes_email_created_idx ON email_login_codes(email, created_at)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS email_login_codes_client_created_idx ON email_login_codes(client_hash, created_at)"),
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
      d1.prepare("CREATE TABLE IF NOT EXISTS asset_derivatives (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL, source_asset_id TEXT NOT NULL, title TEXT NOT NULL, operation TEXT NOT NULL, object_key TEXT NOT NULL, metadata TEXT DEFAULT '{}' NOT NULL, status TEXT DEFAULT 'ready' NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS asset_derivatives_source_idx ON asset_derivatives(source_asset_id)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS asset_derivatives_owner_created_idx ON asset_derivatives(owner_id, created_at)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS design_contracts (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, board_id TEXT NOT NULL UNIQUE, version INTEGER DEFAULT 1 NOT NULL, status TEXT DEFAULT 'draft' NOT NULL, content TEXT NOT NULL, provider TEXT, model TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS share_links (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL, owner_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS usage_ledger (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, action TEXT NOT NULL, units INTEGER NOT NULL, job_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT DEFAULT '{}' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)"),
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
