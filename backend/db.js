const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new DatabaseSync(
  path.join(dataDirectory, 'learning-assistant.db')
);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Giữ nguyên bảng và dữ liệu hiện có.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration chạy được nhiều lần, kể cả với database đã có tài khoản.
db.exec('BEGIN IMMEDIATE');
try {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.some((column) => column.name === 'token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active'))
    );
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      hits INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    size_bytes INTEGER NOT NULL
      CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    content BLOB NOT NULL,
    created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON documents(user_id, id);
`);

module.exports = db;
