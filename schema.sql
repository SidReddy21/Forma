-- CodeMeld Database Schema

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'typescript',
  content TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_public INTEGER DEFAULT 1,
  owner_id TEXT
);

-- Collaborators table (tracks users in sessions)
CREATE TABLE IF NOT EXISTS collaborators (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  color TEXT,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  last_heartbeat TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, user_id)
);

-- Code changes (edit history)
CREATE TABLE IF NOT EXISTS code_changes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  position_line INTEGER,
  position_column INTEGER,
  content TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Real-time session updates (for polling-based sync)
CREATE TABLE IF NOT EXISTS session_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'edit',
  new_content TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- AI Analysis results
CREATE TABLE IF NOT EXISTS ai_analysis (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  bugs TEXT,
  improvements TEXT,
  test_coverage REAL,
  complexity TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Generated artifacts (tests, docs, etc.)
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_collaborators_session ON collaborators(session_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_heartbeat ON collaborators(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_changes_session ON code_changes(session_id);
CREATE INDEX IF NOT EXISTS idx_updates_session ON session_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_updates_timestamp ON session_updates(timestamp);
CREATE INDEX IF NOT EXISTS idx_analysis_session ON ai_analysis(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
