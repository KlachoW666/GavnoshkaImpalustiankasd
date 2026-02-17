/**
 * SQLite DB: инициализация, ордера (все пользователи).
 * При ошибке загрузки better-sqlite3 (например в Electron — другая версия Node)
 * используется in-memory хранилище, чтобы приложение и админка работали.
 */

import path from 'path';
import fs from 'fs';
import { logger } from '../lib/logger';

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
    } catch { /* migration: column/table may already exist */ }
    try {
      db.prepare('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0').run();
    } catch { /* migration: column/table may already exist */ }
    try {
      db.prepare('ALTER TABLE users ADD COLUMN ban_reason TEXT').run();
    } catch { /* migration: column/table may already exist */ }
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
    } catch { /* migration: column/table may already exist */ }
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
    } catch { /* migration: column/table may already exist */ }
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_okx_connections (
          user_id TEXT PRIMARY KEY,
          api_key TEXT NOT NULL,
          secret TEXT NOT NULL,
          passphrase TEXT DEFAULT '',
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_bitget_connections (
          user_id TEXT PRIMARY KEY,
          api_key TEXT NOT NULL,
          secret TEXT NOT NULL,
          passphrase TEXT DEFAULT '',
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_massive_api (
          user_id TEXT PRIMARY KEY,
          api_key TEXT DEFAULT '',
          access_key_id TEXT DEFAULT '',
          secret_access_key TEXT DEFAULT '',
          s3_endpoint TEXT DEFAULT '',
          bucket TEXT DEFAULT '',
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch { /* migration: table may already exist */ }
    try {
      db.exec(`ALTER TABLE user_massive_api ADD COLUMN access_key_id TEXT DEFAULT ''`);
    } catch { /* column may exist */ }
    try {
      db.exec(`ALTER TABLE user_massive_api ADD COLUMN secret_access_key TEXT DEFAULT ''`);
    } catch { /* column may exist */ }
    try {
      db.exec(`ALTER TABLE user_massive_api ADD COLUMN s3_endpoint TEXT DEFAULT ''`);
    } catch { /* column may exist */ }
    try {
      db.exec(`ALTER TABLE user_massive_api ADD COLUMN bucket TEXT DEFAULT ''`);
    } catch { /* column may exist */ }
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_proxies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL UNIQUE,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch { /* migration: column/table may already exist */ }
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_tokens (
          token TEXT PRIMARY KEY,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch { /* migration: column/table may already exist */ }
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
    } catch { /* migration: column/table may already exist */ }
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_wallet_addresses (
          user_id TEXT PRIMARY KEY,
          derivation_index INTEGER NOT NULL UNIQUE,
          address TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS user_balances (
          user_id TEXT PRIMARY KEY,
          balance_usdt REAL NOT NULL DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS deposits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          tx_hash TEXT NOT NULL UNIQUE,
          amount_usdt REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'credited',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
        CREATE INDEX IF NOT EXISTS idx_deposits_tx ON deposits(tx_hash);
        CREATE TABLE IF NOT EXISTS withdrawals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          amount_usdt REAL NOT NULL,
          to_address TEXT NOT NULL,
          tx_hash TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
        CREATE TABLE IF NOT EXISTS wallet_custom_addresses (
          derivation_index INTEGER NOT NULL,
          network TEXT NOT NULL,
          address TEXT NOT NULL,
          PRIMARY KEY (derivation_index, network)
        );
        CREATE TABLE IF NOT EXISTS internal_positions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('LONG', 'SHORT')),
          size_usdt REAL NOT NULL,
          leverage INTEGER NOT NULL DEFAULT 1,
          open_price REAL NOT NULL,
          close_price REAL,
          pnl REAL,
          pnl_percent REAL,
          open_time TEXT NOT NULL,
          close_time TEXT,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed'))
        );
        CREATE INDEX IF NOT EXISTS idx_internal_positions_user ON internal_positions(user_id);
        CREATE INDEX IF NOT EXISTS idx_internal_positions_status ON internal_positions(status);
        CREATE TABLE IF NOT EXISTS trigger_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('LONG', 'SHORT')),
          size_usdt REAL NOT NULL,
          leverage INTEGER NOT NULL DEFAULT 1,
          trigger_price REAL NOT NULL,
          order_type TEXT NOT NULL DEFAULT 'market' CHECK(order_type IN ('limit', 'market')),
          limit_price REAL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'executed', 'cancelled')),
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_trigger_orders_user ON trigger_orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_trigger_orders_status ON trigger_orders(status);
      `);
    } catch { /* migration: column/table may already exist */ }
    try {
      db.prepare('ALTER TABLE users ADD COLUMN telegram_id TEXT').run();
    } catch { /* migration: column/table may already exist */ }
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
    } catch { /* migration: column/table may already exist */ }
    return db;
  } catch (err) {
    logger.error('DB', `SQLite init failed, falling back to in-memory store: ${(err as Error).message}`);
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
  } catch { /* migration: column/table may already exist */ }
  try {
    database.prepare('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0').run();
  } catch { /* migration: column/table may already exist */ }
  try {
    database.prepare('ALTER TABLE users ADD COLUMN ban_reason TEXT').run();
  } catch { /* migration: column/table may already exist */ }
  try {
    database.prepare('ALTER TABLE users ADD COLUMN telegram_id TEXT').run();
  } catch { /* migration: column/table may already exist */ }
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
  } catch { /* migration: column/table may already exist */ }
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
  } catch (err) {
    logger.warn('DB', `getSetting(${key}) failed: ${(err as Error).message}`);
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
  } catch (err) { logger.warn('DB', (err as Error).message); }
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

/** Вставка/обновление ордера из OKX (в т.ч. полностью закрытого) — для синхронизации истории с биржей */
export function upsertOrderFromOkx(order: {
  id: string;
  clientId: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  closePrice?: number;
  pnl?: number;
  pnlPercent?: number;
  openTime: string;
  closeTime?: string;
  status: 'open' | 'closed';
  autoOpened?: boolean;
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
      close_price: order.closePrice ?? null,
      stop_loss: null,
      take_profit: null,
      pnl: order.pnl ?? null,
      pnl_percent: order.pnlPercent ?? null,
      open_time: order.openTime,
      close_time: order.closeTime ?? null,
      status: order.status,
      auto_opened: order.autoOpened ? 1 : 0,
      confidence_at_open: null,
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
    closePrice: order.closePrice ?? null,
    stopLoss: null,
    takeProfit: null,
    pnl: order.pnl ?? null,
    pnlPercent: order.pnlPercent ?? null,
    openTime: order.openTime,
    closeTime: order.closeTime ?? null,
    status: order.status,
    autoOpened: order.autoOpened ? 1 : 0,
    confidenceAtOpen: null
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

/** Проверка: есть ли уже ордер с данным exchange ordId (id форматов okx-{ordId}-... или bitget-{ordId}-...) */
function orderExistsWithExchangeOrdId(ordId: string, clientId: string | undefined, idPrefix: 'okx' | 'bitget'): boolean {
  if (!initAttempted) initDb();
  const prefix = `${idPrefix}-${ordId}`;
  const prefixDash = `${prefix}-`;
  if (useMemoryStore) {
    return memoryOrders.some((o) => {
      if (o.id !== prefix && !o.id.startsWith(prefixDash)) return false;
      return clientId == null || o.client_id === clientId;
    });
  }
  const d = getDb();
  if (!d) return false;
  const list = d.prepare('SELECT id, client_id FROM orders WHERE id = ? OR id LIKE ?').all(prefix, `${prefixDash}%`) as Array<{ id: string; client_id: string }>;
  if (clientId == null) return list.length > 0;
  return list.some((r) => r.client_id === clientId);
}

export function orderExistsWithOkxOrdId(ordId: string, clientId?: string): boolean {
  return orderExistsWithExchangeOrdId(ordId, clientId, 'okx');
}

export function orderExistsWithBitgetOrdId(ordId: string, clientId?: string): boolean {
  return orderExistsWithExchangeOrdId(ordId, clientId, 'bitget');
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
