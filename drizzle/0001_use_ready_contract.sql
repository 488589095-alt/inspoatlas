DROP INDEX IF EXISTS boards_owner_title_idx;
CREATE INDEX IF NOT EXISTS boards_owner_updated_idx ON boards(owner_id, updated_at);

ALTER TABLE relations ADD COLUMN layer TEXT NOT NULL DEFAULT 'association';
ALTER TABLE relations ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE relations ADD COLUMN explanation TEXT;
ALTER TABLE relations ADD COLUMN created_at TEXT;

ALTER TABLE analyses ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE analyses ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS analyses_asset_id_idx ON analyses(asset_id);

CREATE TABLE IF NOT EXISTS ai_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  last_four TEXT NOT NULL,
  supports_vision INTEGER DEFAULT 0 NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_credentials_owner_provider_idx ON ai_credentials(owner_id, provider);

CREATE TABLE IF NOT EXISTS confirmed_elements (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  rect TEXT NOT NULL,
  object_key TEXT,
  metadata TEXT DEFAULT '{}' NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS confirmed_elements_analysis_region_idx ON confirmed_elements(analysis_id, region_id);

CREATE TABLE IF NOT EXISTS design_contracts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  board_id TEXT NOT NULL UNIQUE,
  version INTEGER DEFAULT 1 NOT NULL,
  status TEXT DEFAULT 'draft' NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
