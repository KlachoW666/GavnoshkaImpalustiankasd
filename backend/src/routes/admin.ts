/**
 * Admin API — дашборд, статус, быстрые действия.
 */

import { Router, Request, Response } from 'express';
import { getDashboardData, validateAdminPassword, createAdminToken, validateAdminToken } from '../services/adminService';
import { stopAutoAnalyze, getAutoAnalyzeStatus, startAutoAnalyzeForUser } from './market';
import { listOrders } from '../db';
import {
  listUsers,
  listGroups,
  updateUserGroup,
  updateGroupTabs,
  createActivationKeys,
  listActivationKeys,
  revokeActivationKey,
  createGroup,
  deleteGroup,
  banUser,
  unbanUser,
  getOnlineUserIds,
  deleteUser
} from '../db/authDb';
import {
  listSubscriptionPlans,
  getSubscriptionPlan,
  createOrUpdateSubscriptionPlan,
  deleteSubscriptionPlan
} from '../db/subscriptionPlans';
import { getSignals } from './signals';
import { logger, getRecentLogs } from '../lib/logger';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!validateAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/** POST /api/admin/login — вход по паролю, возвращает токен */
router.post('/login', (req: Request, res: Response) => {
  try {
    const password = (req.body?.password as string) || '';
    if (!validateAdminPassword(password)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    const token = createAdminToken();
    res.json({ ok: true, token });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/dashboard — данные для главной панели */
router.get('/dashboard', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/system/status — краткий статус системы */
router.get('/system/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(data.system);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/trading/status — статус авто-торговли (у всех пользователей) */
router.get('/trading/status', requireAdmin, (_req: Request, res: Response) => {
  try {
    const status = getAutoAnalyzeStatus();
    res.json(status);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/trading/start — запустить авто-торговлю (админ, без привязки к пользователю) */
router.post('/trading/start', requireAdmin, (req: Request, res: Response) => {
  try {
    const result = startAutoAnalyzeForUser('admin_global', req.body);
    res.json(result);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/trading/stop — остановить авто-торговлю у всех */
router.post('/trading/stop', requireAdmin, (_req: Request, res: Response) => {
  try {
    stopAutoAnalyze();
    res.json({ ok: true, status: 'stopped' });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/trading/emergency — экстренная остановка у всех */
router.post('/trading/emergency', requireAdmin, (_req: Request, res: Response) => {
  try {
    stopAutoAnalyze();
    res.json({ ok: true, status: 'emergency_stop' });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/trades/history — история сделок из БД */
router.get('/trades/history', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const clientId = req.query.clientId as string | undefined;
    const orders = listOrders({ clientId, status: 'closed', limit });
    const history = orders.map((o) => ({
      id: o.id,
      clientId: o.client_id,
      pair: o.pair,
      direction: o.direction,
      size: o.size,
      leverage: o.leverage,
      openPrice: o.open_price,
      closePrice: o.close_price,
      stopLoss: o.stop_loss,
      takeProfit: o.take_profit ? JSON.parse(o.take_profit) : undefined,
      pnl: o.pnl,
      pnlPercent: o.pnl_percent,
      openTime: o.open_time,
      closeTime: o.close_time,
      status: o.status
    }));
    res.json(history);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/signals/history — история сигналов */
router.get('/signals/history', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const signals = getSignals(limit);
    res.json(signals);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/analytics — аналитика по ордерам */
router.get('/analytics', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 500;
    const orders = listOrders({ status: 'closed', limit });
    const withPnl = orders.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
    const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
    const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
    const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const totalTrades = withPnl.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const grossProfit = wins.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, o) => s + (o.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    res.json({
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      grossProfit,
      grossLoss,
      profitFactor,
      bestTrade: withPnl.length ? Math.max(...withPnl.map((o) => o.pnl ?? 0)) : 0,
      worstTrade: withPnl.length ? Math.min(...withPnl.map((o) => o.pnl ?? 0)) : 0
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/logs — последние логи сервера из буфера */
router.get('/logs', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);
    const entries = getRecentLogs(limit);
    res.json({ logs: entries });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ logs: [], error: (e as Error).message });
  }
});

/** ——— Super-Admin: пользователи и группы ——— */

/** GET /api/admin/users — список пользователей */
router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  try {
    const onlineIds = new Set(getOnlineUserIds());
    const users = listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      groupId: u.group_id,
      groupName: u.group_name,
      banned: u.banned ?? 0,
      banReason: u.ban_reason ?? null,
      createdAt: u.created_at,
      online: onlineIds.has(u.id)
    }));
    res.json(users);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/users/:id — назначить группу пользователю */
router.put('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const groupId = parseInt(req.body?.groupId as string, 10);
    if (!userId || !Number.isInteger(groupId) || groupId < 1) {
      res.status(400).json({ error: 'groupId обязателен (число >= 1)' });
      return;
    }
    updateUserGroup(userId, groupId);
    res.json({ ok: true, userId, groupId });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/users/:id/ban — забанить пользователя */
router.post('/users/:id/ban', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const reason = (req.body?.reason as string) || 'Нарушение правил';
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    banUser(userId, reason);
    logger.info('Admin', `User banned: ${userId}, reason: ${reason}`);
    res.json({ ok: true, userId, banned: true, reason });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/users/:id/unban — разбанить пользователя */
router.post('/users/:id/unban', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    unbanUser(userId);
    logger.info('Admin', `User unbanned: ${userId}`);
    res.json({ ok: true, userId, banned: false });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/admin/users/:id — удалить пользователя */
router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    deleteUser(userId);
    logger.info('Admin', `User deleted: ${userId}`);
    res.json({ ok: true, userId });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/groups — список групп с вкладками */
router.get('/groups', requireAdmin, (_req: Request, res: Response) => {
  try {
    const groups = listGroups().map((g) => ({
      id: g.id,
      name: g.name,
      allowedTabs: JSON.parse(g.allowed_tabs) as string[]
    }));
    res.json(groups);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/groups/:id — обновить вкладки группы */
router.put('/groups/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const allowedTabs = req.body?.allowedTabs as string[] | undefined;
    if (!Number.isInteger(groupId) || groupId < 1 || !Array.isArray(allowedTabs)) {
      res.status(400).json({ error: 'allowedTabs — массив id вкладок' });
      return;
    }
    updateGroupTabs(groupId, JSON.stringify(allowedTabs));
    res.json({ ok: true, groupId, allowedTabs });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/groups — создать новую группу */
router.post('/groups', requireAdmin, (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const allowedTabs = (req.body?.allowedTabs as string[] | undefined) ?? [];
    if (!name) {
      res.status(400).json({ error: 'name обязателен' });
      return;
    }
    const row = createGroup(name, JSON.stringify(allowedTabs));
    res.json({ id: row.id, name: row.name, allowedTabs });
  } catch (e) {
    const msg = (e as Error).message || 'Ошибка создания группы';
    const status = msg.includes('уже существует') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

/** DELETE /api/admin/groups/:id — удалить группу (если не системная и без пользователей) */
router.delete('/groups/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    if (!Number.isInteger(groupId) || groupId < 1) {
      res.status(400).json({ error: 'Некорректный groupId' });
      return;
    }
    deleteGroup(groupId);
    res.json({ ok: true, groupId });
  } catch (e) {
    const msg = (e as Error).message || 'Ошибка удаления группы';
    const status = msg.includes('Нельзя удалить') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

/** ——— Super-Admin: ключи активации ——— */

/** GET /api/admin/activation-keys — список ключей */
router.get('/activation-keys', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
    const keys = listActivationKeys(limit).map((k) => ({
      id: k.id,
      key: k.key,
      durationDays: k.duration_days,
      note: k.note,
      createdAt: k.created_at,
      usedByUserId: k.used_by_user_id,
      usedAt: k.used_at,
      revokedAt: k.revoked_at
    }));
    res.json(keys);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/activation-keys/generate — генерация ключей */
router.post('/activation-keys/generate', requireAdmin, (req: Request, res: Response) => {
  try {
    const durationDays = parseInt(req.body?.durationDays as string, 10);
    const count = req.body?.count != null ? parseInt(req.body.count as string, 10) : 1;
    const note = req.body?.note != null ? String(req.body.note) : null;
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      res.status(400).json({ error: 'durationDays обязателен (число >= 1)' });
      return;
    }
    const keys = createActivationKeys({ durationDays, count, note }).map((k) => ({
      id: k.id,
      key: k.key,
      durationDays: k.duration_days,
      note: k.note,
      createdAt: k.created_at
    }));
    res.json({ ok: true, keys });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/activation-keys/:id/revoke — отзыв ключа */
router.post('/activation-keys/:id/revoke', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    revokeActivationKey(id);
    res.json({ ok: true, id });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** ——— Super-Admin: тарифы подписки (для бота) ——— */

/** GET /api/admin/subscription-plans — список тарифов */
router.get('/subscription-plans', requireAdmin, (_req: Request, res: Response) => {
  try {
    const plans = listSubscriptionPlans(false).map((p) => ({
      id: p.id,
      days: p.days,
      priceUsd: p.price_usd,
      priceStars: p.price_stars,
      discountPercent: p.discount_percent,
      enabled: p.enabled,
      sortOrder: p.sort_order
    }));
    res.json(plans);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/subscription-plans/:id — один тариф */
router.get('/subscription-plans/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = getSubscriptionPlan(id);
    if (!p) {
      res.status(404).json({ error: 'Тариф не найден' });
      return;
    }
    res.json({ id: p.id, days: p.days, priceUsd: p.price_usd, priceStars: p.price_stars, discountPercent: p.discount_percent, enabled: p.enabled, sortOrder: p.sort_order });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/subscription-plans — создать тариф */
router.post('/subscription-plans', requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const days = Math.max(1, Math.floor(Number(body.days) || 30));
    const priceUsd = Math.max(0, Number(body.priceUsd) ?? 0);
    const priceStars = Math.max(0, Math.floor(Number(body.priceStars) ?? 0));
    const discountPercent = Math.max(0, Math.min(100, Math.floor(Number(body.discountPercent) ?? 0)));
    const enabled = body.enabled !== false && body.enabled !== 0 ? 1 : 0;
    const sortOrder = Math.floor(Number(body.sortOrder) ?? 0);
    const row = createOrUpdateSubscriptionPlan({ days, price_usd: priceUsd, price_stars: priceStars, discount_percent: discountPercent, enabled, sort_order: sortOrder });
    res.json({ id: row.id, days: row.days, priceUsd: row.price_usd, priceStars: row.price_stars, discountPercent: row.discount_percent, enabled: row.enabled, sortOrder: row.sort_order });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/subscription-plans/:id — обновить тариф */
router.put('/subscription-plans/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    const days = body.days != null ? Math.max(1, Math.floor(Number(body.days))) : undefined;
    const priceUsd = body.priceUsd != null ? Math.max(0, Number(body.priceUsd)) : undefined;
    const priceStars = body.priceStars != null ? Math.max(0, Math.floor(Number(body.priceStars))) : undefined;
    const discountPercent = body.discountPercent != null ? Math.max(0, Math.min(100, Math.floor(Number(body.discountPercent)))) : undefined;
    const enabled = body.enabled !== undefined ? (body.enabled !== false && body.enabled !== 0 ? 1 : 0) : undefined;
    const sortOrder = body.sortOrder != null ? Math.floor(Number(body.sortOrder)) : undefined;
    const existing = getSubscriptionPlan(id);
    if (!existing) {
      res.status(404).json({ error: 'Тариф не найден' });
      return;
    }
    const row = createOrUpdateSubscriptionPlan({
      id,
      days: days ?? existing.days,
      price_usd: priceUsd ?? existing.price_usd,
      price_stars: priceStars ?? existing.price_stars,
      discount_percent: discountPercent ?? existing.discount_percent,
      enabled: enabled ?? existing.enabled,
      sort_order: sortOrder ?? existing.sort_order
    });
    res.json({ id: row.id, days: row.days, priceUsd: row.price_usd, priceStars: row.price_stars, discountPercent: row.discount_percent, enabled: row.enabled, sortOrder: row.sort_order });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/admin/subscription-plans/:id — удалить тариф */
router.delete('/subscription-plans/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = deleteSubscriptionPlan(id);
    if (!deleted) {
      res.status(404).json({ error: 'Тариф не найден' });
      return;
    }
    res.json({ ok: true, id });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
