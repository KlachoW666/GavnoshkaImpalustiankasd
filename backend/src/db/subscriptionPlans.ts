/**
 * Тарифы подписки (для бота и админки).
 */

import { getDb, initDb, isMemoryStore } from './index';

export interface SubscriptionPlanRow {
  id: number;
  days: number;
  price_usd: number;
  price_stars: number;
  discount_percent: number;
  enabled: number;
  sort_order: number;
}

const defaultPlans: SubscriptionPlanRow[] = [
  { id: 1, days: 1, price_usd: 150, price_stars: 7000, discount_percent: 0, enabled: 1, sort_order: 1 },
  { id: 2, days: 7, price_usd: 750, price_stars: 35000, discount_percent: 0, enabled: 1, sort_order: 2 },
  { id: 3, days: 14, price_usd: 1470, price_stars: 70000, discount_percent: 30, enabled: 1, sort_order: 3 },
  { id: 4, days: 30, price_usd: 3150, price_stars: 150000, discount_percent: 30, enabled: 1, sort_order: 4 },
  { id: 5, days: 90, price_usd: 9450, price_stars: 500000, discount_percent: 30, enabled: 1, sort_order: 5 }
];

let memoryPlans: SubscriptionPlanRow[] = [...defaultPlans];

function ensurePlans(): void {
  initDb();
}

/** Список тарифов. Для бота — только включённые. */
export function listSubscriptionPlans(enabledOnly = false): SubscriptionPlanRow[] {
  ensurePlans();
  if (isMemoryStore()) {
    const list = memoryPlans.filter((p) => !enabledOnly || p.enabled === 1);
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }
  const db = getDb();
  if (!db) {
    const list = defaultPlans.filter((p) => !enabledOnly || p.enabled === 1);
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }
  const where = enabledOnly ? ' WHERE enabled = 1' : '';
  const rows = db.prepare(`SELECT * FROM subscription_plans${where} ORDER BY sort_order ASC`).all() as SubscriptionPlanRow[];
  return rows;
}

export function getSubscriptionPlan(id: number): SubscriptionPlanRow | null {
  ensurePlans();
  if (isMemoryStore()) {
    const p = memoryPlans.find((x) => x.id === id);
    return p ?? null;
  }
  const db = getDb();
  if (!db) return defaultPlans.find((p) => p.id === id) ?? null;
  const row = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(id) as SubscriptionPlanRow | undefined;
  return row ?? null;
}

export function createOrUpdateSubscriptionPlan(data: {
  id?: number;
  days: number;
  price_usd: number;
  price_stars: number;
  discount_percent?: number;
  enabled?: number;
  sort_order?: number;
}): SubscriptionPlanRow {
  ensurePlans();
  const discount = data.discount_percent ?? 0;
  const enabled = data.enabled ?? 1;
  const sort_order = data.sort_order ?? 0;
  if (isMemoryStore()) {
    if (data.id != null) {
      const idx = memoryPlans.findIndex((p) => p.id === data.id);
      if (idx >= 0) {
        memoryPlans[idx] = {
          ...memoryPlans[idx],
          days: data.days,
          price_usd: data.price_usd,
          price_stars: data.price_stars,
          discount_percent: discount,
          enabled,
          sort_order
        };
        return memoryPlans[idx];
      }
    }
    const id = data.id ?? Math.max(0, ...memoryPlans.map((p) => p.id)) + 1;
    const row: SubscriptionPlanRow = { id, days: data.days, price_usd: data.price_usd, price_stars: data.price_stars, discount_percent: discount, enabled, sort_order };
    memoryPlans.push(row);
    memoryPlans.sort((a, b) => a.sort_order - b.sort_order);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  if (data.id != null) {
    const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(data.id) as SubscriptionPlanRow | undefined;
    if (existing) {
      db.prepare(
        'UPDATE subscription_plans SET days = ?, price_usd = ?, price_stars = ?, discount_percent = ?, enabled = ?, sort_order = ? WHERE id = ?'
      ).run(data.days, data.price_usd, data.price_stars, discount, enabled, sort_order, data.id);
      return { ...existing, days: data.days, price_usd: data.price_usd, price_stars: data.price_stars, discount_percent: discount, enabled, sort_order };
    }
  }
  const info = db.prepare(
    'INSERT INTO subscription_plans (days, price_usd, price_stars, discount_percent, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.days, data.price_usd, data.price_stars, discount, enabled, sort_order);
  const id = Number((info as { lastInsertRowid: number | bigint }).lastInsertRowid);
  return { id, days: data.days, price_usd: data.price_usd, price_stars: data.price_stars, discount_percent: discount, enabled, sort_order };
}

export function deleteSubscriptionPlan(id: number): boolean {
  ensurePlans();
  if (isMemoryStore()) {
    const idx = memoryPlans.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    memoryPlans.splice(idx, 1);
    return true;
  }
  const db = getDb();
  if (!db) return false;
  const info = db.prepare('DELETE FROM subscription_plans WHERE id = ?').run(id);
  return (info as { changes: number }).changes > 0;
}
