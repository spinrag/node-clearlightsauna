// db.js — SQLite database for push subscription storage
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'sauna.db')

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    threshold_temp INTEGER DEFAULT NULL,
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

// Prepared statements
const stmts = {
	upsertSubscription: db.prepare(`
    INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
    VALUES (@endpoint, @keys_p256dh, @keys_auth)
    ON CONFLICT(endpoint) DO UPDATE SET
      keys_p256dh = @keys_p256dh,
      keys_auth = @keys_auth,
      updated_at = datetime('now')
  `),

	deleteSubscription: db.prepare(`
    DELETE FROM push_subscriptions WHERE endpoint = ?
  `),

	setThreshold: db.prepare(`
    UPDATE push_subscriptions
    SET threshold_temp = @threshold_temp, notified = 0, updated_at = datetime('now')
    WHERE endpoint = @endpoint
  `),

	getActiveSubscriptions: db.prepare(`
    SELECT * FROM push_subscriptions
    WHERE threshold_temp IS NOT NULL
  `),

	markNotified: db.prepare(`
    UPDATE push_subscriptions SET notified = 1, updated_at = datetime('now')
    WHERE id = ?
  `),

	rearmAll: db.prepare(`
    UPDATE push_subscriptions SET notified = 0, updated_at = datetime('now')
    WHERE notified = 1
  `),

	rearmOne: db.prepare(`
    UPDATE push_subscriptions SET notified = 0, updated_at = datetime('now')
    WHERE id = ?
  `),

	getSubscriptionByEndpoint: db.prepare(`
    SELECT * FROM push_subscriptions WHERE endpoint = ?
  `),
}

module.exports = { db, stmts }
