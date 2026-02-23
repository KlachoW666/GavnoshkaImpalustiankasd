/**
 * Копитрейдинг API: подписка на провайдеров, список провайдеров и подписок.
 */

import { Router, Request, Response } from 'express';
import { getBearerToken } from './auth';
import { findSessionUserId } from '../db/authDb';
import {
  addSubscription,
  removeSubscription,
  getSubscriptionsForSubscriber,
  getSubscribers,
  getProviderIdsWithSubscribers,
  getProviderWithUsername,
  isSubscribed
} from '../db/copyTradingDb';
import { initDb, listOrders } from '../db';
import { logger } from '../lib/logger';

const router = Router();

function getUserId(req: Request): string | null {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return findSessionUserId(token);
  } catch {
    return null;
  }
}

/** POST /api/copy-trading/subscribe — подписаться на провайдера */
router.post('/subscribe', (req: Request, res: Response) => {
  const subscriberId = getUserId(req);
  if (!subscriberId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }
  const providerId = (req.body?.providerId ?? req.body?.provider_id) as string;
  if (!providerId || typeof providerId !== 'string') {
    res.status(400).json({ error: 'providerId обязателен' });
    return;
  }
  if (providerId === subscriberId) {
    res.status(400).json({ error: 'Нельзя подписаться на себя' });
    return;
  }
  const sizePercent = Math.max(5, Math.min(100, Number(req.body?.sizePercent ?? req.body?.size_percent) || 25));
  const profitSharePercent = Math.max(0, Math.min(100, Number(req.body?.profitSharePercent ?? req.body?.profit_share_percent) || 10));
  try {
    addSubscription(providerId.trim(), subscriberId, sizePercent, profitSharePercent);
    res.json({ ok: true, providerId: providerId.trim(), sizePercent, profitSharePercent });
  } catch (e) {
    logger.error('CopyTrading', 'subscribe error', { error: (e as Error).message });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/copy-trading/unsubscribe — отписаться */
router.post('/unsubscribe', (req: Request, res: Response) => {
  const subscriberId = getUserId(req);
  if (!subscriberId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }
  const providerId = (req.body?.providerId ?? req.body?.provider_id) as string;
  if (!providerId) {
    res.status(400).json({ error: 'providerId обязателен' });
    return;
  }
  try {
    removeSubscription(providerId.trim(), subscriberId);
    res.json({ ok: true, providerId: providerId.trim() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/copy-trading/subscriptions — мои подписки */
router.get('/subscriptions', (req: Request, res: Response) => {
  const subscriberId = getUserId(req);
  if (!subscriberId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }
  try {
    const subs = getSubscriptionsForSubscriber(subscriberId);
    const withUsername = subs.map((s) => {
      const p = getProviderWithUsername(s.provider_id);
      return {
        providerId: s.provider_id,
        username: p?.username ?? s.provider_id,
        sizePercent: s.size_percent,
        profitSharePercent: s.profit_share_percent ?? 10,
        createdAt: s.created_at
      };
    });
    res.json({ subscriptions: withUsername });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message, subscriptions: [] });
  }
});

/** GET /api/copy-trading/providers — список провайдеров (у кого есть подписчики) со статистикой */
router.get('/providers', (req: Request, res: Response) => {
  try {
    initDb();
    const providerIds = getProviderIdsWithSubscribers();
    const closed = listOrders({ status: 'closed', limit: 5000 });
    const byClient = new Map<string, { pnl: number; wins: number; losses: number }>();
    for (const o of closed) {
      if (o.pnl == null) continue;
      const cur = byClient.get(o.client_id) ?? { pnl: 0, wins: 0, losses: 0 };
      cur.pnl += o.pnl;
      if (o.pnl > 0) cur.wins++;
      else cur.losses++;
      byClient.set(o.client_id, cur);
    }
    const list = providerIds.map((id) => {
      const p = getProviderWithUsername(id);
      const stats = byClient.get(id) ?? { pnl: 0, wins: 0, losses: 0 };
      const subs = getSubscribers(id);
      return {
        providerId: id,
        username: p?.username ?? id,
        totalPnl: Math.round(stats.pnl * 100) / 100,
        wins: stats.wins,
        losses: stats.losses,
        subscribersCount: subs.length
      };
    });
    list.sort((a, b) => b.totalPnl - a.totalPnl);
    res.json({ providers: list });
  } catch (e) {
    logger.error('CopyTrading', 'providers error', { error: (e as Error).message });
    res.status(500).json({ error: (e as Error).message, providers: [] });
  }
});

/** GET /api/copy-trading/check?providerId= — проверка, подписан ли текущий пользователь */
router.get('/check', (req: Request, res: Response) => {
  const subscriberId = getUserId(req);
  const providerId = (req.query?.providerId ?? req.query?.provider_id) as string;
  if (!subscriberId || !providerId) {
    res.json({ subscribed: false });
    return;
  }
  res.json({ subscribed: isSubscribed(providerId, subscriberId) });
});

export default router;
