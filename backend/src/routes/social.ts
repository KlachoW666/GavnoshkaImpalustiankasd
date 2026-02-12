/**
 * Social trading: лидерборд по PnL, топ трейдеров.
 */

import { Router, Request, Response } from 'express';
import { initDb, listOrders } from '../db';
import { getUserById } from '../db/authDb';
import { getProviderIdsWithSubscribers } from '../db/copyTradingDb';
import { logger } from '../lib/logger';

const router = Router();

/** GET /api/social/leaderboard — топ пользователей по суммарному PnL (закрытые сделки) */
router.get('/leaderboard', (req: Request, res: Response) => {
  try {
    initDb();
    const limit = Math.min(50, Math.max(10, Number(req.query?.limit) || 20));
    const closed = listOrders({ status: 'closed', limit: 10000 });
    const byClient = new Map<string, { pnl: number; wins: number; losses: number; trades: number }>();
    for (const o of closed) {
      const cur = byClient.get(o.client_id) ?? { pnl: 0, wins: 0, losses: 0, trades: 0 };
      cur.trades++;
      if (o.pnl != null) {
        cur.pnl += o.pnl;
        if (o.pnl > 0) cur.wins++;
        else cur.losses++;
      }
      byClient.set(o.client_id, cur);
    }
    const providerIds = new Set(getProviderIdsWithSubscribers());
    const entries = Array.from(byClient.entries())
      .map(([clientId, s]) => ({
        userId: clientId,
        username: getUserById(clientId)?.username ?? clientId.slice(0, 12),
        totalPnl: Math.round(s.pnl * 100) / 100,
        wins: s.wins,
        losses: s.losses,
        trades: s.trades,
        winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 1000) / 10 : 0,
        isProvider: providerIds.has(clientId)
      }))
      .filter((e) => e.trades >= 1)
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, limit);
    res.json({ leaderboard: entries });
  } catch (e) {
    logger.error('Social', 'leaderboard error', { error: (e as Error).message });
    res.status(500).json({ error: (e as Error).message, leaderboard: [] });
  }
});

/** GET /api/social/user/:userId — публичный профиль трейдера (для отдельной страницы) */
router.get('/user/:userId', (req: Request, res: Response) => {
  try {
    initDb();
    const userId = req.params.userId?.trim();
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    const user = getUserById(userId);
    const closed = listOrders({ clientId: userId, status: 'closed', limit: 10000 });
    let pnl = 0;
    let wins = 0;
    let losses = 0;
    for (const o of closed) {
      if (o.pnl != null) {
        pnl += o.pnl;
        if (o.pnl > 0) wins++;
        else losses++;
      }
    }
    const trades = closed.length;
    const providerIds = new Set(getProviderIdsWithSubscribers());
    res.json({
      userId,
      username: user?.username ?? userId.slice(0, 12),
      totalPnl: Math.round(pnl * 100) / 100,
      wins,
      losses,
      trades,
      winRate: trades > 0 ? Math.round((wins / trades) * 1000) / 10 : 0,
      isProvider: providerIds.has(userId)
    });
  } catch (e) {
    logger.error('Social', 'user profile error', { error: (e as Error).message });
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
