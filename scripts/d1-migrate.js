/**
 * D1 Database Migration Script
 * 
 * Creates the initial database schema for Central Web Desk:
 * - users (synced from Clerk, for data isolation)
 * - lists (bullet lists)
 * - list_items (individual items in a list)
 * - reminders
 * - files (file metadata)
 * 
 * Usage: npm run cf:d1:migrate
 */

import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

// Schema definitions
const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  name: text('name'),
  imageUrl: text('image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

const listItems = sqliteTable('list_items', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => lists.id),
  content: text('content').notNull(),
  completed: integer('completed', { mode: 'boolean' }).default(false),
  position: integer('position').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  completed: integer('completed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type'),
  r2Key: text('r2_key').notNull(), // R2 object key
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

const migrationSQL = sql`
  -- Users table (synced from Clerk)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    image_url TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  -- Lists table
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  -- List items table
  CREATE TABLE IF NOT EXISTS list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  -- Reminders table
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date INTEGER,
    completed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  -- Files table
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT,
    r2_key TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
  CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
  CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
`;

async function migrate() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;

  if (!accountId || !databaseId) {
    console.error('Error: CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID must be set in .env');
    console.error('Run `npm run cf:setup` first to create the database.');
    process.exit(1);
  }

  console.log(`Running migration on D1 database: ${databaseId}`);
  console.log('Account:', accountId);

  // Use wrangler to execute SQL
  const { execSync } = await import('child_process');

  try {
    const createTableSQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  image_url TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  content TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date INTEGER,
  completed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT,
  r2_key TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
`;

    // Write SQL to temp file
    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/migration.sql', createTableSQL);

    const cmd = `wrangler d1 execute centralwebdesk --file /tmp/migration.sql --yes`;
    console.log(`\n$ ${cmd}`);

    execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });

    console.log('\n✅ Migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - users');
    console.log('  - lists');
    console.log('  - list_items');
    console.log('  - reminders');
    console.log('  - files');
    console.log('\nCreated indexes for efficient queries.');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
