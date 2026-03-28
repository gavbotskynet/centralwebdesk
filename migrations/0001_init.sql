-- Migration: Add global_settings table
CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Initialize allow_signups to true if not present
INSERT OR IGNORE INTO global_settings (key, value, updated_at) VALUES ('allow_signups', 'true', unixepoch());
