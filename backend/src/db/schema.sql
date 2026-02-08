-- CryptoSignal Pro - SQLite Schema (ТЗ раздел База данных)

-- Таблица сигналов
CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    direction TEXT CHECK(direction IN ('LONG', 'SHORT')),
    entry_price REAL NOT NULL,
    stop_loss REAL NOT NULL,
    take_profits TEXT NOT NULL,
    risk_reward REAL,
    confidence INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    trigger_type TEXT,
    exchange TEXT,
    timeframe TEXT,
    status TEXT DEFAULT 'active',
    analysis_data TEXT
);

-- Таблица демо-сделок
CREATE TABLE IF NOT EXISTS demo_trades (
    id TEXT PRIMARY KEY,
    signal_id TEXT REFERENCES signals(id),
    open_price REAL NOT NULL,
    close_price REAL,
    size REAL NOT NULL,
    direction TEXT,
    pnl REAL,
    pnl_percent REAL,
    open_time DATETIME,
    close_time DATETIME,
    status TEXT DEFAULT 'open'
);

-- Таблица настроек
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица истории анализа
CREATE TABLE IF NOT EXISTS analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    candle_data TEXT,
    orderbook_data TEXT,
    indicators TEXT,
    result TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_demo_trades_status ON demo_trades(status);
