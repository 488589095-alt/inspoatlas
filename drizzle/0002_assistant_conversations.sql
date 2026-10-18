CREATE TABLE IF NOT EXISTS assistant_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  messages TEXT DEFAULT '[]' NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_conversations_owner_board_updated_idx ON assistant_conversations(owner_id, board_id, updated_at);
