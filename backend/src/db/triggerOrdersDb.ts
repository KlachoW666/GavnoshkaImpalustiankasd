/**
 * Trigger (conditional) orders — Bitget-style условные ордера
 */

import { getDb, initDb } from './index';
import { logger } from '../lib/logger';

export interface TriggerOrderRow {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  trigger_price: number;
  order_type: 'limit' | 'market';
  limit_price: number | null;
  status: 'pending' | 'executed' | 'cancelled';
  created_at: string | null;
}

export function insertTriggerOrder(p: {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  trigger_price: number;
  order_type?: 'limit' | 'market';
  limit_price?: number;
}): void {
  initDb();
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO trigger_orders (id, user_id, symbol, direction, size_usdt, leverage, trigger_price, order_type, limit_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      p.id,
      p.user_id,
      p.symbol,
      p.direction,
      p.size_usdt,
      p.leverage,
      p.trigger_price,
      p.order_type ?? 'market',
      p.limit_price ?? null
    );
  } catch (err) {
    logger.warn('TriggerOrdersDB', (err as Error).message);
  }
}

export function listTriggerOrders(userId: string, status?: 'pending' | 'executed' | 'cancelled'): TriggerOrderRow[] {
  initDb();
  const db = getDb();
  if (!db) return [];
  try {
    if (status) {
      return db.prepare('SELECT * FROM trigger_orders WHERE user_id = ? AND status = ? ORDER BY created_at DESC')
        .all(userId, status) as TriggerOrderRow[];
    }
    return db.prepare('SELECT * FROM trigger_orders WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as TriggerOrderRow[];
  } catch {
    return [];
  }
}

export function getTriggerOrderById(id: string): TriggerOrderRow | null {
  initDb();
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM trigger_orders WHERE id = ?').get(id) as TriggerOrderRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function cancelTriggerOrder(id: string, userId: string): boolean {
  initDb();
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare("UPDATE trigger_orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'")
      .run(id, userId);
    return (db.prepare('SELECT changes()').get() as { 'changes()': number })['changes()'] > 0;
  } catch {
    return false;
  }
}
