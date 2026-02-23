/**
 * Копитрейдинг: подписки подписчик -> провайдер, доля размера (size_percent).
 */

import { getDb, initDb, isMemoryStore } from './index';
import { getUserById } from './authDb';
import { getOrCreateCopyTradingBalance } from './copyTradingBalanceDb';
import { getProfitState, upsertProfitState, type CopySubscriptionProfitState } from '../services/copyTradingProfitShareService';

export interface CopySubscriptionRow {
  provider_id: string;
  subscriber_id: string;
  size_percent: number;
  profit_share_percent: number;
  created_at: string;
}

const memorySubscriptions: CopySubscriptionRow[] = [];

function ensureCopyTables(): void {
  initDb();
}

export function addSubscription(
  providerId: string, 
  subscriberId: string, 
  sizePercent: number,
  profitSharePercent: number = 10
): void {
  if (providerId === subscriberId) return;
  ensureCopyTables();
  const size = Math.max(5, Math.min(100, sizePercent));
  const profitShare = Math.max(0, Math.min(100, profitSharePercent));
  if (isMemoryStore()) {
    const idx = memorySubscriptions.findIndex((s) => s.provider_id === providerId && s.subscriber_id === subscriberId);
    const row: CopySubscriptionRow = { 
      provider_id: providerId, 
      subscriber_id: subscriberId, 
      size_percent: size, 
      profit_share_percent: profitShare,
      created_at: new Date().toISOString() 
    };
    if (idx >= 0) memorySubscriptions[idx] = row;
    else memorySubscriptions.push(row);
    
    const key = `${subscriberId}:${providerId}`;
    const balance = getOrCreateCopyTradingBalance(subscriberId);
    const profitState: CopySubscriptionProfitState = {
      subscriber_id: subscriberId,
      provider_id: providerId,
      balance_after_last_distribution: balance.balance_usdt,
      last_distribution_at: null
    };
    upsertProfitState(profitState);
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare(
    `INSERT INTO copy_subscriptions (provider_id, subscriber_id, size_percent, profit_share_percent, created_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(provider_id, subscriber_id) DO UPDATE SET size_percent = excluded.size_percent, profit_share_percent = excluded.profit_share_percent`
  ).run(providerId, subscriberId, size, profitShare);

  const balance = getOrCreateCopyTradingBalance(subscriberId);
  const existingState = getProfitState(subscriberId, providerId);
  if (!existingState) {
    const profitState: CopySubscriptionProfitState = {
      subscriber_id: subscriberId,
      provider_id: providerId,
      balance_after_last_distribution: balance.balance_usdt,
      last_distribution_at: null
    };
    upsertProfitState(profitState);
  }
}

export function removeSubscription(providerId: string, subscriberId: string): void {
  ensureCopyTables();
  if (isMemoryStore()) {
    const idx = memorySubscriptions.findIndex((s) => s.provider_id === providerId && s.subscriber_id === subscriberId);
    if (idx >= 0) memorySubscriptions.splice(idx, 1);
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare('DELETE FROM copy_subscriptions WHERE provider_id = ? AND subscriber_id = ?').run(providerId, subscriberId);
}

export function getSubscribers(providerId: string): CopySubscriptionRow[] {
  ensureCopyTables();
  if (isMemoryStore()) {
    return memorySubscriptions.filter((s) => s.provider_id === providerId);
  }
  const db = getDb();
  if (!db) return [];
  return db.prepare('SELECT * FROM copy_subscriptions WHERE provider_id = ?').all(providerId) as CopySubscriptionRow[];
}

export function getSubscriptionsForSubscriber(subscriberId: string): CopySubscriptionRow[]{
  ensureCopyTables();
  if (isMemoryStore()) {
    return memorySubscriptions.filter((s) => s.subscriber_id === subscriberId);
  }
  const db = getDb();
  if (!db) return [];
  return db.prepare('SELECT * FROM copy_subscriptions WHERE subscriber_id = ?').all(subscriberId) as CopySubscriptionRow[];
}

export function isSubscribed(providerId: string, subscriberId: string): boolean{
  if (isMemoryStore()) {
    return memorySubscriptions.some((s) => s.provider_id === providerId && s.subscriber_id === subscriberId);
  }
  const db = getDb();
  if (!db) return false;
  const row = db.prepare('SELECT 1 FROM copy_subscriptions WHERE provider_id = ? AND subscriber_id = ?').get(providerId, subscriberId);
  return !!row;
}

export function getSubscription(providerId: string, subscriberId: string): CopySubscriptionRow | null {
  ensureCopyTables();
  if (isMemoryStore()) {
    return memorySubscriptions.find((s) => s.provider_id === providerId && s.subscriber_id === subscriberId) ?? null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM copy_subscriptions WHERE provider_id = ? AND subscriber_id = ?').get(providerId, subscriberId);
  return (row as CopySubscriptionRow) ?? null;
}

/** Список провайдеров (у кого есть хотя бы один подписчик), с username */
export function getProviderIdsWithSubscribers(): string[] {
  ensureCopyTables();
  if (isMemoryStore()) {
    return [...new Set(memorySubscriptions.map((s) => s.provider_id))];
  }
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare('SELECT DISTINCT provider_id FROM copy_subscriptions').all() as { provider_id: string }[];
  return rows.map((r) => r.provider_id);
}

export function getProviderWithUsername(providerId: string): { id: string; username: string } | null {
  const u = getUserById(providerId);
  if (!u) return null;
  return { id: u.id, username: u.username };
}
