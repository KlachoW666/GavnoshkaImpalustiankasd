/**
 * Internal Trading DB — позиции внутри сайта (баланс пользователя)
 */

import { getDb, initDb } from './index';

export interface InternalPosition {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  open_price: number;
  close_price: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  open_time: string;
  close_time: string | null;
  status: 'open' | 'closed';
}

export function insertInternalPosition(p: {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  open_price: number;
  status?: 'open' | 'closed';
}): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO internal_positions (id, user_id, symbol, direction, size_usdt, leverage, open_price, status, open_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(p.id, p.user_id, p.symbol, p.direction, p.size_usdt, p.leverage, p.open_price, p.status || 'open');
  } catch {}
}

export function getOpenPositions(userId: string): InternalPosition[] {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM internal_positions WHERE user_id = ? AND status = ? ORDER BY open_time DESC')
      .all(userId, 'open') as InternalPosition[];
  } catch {
    return [];
  }
}

export function getPositionById(id: string): InternalPosition | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM internal_positions WHERE id = ?').get(id) as InternalPosition | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function closeInternalPosition(id: string, closePrice: number, pnl: number, pnlPercent: number): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare(`
      UPDATE internal_positions SET close_price = ?, pnl = ?, pnl_percent = ?, close_time = datetime('now'), status = ?
      WHERE id = ? AND status = 'open'
    `).run(closePrice, pnl, pnlPercent, 'closed', id);
    return (db.prepare('SELECT changes()').get() as { 'changes()': number })['changes()'] > 0;
  } catch {
    return false;
  }
}

export function getClosedPositions(userId: string, limit = 50): InternalPosition[] {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM internal_positions WHERE user_id = ? AND status = ? ORDER BY close_time DESC LIMIT ?')
      .all(userId, 'closed', limit) as InternalPosition[];
  } catch {
    return [];
  }
}
