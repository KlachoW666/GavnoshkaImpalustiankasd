/**
 * SQLite DB: инициализация, ордера (все пользователи).
 * При ошибке загрузки better-sqlite3 (например в Electron — другая версия Node)
 * используется in-memory хранилище, чтобы приложение и админка работали.
 */

import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'cryptosignal.db');

let db: any = null;
let useMemoryStore = false;
let initAttempted = false;

const memoryOrders: MemoryOrderRow[] = [];
const memorySettings: Record<string, string> = {};

interface MemoryOrderRow {
  id: string;
  client_id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  open_price: number;
  close_price: number | null;
  stop_loss: number | null;
  take_profit: string | null;
  pnl: number | null;
  pnl_percent: number | null;
  open_time: string;
  close_time: string | null;
  status: 'open' | 'closed';
  auto_opened: number;
  confidence_at_open: number | null;
  created_at: string;
}

function getSchemaPath(): string {
  const candidates = [
    path.join(process.cwd(), 'backend', 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
    path.join(__dirname, 'schema.sql')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function loadNative(): any {
  try {
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

/** Инициализация БД. Не бросает исключений: при ошибке включается in-memory режим. */
export function initDb(): any {
  if (initAttempted) return useMemoryStore ? null : db;
  initAttempted = true;
  const Database = loadNative();
  if (!Database) {
    useMemoryStore = true;
    return null;
  }
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    const schemaPath = getSchemaPath();
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      db.exec(sql);
    }
    // Lightweight migrations (safe on already-migrated DB)
    try {
      db.prepare('ALTER TABLE users ADD COLUMN activation_expires_at TEXT').run();
    } catch {}
    try {
      db.prepare('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0').run();
    } catch {}
    try {
      db.prepare('ALTER TABLE users ADD COLUMN ban_reason TEXT').run();
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS activation_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          duration_days INTEGER NOT NULL,
          note TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          used_by_user_id TEXT,
          used_at TEXT,
          revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_activation_keys_key ON activation_keys(key);
        CREATE INDEX IF NOT EXISTS idx_activation_keys_used ON activation_keys(used_at);
      `);
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          days INTEGER NOT NULL,
          price_usd REAL NOT NULL,
          price_stars INTEGER NOT NULL,
          discount_percent INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_subscription_plans_enabled ON subscription_plans(enabled);
      `);
      const count = db.prepare('SELECT COUNT(*) AS c FROM subscription_plans').get() as { c: number };
      if (count.c === 0) {
        db.prepare(
          'INSERT INTO subscription_plans (days, price_usd, price_stars, discount_percent, enabled, sort_order) VALUES (?,?,?,?,?,?)'
        ).run(1, 150, 7000, 0, 1, 1);
      }
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_okx_connections (
          user_id TEXT PRIMARY KEY,
          api_key TEXT NOT NULL,
          secret TEXT NOT NULL,
          passphrase TEXT DEFAULT '',
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_proxies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL UNIQUE,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS copy_subscriptions (
          provider_id TEXT NOT NULL,
          subscriber_id TEXT NOT NULL,
          size_percent REAL NOT NULL DEFAULT 25,
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (provider_id, subscriber_id),
          CHECK (subscriber_id != provider_id)
        );
        CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_provider ON copy_subscriptions(provider_id);
        CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_subscriber ON copy_subscriptions(subscriber_id);
      `);
    } catch {}
    try {
      db.prepare('ALTER TABLE users ADD COLUMN telegram_id TEXT').run();
    } catch {}
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS telegram_register_tokens (
          token TEXT PRIMARY KEY,
          telegram_user_id TEXT NOT NULL,
          username_suggestion TEXT,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS telegram_reset_tokens (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
      `);
    } catch {}
    return db;
  } catch {
    useMemoryStore = true;
    db = null;
    return null;
  }
}

/** Миграции таблицы users (вызывать при первом обращении к auth, чтобы работало без перезапуска). */
export function runUserMigrations(database: any): void {
  if (!database) return;
  try {
    database.prepare('ALTER TABLE users ADD COLUMN activation_expires_at TEXT').run();
  } catch {}
  try {
    database.prepare('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0').run();
  } catch {}
  try {
    database.prepare('ALTER TABLE users ADD COLUMN ban_reason TEXT').run();
  } catch {}
  try {
    database.prepare('ALTER TABLE users ADD COLUMN telegram_id TEXT').run();
  } catch {}
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS telegram_register_tokens (
        token TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        username_suggestion TEXT,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS telegram_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  } catch {}
}

export function getDb(): any {
  if (!initAttempted) initDb();
  return useMemoryStore ? null : db;
}

const SETTINGS_KEY_STATS_DISPLAY = 'stats_display_config';

export function getSetting(key: string): string | null {
  if (!initAttempted) initDb();
  if (useMemoryStore) return memorySettings[key] ?? null;
  const d = getDb();
  if (!d) return null;
  try {
    const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: string): void {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    memorySettings[key] = value;
    return;
  }
  const d = getDb();
  if (!d) return;
  try {
    d.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(key, value);
  } catch {}
}

export { SETTINGS_KEY_STATS_DISPLAY };

/** Режим in-memory (нет SQLite) — для отображения в админке. */
export function isMemoryStore(): boolean {
  if (!initAttempted) initDb();
  return useMemoryStore;
}

export interface OrderRow {
  id: string;
  client_id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  open_price: number;
  close_price: number | null;
  stop_loss: number | null;
  take_profit: string | null;
  pnl: number | null;
  pnl_percent: number | null;
  open_time: string;
  close_time: string | null;
  status: 'open' | 'closed';
  auto_opened: number;
  confidence_at_open: number | null;
  created_at: string;
}

export function insertOrder(order: {
  id: string;
  clientId: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  stopLoss?: number;
  takeProfit?: number[];
  openTime: string;
  status?: 'open' | 'closed';
  autoOpened?: boolean;
  confidenceAtOpen?: number;
}): void {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    const row: MemoryOrderRow = {
      id: order.id,
      client_id: order.clientId,
      pair: order.pair,
      direction: order.direction,
      size: order.size,
      leverage: order.leverage,
      open_price: order.openPrice,
      close_price: null,
      stop_loss: order.stopLoss ?? null,
      take_profit: order.takeProfit?.length ? JSON.stringify(order.takeProfit) : null,
      pnl: null,
      pnl_percent: null,
      open_time: order.openTime,
      close_time: null,
      status: order.status ?? 'open',
      auto_opened: order.autoOpened ? 1 : 0,
      confidence_at_open: order.confidenceAtOpen ?? null,
      created_at: new Date().toISOString()
    };
    const i = memoryOrders.findIndex((o) => o.id === order.id);
    if (i >= 0) memoryOrders[i] = row;
    else memoryOrders.unshift(row);
    return;
  }
  const d = getDb();
  if (!d) return;
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO orders (id, client_id, pair, direction, size, leverage, open_price, close_price, stop_loss, take_profit, pnl, pnl_percent, open_time, close_time, status, auto_opened, confidence_at_open)
    VALUES (@id, @clientId, @pair, @direction, @size, @leverage, @openPrice, @closePrice, @stopLoss, @takeProfit, @pnl, @pnlPercent, @openTime, @closeTime, @status, @autoOpened, @confidenceAtOpen)
  `);
  stmt.run({
    id: order.id,
    clientId: order.clientId,
    pair: order.pair,
    direction: order.direction,
    size: order.size,
    leverage: order.leverage,
    openPrice: order.openPrice,
    closePrice: null,
    stopLoss: order.stopLoss ?? null,
    takeProfit: order.takeProfit?.length ? JSON.stringify(order.takeProfit) : null,
    pnl: null,
    pnlPercent: null,
    openTime: order.openTime,
    closeTime: null,
    status: order.status ?? 'open',
    autoOpened: order.autoOpened ? 1 : 0,
    confidenceAtOpen: order.confidenceAtOpen ?? null
  });
}

export function updateOrderClose(order: {
  id: string;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  closeTime: string;
}): void {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    const row = memoryOrders.find((o) => o.id === order.id);
    if (row) {
      row.close_price = order.closePrice;
      row.pnl = order.pnl;
      row.pnl_percent = order.pnlPercent;
      row.close_time = order.closeTime;
      row.status = 'closed';
    }
    return;
  }
  const d = getDb();
  if (!d) return;
  const stmt = d.prepare(`
    UPDATE orders SET close_price = @closePrice, pnl = @pnl, pnl_percent = @pnlPercent, close_time = @closeTime, status = 'closed' WHERE id = @id
  `);
  stmt.run({
    id: order.id,
    closePrice: order.closePrice,
    pnl: order.pnl,
    pnlPercent: order.pnlPercent,
    closeTime: order.closeTime
  });
}

export function getOrderById(id: string): OrderRow | null {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    const o = memoryOrders.find((x) => x.id === id);
    return o ? (o as OrderRow) : null;
  }
  const d = getDb();
  if (!d) return null;
  const row = d.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  return row ?? null;
}

export function listOrders(opts?: { clientId?: string; status?: 'open' | 'closed'; limit?: number; sinceMs?: number }): OrderRow[] {
  if (!initAttempted) initDb();
  const sinceIso = opts?.sinceMs != null ? new Date(Date.now() - opts.sinceMs).toISOString() : null;
  if (useMemoryStore) {
    let list = [...memoryOrders];
    if (opts?.clientId) list = list.filter((o) => o.client_id === opts.clientId);
    if (opts?.status) list = list.filter((o) => o.status === opts.status);
    if (sinceIso) list = list.filter((o) => (o.close_time || '') >= sinceIso);
    list.sort((a, b) => (b.open_time || '').localeCompare(a.open_time || ''));
    const limit = opts?.limit ?? 100;
    return list.slice(0, limit) as OrderRow[];
  }
  const d = getDb();
  if (!d) return [];
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params: Record<string, string | number> = {};
  if (opts?.clientId) {
    sql += ' AND client_id = @clientId';
    params.clientId = opts.clientId;
  }
  if (opts?.status) {
    sql += ' AND status = @status';
    params.status = opts.status;
  }
  if (sinceIso) {
    sql += ' AND close_time >= @since';
    params.since = sinceIso;
  }
  sql += ' ORDER BY open_time DESC';
  if (opts?.limit) {
    sql += ' LIMIT @limit';
    params.limit = opts.limit;
  }
  const stmt = d.prepare(sql);
  return stmt.all(params) as OrderRow[];
}
