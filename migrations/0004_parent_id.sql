-- Migration: Add parent_id for explicit hierarchy, make set_id NOT NULL
--
-- Step 1: Add parent_id column
ALTER TABLE bullets ADD COLUMN parent_id TEXT;

-- Step 2: Assign any orphan bullet (set_id=NULL) to the first set
UPDATE bullets
SET set_id = (
  SELECT id FROM bullet_sets ORDER BY sort_order ASC LIMIT 1
)
WHERE set_id IS NULL;

-- Step 3: Compute parent_id using ROW_NUMBER for stable ordering
-- parent = the bullet immediately preceding this one in sort_order with indent = indent-1
WITH ordered AS (
  SELECT id, set_id, indent, created_at,
         ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY sort_order ASC, created_at ASC) as seq
  FROM bullets
),
parent_map AS (
  SELECT curr.id as bullet_id, prev.id as parent_id
  FROM ordered curr
  LEFT JOIN ordered prev ON prev.set_id = curr.set_id
    AND prev.seq = curr.seq - 1
    AND curr.indent > 0
    AND prev.indent = curr.indent - 1
)
UPDATE bullets
SET parent_id = (
  SELECT parent_id FROM parent_map WHERE parent_map.bullet_id = bullets.id
)
WHERE EXISTS (
  SELECT 1 FROM parent_map pm WHERE pm.bullet_id = bullets.id AND pm.parent_id IS NOT NULL
);

-- Step 4: Recreate bullets table with set_id NOT NULL and parent_id FK
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
  parent_id TEXT REFERENCES bullets(id) ON DELETE SET NULL
);

INSERT INTO bullets_new SELECT
  id, user_id, content, bullet_type, status, indent, sort_order,
  created_at, updated_at, collapsed, set_id, image_key, image_url, parent_id
FROM bullets;

DROP TABLE bullets;
ALTER TABLE bullets_new RENAME TO bullets;

CREATE INDEX IF NOT EXISTS idx_bullets_user ON bullets(user_id);
CREATE INDEX IF NOT EXISTS idx_bullets_set ON bullets(set_id);
CREATE INDEX IF NOT EXISTS idx_bullets_parent ON bullets(parent_id);
