-- Telegram channel metrics history
CREATE TABLE IF NOT EXISTS telegram_stats (
    date TEXT PRIMARY KEY,
    subscribers INTEGER,
    total_views_24h INTEGER,
    created_at INTEGER
);

-- Exercise records history (1RM snapshots)
CREATE TABLE IF NOT EXISTS exercise_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    exercise_name TEXT,
    weight REAL,
    UNIQUE(date, exercise_name)
);

-- Cached Telegram posts to avoid reparsing
CREATE TABLE IF NOT EXISTS telegram_posts (
    post_id TEXT PRIMARY KEY,
    channel_name TEXT,
    title TEXT,
    content TEXT,
    link TEXT,
    published_at TEXT,
    views INTEGER
);

-- Client payment tracking snapshot
CREATE TABLE IF NOT EXISTS client_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    plan TEXT,
    amount REAL,
    status TEXT,
    next_payment TEXT,
    notes TEXT,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Reminders log (Telegram notifications)
CREATE TABLE IF NOT EXISTS reminders_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    chat_id TEXT,
    due_at TEXT,
    sent_at TEXT,
    offset INTEGER,
    status TEXT,
    error TEXT
);
