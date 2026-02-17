/**
 * Публичная статистика для главной страницы приложения.
 * Ордера (плюс/минус), пользователи, объём заработанных денег, статус.
 * При включённой демо-статистике возвращает display — значения растут автоматически от даты запуска (сервер).
 */

import { Router, Request, Response } from 'express';
import { initDb, listOrders, isMemoryStore } from '../db';
import { getActiveSessionsCount, getTotalUsersCount } from '../db/authDb';
import { config } from '../config';
import { getStatsDisplayConfig, computeDisplayStats, DisplayStats } from '../services/statsDisplayService';

const router = Router();

export interface StatsResponse {
  orders: {
    total: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    winRate: number;
    openCount: number;
  };
  usersCount: number;
  onlineUsersCount: number;
  volumeEarned: number;
  status: 'ok' | 'degraded';
  databaseMode: 'sqlite' | 'memory';
  okxConnected: boolean;
  /** Включена ли демо-статистика (рост от даты запуска на сервере) */
  displayEnabled?: boolean;
  /** Значения для отображения (если displayEnabled) — объём, ордера, пользователи, сигналы */
  display?: DisplayStats;
}

/** GET /api/stats — агрегированная статистика для главной страницы */
router.get('/', (_req: Request, res: Response) => {
  try {
    initDb();
    const closed = listOrders({ status: 'closed', limit: 5000 });
    const open = listOrders({ status: 'open', limit: 500 });
    const withPnl = closed.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
    const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
    const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
    const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const totalTrades = withPnl.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    const usersCount = getTotalUsersCount();
    const onlineUsersCount = getActiveSessionsCount();

    const orders = {
      total: closed.length + open.length,
      wins: wins.length,
      losses: losses.length,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPercent: totalTrades > 0 ? withPnl.reduce((s, o) => s + (o.pnl_percent ?? 0), 0) / totalTrades : 0,
      winRate: Math.round(winRate * 10) / 10,
      openCount: open.length
    };

    const volumeEarned = Math.round(totalPnl * 100) / 100;
    const realStats = {
      orders,
      usersCount,
      onlineUsersCount,
      volumeEarned
    };

    const displayConfig = getStatsDisplayConfig();
    const displayEnabled = displayConfig.enabled;
    const display = displayEnabled
      ? computeDisplayStats(realStats, 0, displayConfig)
      : undefined;

    res.json({
      ...realStats,
      status: 'ok',
      databaseMode: isMemoryStore() ? 'memory' : 'sqlite',
      okxConnected: config.bitget.hasCredentials,
      displayEnabled: displayEnabled || undefined,
      display
    } as StatsResponse);
  } catch (e) {
    res.status(500).json({
      orders: { total: 0, wins: 0, losses: 0, totalPnl: 0, totalPnlPercent: 0, winRate: 0, openCount: 0 },
      usersCount: 0,
      onlineUsersCount: 0,
      volumeEarned: 0,
      status: 'degraded',
      databaseMode: 'memory',
      okxConnected: false
    });
  }
});

export default router;
