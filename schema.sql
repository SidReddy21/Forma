-- Only document snapshots belong here. Awareness never enters this table.
CREATE TABLE IF NOT EXISTS canvas_documents (
  id TEXT PRIMARY KEY,
  state BLOB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
