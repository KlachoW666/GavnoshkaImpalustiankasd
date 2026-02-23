/**
 * Copy Trading Balance DB
 */

import { getDb, initDb, isMemoryStore } from './index';
import { getUserById } from './authDb';
import { logger } from '../lib/logger';

export interface CopyTradingBalance {
  user_id: string;
  balance_usdt: number;
  total_pnl: number;
  total_deposit: number;
  total_withdraw: number;
  created_at: string;
  updated_at: string;
}

export interface CopyTradingTransaction {
  id: number;
  user_id: string;
  type: 'deposit' | 'withdraw' | 'pnl_credit' | 'pnl_debit' | 'fee';
  amount_usdt: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  tx_hash: string | null;
  withdraw_address: string | null;
  admin_note: string | null;
  provider_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface CopyTradingProvider {
  user_id: string;
  display_name: string | null;
  description: string | null;
  enabled: number;
  sort_order: number;
  fake_pnl: number;
  fake_win_rate: number;
  fake_trades: number;
  fake_subscribers: number;
  created_at: string;
  updated_at: string;
}

const memoryBalances: Map<string, CopyTradingBalance> = new Map();
const memoryTransactions: CopyTradingTransaction[] = [];
const memoryProviders: Map<string, CopyTradingProvider> = new Map();

function ensureTables(): void { initDb(); }

/** Все балансы копитрейдинга с balance_usdt > 0 (для распределения PnL пула) */
export function getCopyTradingBalancesWithPositiveBalance(): { user_id: string; balance_usdt: number }[] {
  ensureTables();
  if (isMemoryStore()) {
    return Array.from(memoryBalances.entries())
      .filter(([, b]) => (b.balance_usdt ?? 0) > 0)
      .map(([user_id, b]) => ({ user_id, balance_usdt: b.balance_usdt ?? 0 }));
  }
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT user_id, balance_usdt FROM copy_trading_balances WHERE balance_usdt > 0').all() as { user_id: string; balance_usdt: number }[];
  } catch { return []; }
}

export function getCopyTradingBalance(userId: string): CopyTradingBalance | null {
  ensureTables();
  if (isMemoryStore()) return memoryBalances.get(userId) ?? null;
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM copy_trading_balances WHERE user_id = ?').get(userId);
    return (row as CopyTradingBalance) ?? null;
  } catch { return null; }
}

export function getOrCreateCopyTradingBalance(userId: string): CopyTradingBalance {
  ensureTables();
  let balance = getCopyTradingBalance(userId);
  if (balance) return balance;
  const newBalance: CopyTradingBalance = { user_id: userId, balance_usdt: 0, total_pnl: 0, total_deposit: 0, total_withdraw: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (isMemoryStore()) { memoryBalances.set(userId, newBalance); return newBalance; }
  const db = getDb();
  if (!db) return newBalance;
  try {
    db.prepare('INSERT INTO copy_trading_balances (user_id) VALUES (?)').run(userId);
    return newBalance;
  } catch { return newBalance; }
}
export function updateCopyTradingBalance(userId: string, delta: { balance?: number; pnl?: number; deposit?: number; withdraw?: number }): boolean {
  ensureTables();
  if (isMemoryStore()) {
    const b = getOrCreateCopyTradingBalance(userId);
    if (delta.balance !== undefined) b.balance_usdt += delta.balance;
    if (delta.pnl !== undefined) b.total_pnl += delta.pnl;
    if (delta.deposit !== undefined) b.total_deposit += delta.deposit;
    if (delta.withdraw !== undefined) b.total_withdraw += delta.withdraw;
    return true;
  }
  const db = getDb();
  if (!db) return false;
  try {
    const sets: string[] = [];
    const params: (number | string)[] = [];
    if (delta.balance !== undefined) { sets.push('balance_usdt = balance_usdt + ?'); params.push(delta.balance); }
    if (delta.pnl !== undefined) { sets.push('total_pnl = total_pnl + ?'); params.push(delta.pnl); }
    if (delta.deposit !== undefined) { sets.push('total_deposit = total_deposit + ?'); params.push(delta.deposit); }
    if (delta.withdraw !== undefined) { sets.push('total_withdraw = total_withdraw + ?'); params.push(delta.withdraw); }
    if (sets.length === 0) return true;
    params.push(userId);
    db.prepare('UPDATE copy_trading_balances SET ' + sets.join(', ') + ' WHERE user_id = ?').run(...(params as any[]));
    return true;
  } catch { return false; }
}

export function createCopyTradingTransaction(userId: string, type: CopyTradingTransaction["type"], amountUsdt: number, opts?: { txHash?: string; providerId?: string; adminNote?: string; withdrawAddress?: string }): CopyTradingTransaction | null {
  ensureTables();
  const tx: CopyTradingTransaction = { id: 0, user_id: userId, type, amount_usdt: amountUsdt, status: "pending", tx_hash: opts?.txHash ?? null, withdraw_address: opts?.withdrawAddress ?? null, admin_note: opts?.adminNote ?? null, provider_id: opts?.providerId ?? null, created_at: new Date().toISOString(), processed_at: null };
  if (isMemoryStore()) { tx.id = memoryTransactions.length + 1; memoryTransactions.push(tx); return tx; }
  const db = getDb();
  if (!db) return null;
  try {
    const result = db.prepare('INSERT INTO copy_trading_transactions (user_id, type, amount_usdt, tx_hash, withdraw_address, admin_note, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, type, amountUsdt, opts?.txHash ?? null, opts?.withdrawAddress ?? null, opts?.adminNote ?? null, opts?.providerId ?? null);
    tx.id = result.lastInsertRowid as number;
    return tx;
  } catch { return null; }
}
export function getCopyTradingTransactions(userId: string, opts?: { status?: string; limit?: number; offset?: number }): CopyTradingTransaction[] {
  ensureTables();
  if (isMemoryStore()) { let list = memoryTransactions.filter(t => t.user_id === userId); if (opts?.status) list = list.filter(t => t.status === opts.status); return list.slice(opts?.offset ?? 0, (opts?.offset ?? 0) + (opts?.limit ?? 50)); }
  const db = getDb();
  if (!db) return [];
  try {
    let sql = 'SELECT * FROM copy_trading_transactions WHERE user_id = ?';
    const params: (string | number)[] = [userId];
    if (opts?.status) { sql += ' AND status = ?'; params.push(opts.status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(opts?.limit ?? 50, opts?.offset ?? 0);
    return db.prepare(sql).all(...params) as CopyTradingTransaction[];
  } catch { return []; }
}

export function getPendingTransactions(): CopyTradingTransaction[] {
  ensureTables();
  if (isMemoryStore()) return memoryTransactions.filter(t => t.status === 'pending');
  const db = getDb();
  if (!db) return [];
  try { return db.prepare('SELECT * FROM copy_trading_transactions WHERE status = ? ORDER BY created_at ASC').all('pending') as CopyTradingTransaction[]; }
  catch { return []; }
}

export function updateTransactionStatus(txId: number, status: CopyTradingTransaction["status"], adminNote?: string): boolean {
  ensureTables();
  if (isMemoryStore()) { const tx = memoryTransactions.find(t => t.id === txId); if (!tx) return false; tx.status = status; tx.admin_note = adminNote ?? tx.admin_note; if (status === "completed" || status === "rejected") tx.processed_at = new Date().toISOString(); return true; }
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare('UPDATE copy_trading_transactions SET status = ?, admin_note = ?, processed_at = datetime(\'now\') WHERE id = ?').run(status, adminNote ?? null, txId);
    return true;
  } catch { return false; }
}
export function processDeposit(txId: number, adminNote?: string): { success: boolean; error?: string } {
  ensureTables();
  const db = getDb();
  const tx = isMemoryStore() ? memoryTransactions.find(t => t.id === txId) : db?.prepare("SELECT * FROM copy_trading_transactions WHERE id = ?").get(txId) as CopyTradingTransaction | undefined;
  if (!tx) return { success: false, error: 'Not found' };
  if (tx.status !== 'pending') return { success: false, error: 'Already processed' };
  if (tx.type !== 'deposit') return { success: false, error: 'Wrong type' };
  updateTransactionStatus(txId, 'completed', adminNote);
  updateCopyTradingBalance(tx.user_id, { balance: tx.amount_usdt, deposit: tx.amount_usdt });
  return { success: true };
}

export function processWithdraw(txId: number, approve: boolean, adminNote?: string): { success: boolean; error?: string } {
  ensureTables();
  const db = getDb();
  const tx = isMemoryStore() ? memoryTransactions.find(t => t.id === txId) : db?.prepare("SELECT * FROM copy_trading_transactions WHERE id = ?").get(txId) as CopyTradingTransaction | undefined;
  if (!tx) return { success: false, error: 'Not found' };
  if (tx.status !== 'pending') return { success: false, error: 'Already processed' };
  if (tx.type !== 'withdraw') return { success: false, error: 'Wrong type' };
  const newStatus = approve ? 'completed' : 'rejected';
  updateTransactionStatus(txId, newStatus as 'completed' | 'rejected', adminNote);
  if (!approve) updateCopyTradingBalance(tx.user_id, { balance: tx.amount_usdt, withdraw: -tx.amount_usdt });
  return { success: true };
}

export function createWithdrawRequest(userId: string, amountUsdt: number, withdrawAddress?: string): { success: boolean; txId?: number; error?: string } {
  ensureTables();
  const balance = getOrCreateCopyTradingBalance(userId);
  if (balance.balance_usdt < amountUsdt) return { success: false, error: 'Insufficient funds' };
  const tx = createCopyTradingTransaction(userId, 'withdraw', amountUsdt, { withdrawAddress });
  if (!tx) return { success: false, error: 'Failed' };
  updateCopyTradingBalance(userId, { balance: -amountUsdt, withdraw: amountUsdt });
  return { success: true, txId: tx.id };
}
export function getUserMode(userId: string): 'auto_trading' | 'copy_trading' {
  ensureTables();
  if (isMemoryStore()) return 'auto_trading';
  const db = getDb();
  if (!db) return 'auto_trading';
  try {
    const row = db.prepare('SELECT user_mode FROM users WHERE id = ?').get(userId) as { user_mode: string } | undefined;
    return (row?.user_mode as 'auto_trading' | 'copy_trading') ?? 'auto_trading';
  } catch { return 'auto_trading'; }
}

export function setUserMode(userId: string, mode: 'auto_trading' | 'copy_trading'): boolean {
  ensureTables();
  if (isMemoryStore()) return true;
  const db = getDb();
  if (!db) return false;
  try { db.prepare('UPDATE users SET user_mode = ? WHERE id = ?').run(mode, userId); return true; }
  catch { return false; }
}

export function addCopyTradingProvider(userId: string, displayName?: string, description?: string): boolean {
  ensureTables();
  const user = getUserById(userId);
  if (!user) return false;
  if (isMemoryStore()) {
    memoryProviders.set(userId, { user_id: userId, display_name: displayName ?? user.username, description: description ?? null, enabled: 1, sort_order: 0, fake_pnl: 0, fake_win_rate: 0, fake_trades: 0, fake_subscribers: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return true;
  }
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare('INSERT OR REPLACE INTO copy_trading_providers (user_id, display_name, description, enabled, fake_pnl, fake_win_rate, fake_trades, fake_subscribers) VALUES (?, ?, ?, 1, 0, 0, 0, 0)').run(userId, displayName ?? user.username, description ?? null);
    return true;
  } catch { return false; }
}

export function updateProviderFakeStats(
  userId: string,
  stats: { fake_pnl?: number; fake_win_rate?: number; fake_trades?: number; fake_subscribers?: number }
): { ok: true } | { ok: false; error: string } {
  ensureTables();
  if (isMemoryStore()) {
    const p = memoryProviders.get(userId);
    if (!p) {
      logger.warn('CopyTradingBalanceDb', 'Provider not found in memory', { userId });
      return { ok: false, error: 'Провайдер не найден в памяти' };
    }
    if (stats.fake_pnl !== undefined) p.fake_pnl = stats.fake_pnl;
    if (stats.fake_win_rate !== undefined) p.fake_win_rate = stats.fake_win_rate;
    if (stats.fake_trades !== undefined) p.fake_trades = stats.fake_trades;
    if (stats.fake_subscribers !== undefined) p.fake_subscribers = stats.fake_subscribers;
    logger.info('CopyTradingBalanceDb', 'Updated fake stats in memory', { userId, stats });
    return { ok: true };
  }
  const db = getDb();
  if (!db) {
    logger.error('CopyTradingBalanceDb', 'DB not available');
    return { ok: false, error: 'База данных недоступна' };
  }

  const existingProvider = db.prepare('SELECT user_id FROM copy_trading_providers WHERE user_id = ?').get(userId);
  if (!existingProvider) {
    logger.warn('CopyTradingBalanceDb', 'Provider not found, creating...', { userId });
    const user = getUserById(userId);
    if (!user) {
      logger.error('CopyTradingBalanceDb', 'User not found', { userId });
      return { ok: false, error: 'Пользователь не найден' };
    }
    try {
      db.prepare(
        'INSERT OR IGNORE INTO copy_trading_providers (user_id, display_name, enabled, fake_pnl, fake_win_rate, fake_trades, fake_subscribers) VALUES (?, ?, 1, 0, 0, 0, 0)'
      ).run(userId, user.username);
    } catch (e) {
      logger.error('CopyTradingBalanceDb', 'Insert provider error: ' + (e as Error).message);
      return { ok: false, error: (e as Error).message };
    }
  }

  try {
    const sets: string[] = [];
    const params: (number | string)[] = [];
    if (stats.fake_pnl !== undefined) {
      sets.push('fake_pnl = ?');
      params.push(stats.fake_pnl);
    }
    if (stats.fake_win_rate !== undefined) {
      sets.push('fake_win_rate = ?');
      params.push(stats.fake_win_rate);
    }
    if (stats.fake_trades !== undefined) {
      sets.push('fake_trades = ?');
      params.push(stats.fake_trades);
    }
    if (stats.fake_subscribers !== undefined) {
      sets.push('fake_subscribers = ?');
      params.push(stats.fake_subscribers);
    }
    if (sets.length === 0) {
      logger.info('CopyTradingBalanceDb', 'No stats to update', { userId });
      return { ok: true };
    }
    params.push(userId);
    const sql = 'UPDATE copy_trading_providers SET ' + sets.join(', ') + ', updated_at = datetime(\'now\') WHERE user_id = ?';
    logger.info('CopyTradingBalanceDb', 'Executing UPDATE', { sql, params });
    db.prepare(sql).run(...params);
    logger.info('CopyTradingBalanceDb', 'UPDATE result', { userId, stats });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('CopyTradingBalanceDb', 'updateProviderFakeStats error: ' + msg);
    return { ok: false, error: msg };
  }
}

export function getProviderByUserId(userId: string): CopyTradingProvider | null {
  ensureTables();
  if (isMemoryStore()) return memoryProviders.get(userId) ?? null;
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT user_id, display_name, description, enabled, sort_order, COALESCE(fake_pnl, 0) as fake_pnl, COALESCE(fake_win_rate, 0) as fake_win_rate, COALESCE(fake_trades, 0) as fake_trades, COALESCE(fake_subscribers, 0) as fake_subscribers, created_at, updated_at FROM copy_trading_providers WHERE user_id = ?').get(userId);
    logger.info('CopyTradingBalanceDb', 'getProviderByUserId', { userId, found: !!row });
    return row as CopyTradingProvider ?? null;
  } catch (e) {
    logger.error('CopyTradingBalanceDb', `getProviderByUserId error: ${(e as Error).message}`);
    return null;
  }
}

export function updateProviderDetails(userId: string, details: { displayName?: string; description?: string }): boolean {
  ensureTables();
  if (isMemoryStore()) {
    const p = memoryProviders.get(userId);
    if (!p) return false;
    if (details.displayName !== undefined) p.display_name = details.displayName;
    if (details.description !== undefined) p.description = details.description;
    return true;
  }
  const db = getDb();
  if (!db) return false;
  try {
    const sets: string[] = [];
    const params: (string | null)[] = [];
    if (details.displayName !== undefined) { sets.push('display_name = ?'); params.push(details.displayName || null); }
    if (details.description !== undefined) { sets.push('description = ?'); params.push(details.description || null); }
    if (sets.length === 0) return true;
    params.push(userId);
    db.prepare('UPDATE copy_trading_providers SET ' + sets.join(', ') + ', updated_at = datetime(\'now\') WHERE user_id = ?').run(...params);
    return true;
  } catch { return false; }
}

export function removeCopyTradingProvider(userId: string): boolean {
  ensureTables();
  if (isMemoryStore()) { const p = memoryProviders.get(userId); if (p) p.enabled = 0; return true; }
  const db = getDb();
  if (!db) return false;
  try { db.prepare('UPDATE copy_trading_providers SET enabled = 0 WHERE user_id = ?').run(userId); return true; }
  catch { return false; }
}

export function getCopyTradingProviders(enabledOnly = true): CopyTradingProvider[] {
  ensureTables();
  if (isMemoryStore()) { const list = Array.from(memoryProviders.values()); return enabledOnly ? list.filter(p => p.enabled === 1) : list; }
  const db = getDb();
  if (!db) return [];
  try {
    const sql = enabledOnly ? 'SELECT user_id, display_name, description, enabled, sort_order, COALESCE(fake_pnl, 0) as fake_pnl, COALESCE(fake_win_rate, 0) as fake_win_rate, COALESCE(fake_trades, 0) as fake_trades, COALESCE(fake_subscribers, 0) as fake_subscribers, created_at, updated_at FROM copy_trading_providers WHERE enabled = 1 ORDER BY sort_order' : 'SELECT user_id, display_name, description, enabled, sort_order, COALESCE(fake_pnl, 0) as fake_pnl, COALESCE(fake_win_rate, 0) as fake_win_rate, COALESCE(fake_trades, 0) as fake_trades, COALESCE(fake_subscribers, 0) as fake_subscribers, created_at, updated_at FROM copy_trading_providers ORDER BY enabled DESC, sort_order';
    return db.prepare(sql).all() as CopyTradingProvider[];
  } catch (e) {
    logger.error('CopyTradingBalanceDb', `getCopyTradingProviders error: ${(e as Error).message}`);
    return [];
  }
}

export function getAllProvidersWithStats(): Array<{ userId: string; username: string; displayName: string | null; description: string | null; enabled: boolean; totalPnl: number; wins: number; losses: number; winRate: number; subscribersCount: number; totalTrades: number; fakePnl: number; fakeWinRate: number; fakeTrades: number; fakeSubscribers: number }> {
  const providers = getCopyTradingProviders(true);
  const { listOrders } = require('./index');
  const { getSubscribers } = require('./copyTradingDb');
  const allClosed = listOrders({ status: 'closed', limit: 50000 });
  const pnlByClient = new Map<string, { pnl: number; wins: number; losses: number }>();
  for (const o of allClosed) {
    if (o.pnl == null) continue;
    const cur = pnlByClient.get(o.client_id) ?? { pnl: 0, wins: 0, losses: 0 };
    cur.pnl += o.pnl;
    if (o.pnl > 0) cur.wins++; else cur.losses++;
    pnlByClient.set(o.client_id, cur);
  }
  return providers.map(p => {
    const user = getUserById(p.user_id);
    const stats = pnlByClient.get(p.user_id) ?? { pnl: 0, wins: 0, losses: 0 };
    const totalTrades = stats.wins + stats.losses;
    const winRate = totalTrades > 0 ? (stats.wins / totalTrades) * 100 : 0;
    const subscribers = getSubscribers(p.user_id);
    return { 
      userId: p.user_id, 
      username: user?.username ?? p.user_id, 
      displayName: p.display_name, 
      description: p.description, 
      enabled: p.enabled === 1, 
      totalPnl: Math.round(stats.pnl * 100) / 100, 
      wins: stats.wins, 
      losses: stats.losses, 
      winRate: Math.round(winRate * 10) / 10, 
      subscribersCount: subscribers.length, 
      totalTrades,
      fakePnl: p.fake_pnl ?? 0,
      fakeWinRate: p.fake_win_rate ?? 0,
      fakeTrades: p.fake_trades ?? 0,
      fakeSubscribers: p.fake_subscribers ?? 0
    };
  }).sort((a, b) => (b.totalPnl + b.fakePnl) - (a.totalPnl + a.fakePnl));
}