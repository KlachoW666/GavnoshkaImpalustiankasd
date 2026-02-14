/**
 * Admin Service — агрегация данных для админ-панели.
 */

import { getAutoAnalyzeStatus } from '../routes/market';
import { initDb, getDb, listOrders, isMemoryStore } from '../db';
import { listActivationKeys, listUsers, getOnlineUserIds } from '../db/authDb';
import { emotionalFilterInstance } from './emotionalFilter';
import { config } from '../config';
import { logger } from '../lib/logger';

const emotionalFilter = emotionalFilterInstance;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Qqwdsaqe2123!fade!CryptoSignalPro228';
const inMemoryTokens = new Set<string>();

export function validateAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function createAdminToken(): string {
  const token = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 15);
  inMemoryTokens.add(token);
  try {
    initDb();
    const db = getDb();
    if (db) {
      db.prepare('INSERT OR REPLACE INTO admin_tokens (token) VALUES (?)').run(token);
    }
  } catch {}
  return token;
}

let adminTokensLoaded = false;
function loadAdminTokensFromDb(): void {
  if (adminTokensLoaded) return;
  adminTokensLoaded = true;
  try {
    initDb();
    const db = getDb();
    if (db) {
      const rows = db.prepare('SELECT token FROM admin_tokens').all() as { token: string }[];
      for (const r of rows) inMemoryTokens.add(r.token);
    }
  } catch {}
}

/** Предзагрузка токенов при старте сервера (вызывать после initDb) */
export function preloadAdminTokens(): void {
  loadAdminTokensFromDb();
}

export function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  loadAdminTokensFromDb();
  if (inMemoryTokens.has(token)) return true;
  try {
    const db = getDb();
    if (db) {
      const row = db.prepare('SELECT 1 FROM admin_tokens WHERE token = ?').get(token);
      if (row) {
        inMemoryTokens.add(token);
        return true;
      }
    }
  } catch {}
  return false;
}

export interface DashboardData {
  system: {
    online: boolean;
    autoTrading: 'active' | 'inactive';
    websocket: 'connected';
    okxApi: 'connected' | 'disconnected';
    database: 'ok' | 'error';
    databaseMode?: 'sqlite' | 'memory';
    uptimeSeconds: number;
  };
  trading: {
    totalTrades24h: number;
    winRate: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    bestTrade: { pnl: number; pair: string } | null;
    worstTrade: { pnl: number; pair: string } | null;
    openPositionsCount: number;
    openPositions: Array<{ pair: string; direction: string; pnl: number; pnlPercent: number }>;
  };
  risk: {
    dailyDrawdownPercent: number;
    dailyDrawdownLimitPercent: number;
    openPositions: number;
    maxPositions: number;
    consecutiveLosses: number;
    maxConsecutiveLosses: number;
    canOpenTrade: boolean;
    reason: string;
  };
  keysStats: {
    byDuration: Record<number, { used: number; total: number }>;
    totalUsed: number;
    totalCreated: number;
  };
  topUsers: Array<{ userId: string; username: string; totalPnl: number; okxBalance: number | null }>;
  usersStats: { total: number; premium: number; inactive: number; online: number };
}

const startTime = Date.now();

export async function getDashboardData(): Promise<DashboardData> {
  initDb();
  const orders = listOrders({ status: 'closed', limit: 2000 });
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const orders24h = orders.filter((o) => {
    const closeTime = o.close_time ? new Date(o.close_time).getTime() : 0;
    return closeTime >= since24h;
  });
  const withPnl = orders24h.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
  const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
  const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
  const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const totalTrades = withPnl.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  let bestTrade: { pnl: number; pair: string } | null = null;
  let worstTrade: { pnl: number; pair: string } | null = null;
  if (withPnl.length > 0) {
    const best = withPnl.reduce((a, b) => ((a.pnl ?? 0) > (b.pnl ?? 0) ? a : b));
    const worst = withPnl.reduce((a, b) => ((a.pnl ?? 0) < (b.pnl ?? 0) ? a : b));
    bestTrade = { pnl: best.pnl ?? 0, pair: best.pair };
    worstTrade = { pnl: worst.pnl ?? 0, pair: worst.pair };
  }
  const openOrders = listOrders({ status: 'open', limit: 500 });
  const efState = emotionalFilter.getState();
  const canOpen = emotionalFilter.canOpenTrade();
  const autoStatus = getAutoAnalyzeStatus();

  const keys = listActivationKeys(1000);
  const byDuration: Record<number, { used: number; total: number }> = {};
  let totalUsed = 0;
  for (const k of keys) {
    const d = k.duration_days;
    if (!byDuration[d]) byDuration[d] = { used: 0, total: 0 };
    byDuration[d].total++;
    if (k.used_at) {
      byDuration[d].used++;
      totalUsed++;
    }
  }

  const closedOrders = listOrders({ status: 'closed', limit: 2000 });
  const pnlByUser: Record<string, number> = {};
  for (const o of closedOrders) {
    const id = o.client_id;
    if (!id) continue;
    pnlByUser[id] = (pnlByUser[id] ?? 0) + (o.pnl ?? 0);
  }
  const userIds = Object.keys(pnlByUser).sort((a, b) => (pnlByUser[b] ?? 0) - (pnlByUser[a] ?? 0)).slice(0, 5);
  const users = listUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const topUsers = userIds.map((userId) => ({
    userId,
    username: userMap.get(userId)?.username ?? userId,
    totalPnl: pnlByUser[userId] ?? 0,
    okxBalance: null as number | null
  }));

  const now = Date.now();
  let premium = 0;
  for (const u of users) {
    const exp = (u as { activation_expires_at?: string | null }).activation_expires_at;
    if (exp && new Date(exp).getTime() > now) premium++;
  }
  const onlineIds = getOnlineUserIds();
  const usersStats = {
    total: users.length,
    premium,
    inactive: users.length - premium,
    online: onlineIds.length
  };

  const dayStart = efState.dayStartBalance > 0 ? efState.dayStartBalance : 1;
  const dailyDrawdownPct = ((efState.currentBalance - dayStart) / dayStart) * 100;

  let okxApi: 'connected' | 'disconnected' = 'disconnected';
  try {
    if (config.okx.hasCredentials) {
      okxApi = 'connected';
    }
  } catch {}

  let database: 'ok' | 'error' = 'ok';
  try {
    listOrders({ limit: 1 });
  } catch (e) {
    logger.warn('Admin', 'DB check failed: ' + (e as Error).message);
    database = 'error';
  }
  const databaseMode = isMemoryStore() ? 'memory' : 'sqlite';

  return {
    system: {
      online: true,
      autoTrading: autoStatus.running ? 'active' : 'inactive',
      websocket: 'connected',
      okxApi,
      database,
      databaseMode,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
    },
    trading: {
      totalTrades24h: totalTrades,
      winRate,
      wins: wins.length,
      losses: losses.length,
      totalPnl,
      totalPnlPercent: dayStart > 0 ? ((efState.currentBalance - dayStart) / dayStart) * 100 : 0,
      bestTrade,
      worstTrade,
      openPositionsCount: openOrders.length,
      openPositions: []
    },
    risk: {
      dailyDrawdownPercent: dailyDrawdownPct,
      dailyDrawdownLimitPercent: -5,
      openPositions: openOrders.length,
      maxPositions: 3,
      consecutiveLosses: efState.lossStreak ?? 0,
      maxConsecutiveLosses: 3,
      canOpenTrade: canOpen.allowed,
      reason: canOpen.reason ?? ''
    },
    keysStats: { byDuration, totalUsed, totalCreated: keys.length },
    topUsers,
    usersStats
  };
}
