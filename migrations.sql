-- Migration: Add last_heartbeat to collaborators table
-- Description: Add timestamp tracking for live collaborator detection

-- Check if column exists, if not add it
ALTER TABLE collaborators ADD COLUMN last_heartbeat TEXT DEFAULT CURRENT_TIMESTAMP;

-- Create session_updates table if it doesn't exist
CREATE TABLE IF NOT EXISTS session_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'edit',
  new_content TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Add unique constraint on collaborators if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS on constraints, so we'll handle it in code

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collaborators_heartbeat ON collaborators(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_updates_session ON session_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_updates_timestamp ON session_updates(timestamp);
