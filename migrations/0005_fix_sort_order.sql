-- Migration: Add unique constraint on (set_id, sort_order) to prevent duplicate sort_order values
-- Requires recreating the table since SQLite doesn't support ADD CONSTRAINT for UNIQUE on existing columns

CREATE TABLE bullets_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  bullet_type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'open',
  indent INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0,
  set_id TEXT NOT NULL,
  image_key TEXT,
  image_url TEXT,
  parent_id TEXT REFERENCES bullets(id) ON DELETE SET NULL,
  UNIQUE(set_id, sort_order)
);

INSERT INTO bullets_new SELECT * FROM bullets;
DROP TABLE bullets;
ALTER TABLE bullets_new RENAME TO bullets;

CREATE INDEX IF NOT EXISTS idx_bullets_user ON bullets(user_id);
CREATE INDEX IF NOT EXISTS idx_bullets_set ON bullets(set_id);
CREATE INDEX IF NOT EXISTS idx_bullets_parent ON bullets(parent_id);
