const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'messenger.sqlite');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      is_group INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reply_to_message_id INTEGER,
      status TEXT NOT NULL DEFAULT 'sent'
    );

    CREATE TABLE IF NOT EXISTS pinned_messages (
      chat_id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL,
      pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const usersCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (usersCount === 0) {
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?), (?, ?)').run('alice', 'password123', 'bob', 'password123');
  }

  const chatsCount = db.prepare('SELECT COUNT(*) AS count FROM chats').get().count;
  if (chatsCount === 0) {
    const chat = db.prepare('INSERT INTO chats (title, is_group) VALUES (?, 0)').run('Alice & Bob');
    const chatId = chat.lastInsertRowid;

    db.prepare('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)').run(chatId, 1, chatId, 2);

    db.prepare('INSERT INTO messages (chat_id, sender_id, body, status) VALUES (?, ?, ?, ?)').run(chatId, 1, 'Hi Bob! Welcome to KaloMessenger.', 'read');
  }
}

module.exports = { db, initSchema };
