/**
 * Wallet DB — балансы, адреса, депозиты, выводы
 */

import { getDb, initDb } from './index';
import { logger } from '../lib/logger';

export function getOrCreateWalletIndex(userId: string): number | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT derivation_index FROM user_wallet_addresses WHERE user_id = ?').get(userId) as { derivation_index: number } | undefined;
    if (row) return row.derivation_index;
    const maxRow = db.prepare('SELECT COALESCE(MAX(derivation_index), -1) + 1 as next_idx FROM user_wallet_addresses').get() as { next_idx: number };
    const nextIdx = maxRow.next_idx;
    db.prepare('INSERT INTO user_wallet_addresses (user_id, derivation_index, address) VALUES (?, ?, ?)').run(userId, nextIdx, '');
    return nextIdx;
  } catch {
    return null;
  }
}

export function updateWalletAddress(userId: string, derivationIndex: number, address: string): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('UPDATE user_wallet_addresses SET address = ? WHERE user_id = ? AND derivation_index = ?').run(address, userId, derivationIndex);
  } catch (err) { logger.warn('WalletDB', (err as Error).message); }
}

export function getWalletAddress(userId: string): { address: string; derivation_index: number } | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT address, derivation_index FROM user_wallet_addresses WHERE user_id = ?').get(userId) as { address: string; derivation_index: number } | undefined;
    return row ?? null;
  } catch (err) {
    logger.warn('WalletDB', `getWalletAddress failed: ${(err as Error).message}`);
    return null;
  }
}

export function getBalance(userId: string): number {
  initDb();
  const db = getDb();
  if (!db) return 0;
  try {
    const row = db.prepare('SELECT balance_usdt FROM user_balances WHERE user_id = ?').get(userId) as { balance_usdt: number } | undefined;
    return row?.balance_usdt ?? 0;
  } catch (err) {
    logger.warn('WalletDB', `getBalance failed: ${(err as Error).message}`);
    return 0;
  }
}

export function creditBalance(userId: string, amountUsdt: number): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO user_balances (user_id, balance_usdt, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        balance_usdt = balance_usdt + excluded.balance_usdt,
        updated_at = datetime('now')
    `).run(userId, amountUsdt);
  } catch (err) { logger.warn('WalletDB', (err as Error).message); }
}

export function debitBalance(userId: string, amountUsdt: number): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    const cur = getBalance(userId);
    if (cur < amountUsdt) return false;
    db.prepare('UPDATE user_balances SET balance_usdt = balance_usdt - ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(amountUsdt, userId);
    return true;
  } catch {
    return false;
  }
}

export function recordDeposit(userId: string, txHash: string, amountUsdt: number): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare('INSERT OR IGNORE INTO deposits (user_id, tx_hash, amount_usdt, status) VALUES (?, ?, ?, ?)').run(userId, txHash.toLowerCase(), amountUsdt, 'credited');
    const info = db.prepare('SELECT changes()').get() as { 'changes()': number };
    return (info['changes()'] ?? 0) > 0;
  } catch {
    return false;
  }
}

export function isDepositRecorded(txHash: string): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    const row = db.prepare('SELECT 1 FROM deposits WHERE tx_hash = ?').get(txHash.toLowerCase());
    return !!row;
  } catch {
    return false;
  }
}

export function getAddressByDerivationIndex(index: number): string | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT address FROM user_wallet_addresses WHERE derivation_index = ?').get(index) as { address: string } | undefined;
    return row?.address ?? null;
  } catch {
    return null;
  }
}

export function getUserIdByAddress(address: string): string | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT user_id FROM user_wallet_addresses WHERE LOWER(address) = LOWER(?)').get(address) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  } catch {
    return null;
  }
}

export function getAllAddressesWithIndex(): Array<{ user_id: string; derivation_index: number; address: string }> {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT user_id, derivation_index, address FROM user_wallet_addresses WHERE address != \'\'').all() as Array<{ user_id: string; derivation_index: number; address: string }>;
    return rows;
  } catch {
    return [];
  }
}

export function createWithdrawal(userId: string, amountUsdt: number, toAddress: string): number | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const res = db.prepare('INSERT INTO withdrawals (user_id, amount_usdt, to_address, status) VALUES (?, ?, ?, ?)').run(userId, amountUsdt, toAddress, 'pending');
    return res.lastInsertRowid as number;
  } catch (err) {
    logger.warn('WalletDB', `createWithdrawal failed: ${(err as Error).message}`);
    return null;
  }
}

export function updateWithdrawalTx(id: number, txHash: string): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('UPDATE withdrawals SET tx_hash = ?, status = ? WHERE id = ?').run(txHash, 'sent', id);
  } catch (err) { logger.warn('WalletDB', (err as Error).message); }
}

export function getPendingWithdrawals(): Array<{ id: number; user_id: string; amount_usdt: number; to_address: string; created_at: string }> {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT id, user_id, amount_usdt, to_address, created_at FROM withdrawals WHERE status = ? ORDER BY created_at ASC').all('pending') as any[];
  } catch {
    return [];
  }
}

export function getWithdrawalById(id: number): { user_id: string; amount_usdt: number; to_address: string; status: string } | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT user_id, amount_usdt, to_address, status FROM withdrawals WHERE id = ?').get(id) as any;
    return row ?? null;
  } catch {
    return null;
  }
}

export function rejectWithdrawal(id: number): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    const w = getWithdrawalById(id);
    if (!w || w.status !== 'pending') return false;
    db.prepare('UPDATE withdrawals SET status = ? WHERE id = ?').run('rejected', id);
    creditBalance(w.user_id, w.amount_usdt);
    return true;
  } catch {
    return false;
  }
}

export function getDepositsStats(): { count: number; total_usdt: number } {
  initDb();
  const db = getDb();
  if (!db) return { count: 0, total_usdt: 0 };
  try {
    const row = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(amount_usdt), 0) as total_usdt FROM deposits').get() as { count: number; total_usdt: number };
    return { count: row?.count ?? 0, total_usdt: row?.total_usdt ?? 0 };
  } catch {
    return { count: 0, total_usdt: 0 };
  }
}

export function getWithdrawalsStats(): { pending: number; sent: number; total_sent_usdt: number } {
  initDb();
  const db = getDb();
  if (!db) return { pending: 0, sent: 0, total_sent_usdt: 0 };
  try {
    const pendingRow = db.prepare('SELECT COUNT(*) as c FROM withdrawals WHERE status = ?').get('pending') as { c: number };
    const sentRow = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(amount_usdt), 0) as total FROM withdrawals WHERE status = ?').get('sent') as { c: number; total: number };
    return {
      pending: pendingRow?.c ?? 0,
      sent: sentRow?.c ?? 0,
      total_sent_usdt: sentRow?.total ?? 0
    };
  } catch {
    return { pending: 0, sent: 0, total_sent_usdt: 0 };
  }
}

export function getCustomAddress(derivationIndex: number, network: string): string | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT address FROM wallet_custom_addresses WHERE derivation_index = ? AND network = ?').get(derivationIndex, network) as { address: string } | undefined;
    return row?.address ?? null;
  } catch (err) {
    logger.warn('WalletDB', `getCustomAddress failed: ${(err as Error).message}`);
    return null;
  }
}

export function setCustomAddress(derivationIndex: number, network: string, address: string): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('INSERT OR REPLACE INTO wallet_custom_addresses (derivation_index, network, address) VALUES (?, ?, ?)').run(derivationIndex, network, address.trim());
  } catch (err) { logger.warn('WalletDB', (err as Error).message); }
}

export function getAllCustomAddresses(): Array<{ derivation_index: number; network: string; address: string }> {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT derivation_index, network, address FROM wallet_custom_addresses ORDER BY derivation_index, network').all() as any[];
  } catch {
    return [];
  }
}
