/**
 * Admin API — дашборд, статус, быстрые действия.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import ccxt from 'ccxt';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';
import { rateLimit } from '../middleware/rateLimit';
import { getDashboardData, validateAdminPassword, createAdminToken, validateAdminToken } from '../services/adminService';
import { stopAutoAnalyze, getAutoAnalyzeStatus, startAutoAnalyzeForUser } from './market';
import { initDb, listOrders, deleteOrders, getSetting, setSetting } from '../db';
import { computeAnalytics } from '../services/analyticsService';
import { emotionalFilterInstance } from '../services/emotionalFilter';
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
  deleteUser,
  getTelegramIdForUser,
  extendUserSubscription,
  getOkxCredentials,
  getBitgetCredentials,
  findUserByUsername,
  updateUserPassword,
  updateUsername,
  updateUserActivationExpiresAt
} from '../db/authDb';
import {
  listSubscriptionPlans,
  getSubscriptionPlan,
  createOrUpdateSubscriptionPlan,
  deleteSubscriptionPlan
} from '../db/subscriptionPlans';
import { getSignals } from './signals';
import { logger, getRecentLogs } from '../lib/logger';
import { listProxiesForAdmin, addProxy, deleteProxy, getProxy } from '../db/proxies';
import { getMaintenanceMode, setMaintenanceMode } from '../lib/maintenanceMode';
import { getStatsDisplayConfig, setStatsDisplayConfig, StatsDisplayConfig } from '../services/statsDisplayService';
import {
  getExternalAiConfig,
  setExternalAiConfig,
  hasAnyApiKey,
  hasOpenAiKey,
  hasAnthropicKey,
  hasGlmKey,
  hasCryptoPanicKey,
  hasGNewsKey,
  setOpenAiKey,
  setAnthropicKey,
  setGlmKey,
  setCryptoPanicKey,
  setGNewsKey,
  type ExternalAiConfig
} from '../services/externalAiService';
import {
  isHdWalletEnabled,
  setWalletConfigFromAdmin,
  getConfig,
  signWithdraw
} from '../services/hdWalletService';
import {
  getPendingWithdrawals,
  getWithdrawalById,
  rejectWithdrawal,
  getDepositsStats,
  getWithdrawalsStats,
  getWalletAddress,
  setCustomAddress,
  getAllCustomAddresses,
  updateWithdrawalTx,
  getBalance,
  setBalance,
  creditBalance
} from '../db/walletDb';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!validateAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const ADMIN_GROUP_ID = 3;

/** POST /api/admin/login — вход по логину+паролю (админ из БД) или по общему паролю (ADMIN_PASSWORD) */
router.post('/login', rateLimit({ windowMs: 60_000, max: 20 }), (req: Request, res: Response) => {
  try {
    const username = (req.body?.username as string)?.trim();
    const password = (req.body?.password as string) || '';
    if (!password) {
      res.status(401).json({ error: 'Пароль обязателен' });
      return;
    }
    if (username) {
      const user = findUserByUsername(username);
      if (!user) {
        res.status(401).json({ error: 'Неверный логин или пароль' });
        return;
      }
      if (user.group_id !== ADMIN_GROUP_ID) {
        res.status(403).json({ error: 'Доступ только для администраторов' });
        return;
      }
      const match = bcrypt.compareSync(password, user.password_hash);
      if (!match) {
        res.status(401).json({ error: 'Неверный логин или пароль' });
        return;
      }
      const token = createAdminToken();
      res.json({ ok: true, token });
      return;
    }
    if (!validateAdminPassword(password)) {
      res.status(401).json({ error: 'Неверный пароль' });
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
    const topWithBalance = await Promise.all(
      data.topUsers.map(async (u) => {
        const { okxBalance } = await fetchBitgetBalanceForUser(u.userId);
        return { ...u, okxBalance: okxBalance ?? null };
      })
    );
    res.json({ ...data, topUsers: topWithBalance });
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

const EMOTIONAL_FILTER_CONFIG_KEY = 'emotional_filter_config';

/** GET /api/admin/emotional-filter — пороги Emotional Filter */
router.get('/emotional-filter', requireAdmin, (_req: Request, res: Response) => {
  try {
    const cfg = emotionalFilterInstance.getConfig();
    res.json(cfg);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/emotional-filter — обновить пороги */
router.put('/emotional-filter', requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as { cooldownMinutes?: number; maxLossStreak?: number; maxDailyDrawdownPct?: number };
    const c = {
      cooldownMinutes: body.cooldownMinutes != null ? Math.max(1, Math.min(120, body.cooldownMinutes)) : undefined,
      maxLossStreak: body.maxLossStreak != null ? Math.max(1, Math.min(10, body.maxLossStreak)) : undefined,
      maxDailyDrawdownPct: body.maxDailyDrawdownPct != null ? Math.max(1, Math.min(50, body.maxDailyDrawdownPct)) : undefined
    };
    emotionalFilterInstance.setConfig(c);
    const stored = getSetting(EMOTIONAL_FILTER_CONFIG_KEY);
    const merged = stored ? { ...JSON.parse(stored), ...c } : c;
    setSetting(EMOTIONAL_FILTER_CONFIG_KEY, JSON.stringify(merged));
    res.json(emotionalFilterInstance.getConfig());
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/orders/clear — очистка ордеров в БД (зависшие open или вся история). Body: { clientId?: string, status?: 'open' | 'closed' | 'all' } */
router.post('/orders/clear', requireAdmin, (req: Request, res: Response) => {
  try {
    initDb();
    const clientId = (req.body?.clientId as string)?.trim() || undefined;
    const statusRaw = (req.body?.status as string)?.toLowerCase();
    const status: 'open' | 'closed' | undefined =
      statusRaw === 'open' ? 'open' : statusRaw === 'closed' ? 'closed' : statusRaw === 'all' ? undefined : undefined;
    const deleted = deleteOrders({ clientId, status });
    logger.info('Admin', 'Orders cleared', { clientId: clientId ?? 'all', status: status ?? 'all', deleted });
    res.json({ ok: true, deleted });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/trades/history — история сделок из БД */
router.get('/trades/history', requireAdmin, (req: Request, res: Response) => {
  try {
    initDb();
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

/** GET /api/admin/analytics — аналитика по ордерам. ?clientId= — фильтр по пользователю. */
router.get('/analytics', requireAdmin, (req: Request, res: Response) => {
  try {
    initDb();
    const limit = parseInt(req.query.limit as string) || 500;
    const clientId = (req.query.clientId as string)?.trim() || undefined;
    const orders = listOrders({ status: 'closed', limit: Math.min(limit, 5000), clientId });
    const result = computeAnalytics(orders, clientId);
    res.json({
      ...result,
      clientId: clientId || undefined
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/analytics/export — экспорт истории сделок в CSV. ?clientId= & ?since= & ?until= (YYYY-MM-DD). */
router.get('/analytics/export', requireAdmin, (req: Request, res: Response) => {
  try {
    initDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 5000, 10000);
    const clientId = (req.query.clientId as string)?.trim() || undefined;
    let orders = listOrders({ status: 'closed', limit, clientId });
    const since = (req.query.since as string)?.trim();
    const until = (req.query.until as string)?.trim();
    if (since) {
      const sinceDate = since + 'T00:00:00.000Z';
      orders = orders.filter((o) => (o.close_time ?? o.open_time ?? '') >= sinceDate);
    }
    if (until) {
      const untilDate = until + 'T23:59:59.999Z';
      orders = orders.filter((o) => (o.close_time ?? o.open_time ?? '') <= untilDate);
    }
    const headers = ['id', 'clientId', 'pair', 'direction', 'size', 'leverage', 'openPrice', 'closePrice', 'pnl', 'pnlPercent', 'openTime', 'closeTime'];
    const rows = orders.map((o) => [
      o.id,
      o.client_id,
      o.pair,
      o.direction,
      o.size,
      o.leverage,
      o.open_price,
      o.close_price ?? '',
      o.pnl ?? '',
      o.pnl_percent ?? '',
      o.open_time,
      o.close_time ?? ''
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="trades-export.csv"');
    res.send('\uFEFF' + csv);
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

/** GET /api/admin/users — список пользователей (опционально ?search= по user_id, нику, telegram id) */
router.get('/users', requireAdmin, (req: Request, res: Response) => {
  try {
    const onlineIds = new Set(getOnlineUserIds());
    let users = listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      groupId: u.group_id,
      groupName: u.group_name,
      banned: u.banned ?? 0,
      banReason: u.ban_reason ?? null,
      createdAt: u.created_at,
      online: onlineIds.has(u.id)
    }));
    const search = (req.query.search as string)?.trim();
    if (search) {
      const keys = listActivationKeys(2000);
      const telegramByUserId = new Map<string, string>();
      const userIdsByTelegramNote = new Set<string>();
      for (const k of keys) {
        if (k.used_by_user_id && k.note) {
          telegramByUserId.set(k.used_by_user_id, k.note);
          const noteStr = String(k.note).trim();
          if (noteStr === search || noteStr.includes(search) || search.includes(noteStr)) {
            userIdsByTelegramNote.add(k.used_by_user_id);
          }
        }
      }
      const q = search.toLowerCase();
      users = users.filter((u) => {
        if (u.id.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)) return true;
        if (userIdsByTelegramNote.has(u.id)) return true;
        const tg = telegramByUserId.get(u.id);
        return tg != null && (String(tg).trim() === search || String(tg).includes(search));
      });
    }
    res.json(users);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

function okxProxyAgent(proxyUrl?: string): InstanceType<typeof HttpsProxyAgent> | undefined {
  const url = proxyUrl ?? getProxy(config.proxyList) ?? config.proxy ?? '';
  if (!url || !url.startsWith('http')) return undefined;
  try {
    return new HttpsProxyAgent(url);
  } catch {
    return undefined;
  }
}

/** Получить баланс USDT с Bitget по ключам пользователя. Пробует real/testnet и при таймауте — другой прокси (до 3 попыток). */
async function fetchBitgetBalanceForUser(userId: string): Promise<{ okxBalance: number | null; okxBalanceError: string | null }> {
  const creds = getBitgetCredentials(userId);
  if (!creds) return { okxBalance: null, okxBalanceError: null };
  const timeout = config.bitget.timeout;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const proxyUrl = getProxy(config.proxyList) || config.proxy || '';
    const baseOpts: Record<string, unknown> = {
      apiKey: creds.apiKey,
      secret: creds.secret,
      password: creds.passphrase || undefined,
      enableRateLimit: true,
      timeout,
      options: { defaultType: 'swap', fetchMarkets: ['swap'] }
    };
    if (proxyUrl) baseOpts.httpsProxy = proxyUrl;
    const agent = proxyUrl ? okxProxyAgent(proxyUrl) : undefined;
    if (agent) baseOpts.agent = agent;
    for (const sandboxMode of [false, true]) {
      try {
        const exchange = new ccxt.bitget({ ...baseOpts, options: { defaultType: 'swap', fetchMarkets: ['swap'], sandboxMode } });
        const balance = await exchange.fetchBalance();
        const usdt = (balance as any).USDT ?? balance?.usdt;
        const total = usdt?.total ?? 0;
        const value = typeof total === 'number' ? total : 0;
        return { okxBalance: value, okxBalanceError: null };
      } catch (e) {
        lastError = (e as Error).message || String(e);
        logger.warn('Admin', 'Bitget balance fetch failed', { userId, sandboxMode, attempt: attempt + 1, error: lastError });
      }
    }
    const isTimeout = /timed out|timeout|ETIMEDOUT/i.test(lastError || '');
    if (isTimeout && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    break;
  }
  const okxBalanceError = lastError && /50102|Timestamp request expired/i.test(lastError)
    ? `${lastError} Синхронизируйте время на сервере (NTP).`
    : lastError;
  return { okxBalance: null, okxBalanceError };
}

/** GET /api/admin/users/:id — детали пользователя: ордера, PnL, telegram_id, подписка, Bitget баланс */
router.get('/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    initDb();
    const userId = req.params.id;
    const allUsers = listUsers();
    const u = allUsers.find((x) => x.id === userId) as (typeof allUsers[0] & { activation_expires_at?: string | null }) | undefined;
    if (!u) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    const onlineIds = new Set(getOnlineUserIds());
    const closedOrders = listOrders({ clientId: userId, status: 'closed', limit: 500 });
    const openOrders = listOrders({ clientId: userId, status: 'open', limit: 100 });
    const totalPnl = closedOrders.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const allOrders = [...openOrders, ...closedOrders].sort((a, b) => (b.open_time || '').localeCompare(a.open_time || '')).slice(0, 100);
    const telegramId = getTelegramIdForUser(userId);
    const { okxBalance, okxBalanceError } = await fetchBitgetBalanceForUser(userId);
    const balance = getBalance(userId);
    res.json({
      id: u.id,
      username: u.username,
      groupId: u.group_id,
      groupName: u.group_name,
      banned: u.banned ?? 0,
      banReason: u.ban_reason ?? null,
      createdAt: u.created_at,
      online: onlineIds.has(userId),
      activationExpiresAt: u.activation_expires_at ?? null,
      telegramId,
      totalPnl,
      balance,
      okxBalance: okxBalance ?? null,
      okxBalanceError: okxBalanceError ?? null,
      ordersCount: closedOrders.length,
      orders: allOrders.map((o) => ({
        id: o.id,
        pair: o.pair,
        direction: o.direction,
        openPrice: o.open_price,
        closePrice: o.close_price,
        pnl: o.pnl,
        pnlPercent: o.pnl_percent,
        openTime: o.open_time,
        closeTime: o.close_time,
        status: o.status
      }))
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/users/:id/extend-subscription — продлить подписку (duration: 1h, 99d, 30m) */
router.post('/users/:id/extend-subscription', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const duration = (req.body?.duration as string)?.trim();
    if (!duration) {
      res.status(400).json({ error: 'Укажите duration, например 1h или 99d' });
      return;
    }
    const { activationExpiresAt } = extendUserSubscription(userId, duration);
    res.json({ ok: true, activationExpiresAt });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('Admin', msg);
    if (msg.includes('Пользователь') || msg.includes('Формат')) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/** POST /api/admin/users/:id/revoke-subscription — отменить подписку */
router.post('/users/:id/revoke-subscription', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    updateUserActivationExpiresAt(userId, null);
    res.json({ ok: true, userId, activationExpiresAt: null });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/users/:id/balance — добавить или отнять баланс USDT (только админ). Body: { operation: 'add'|'subtract', amount: number } */
router.post('/users/:id/balance', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const operation = (req.body?.operation as string) === 'subtract' ? 'subtract' : 'add';
    const amount = Math.abs(Number(req.body?.amount ?? 0));
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Укажите amount — положительное число' });
      return;
    }
    const cur = getBalance(userId);
    if (operation === 'add') {
      creditBalance(userId, amount);
      res.json({ ok: true, balance: cur + amount, previousBalance: cur });
    } else {
      const newBalance = Math.max(0, cur - amount);
      setBalance(userId, newBalance);
      res.json({ ok: true, balance: newBalance, previousBalance: cur });
    }
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/admin/users/:id — изменить логин, пароль и/или группу пользователя */
router.patch('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      res.status(400).json({ error: 'userId обязателен' });
      return;
    }
    const username = (req.body?.username as string)?.trim();
    const password = req.body?.password as string;
    const groupId = req.body?.groupId != null ? parseInt(String(req.body.groupId), 10) : undefined;
    if (username !== undefined && username.length > 0) {
      if (username.length < 2) {
        res.status(400).json({ error: 'Логин от 2 символов' });
        return;
      }
      updateUsername(userId, username);
    }
    if (password !== undefined && password.length > 0) {
      if (password.length < 4) {
        res.status(400).json({ error: 'Пароль от 4 символов' });
        return;
      }
      const hash = bcrypt.hashSync(password, 10);
      updateUserPassword(userId, hash);
    }
    if (groupId !== undefined && Number.isInteger(groupId) && groupId >= 1) {
      updateUserGroup(userId, groupId);
    }
    res.json({ ok: true, userId });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('Admin', msg);
    if (msg.includes('Логин') || msg.includes('логин') || msg.includes('уже есть')) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
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

/** ——— Прокси (Bitget обход Cloudflare) ——— */

/** GET /api/admin/proxies — список всех прокси (env + из БД), для отображения в админке */
router.get('/proxies', requireAdmin, (req: Request, res: Response) => {
  try {
    const list = listProxiesForAdmin(config.proxyList);
    res.json({ proxies: list });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/proxies — добавить прокси (в БД) */
router.post('/proxies', requireAdmin, (req: Request, res: Response) => {
  try {
    const url = (req.body?.url as string)?.trim();
    if (!url) {
      res.status(400).json({ error: 'url обязателен (например http://user:pass@host:port)' });
      return;
    }
    const row = addProxy(url);
    res.status(201).json({ id: row.id, url: row.url, createdAt: row.created_at });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('UNIQUE') || msg.includes('уже')) {
      res.status(400).json({ error: 'Такой прокси уже есть' });
      return;
    }
    logger.error('Admin', msg);
    res.status(500).json({ error: msg });
  }
});

/** DELETE /api/admin/proxies/:id — удалить прокси (только из БД) */
router.delete('/proxies/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    deleteProxy(id);
    res.json({ ok: true, id });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Проверка одного прокси: запрос к Bitget через него */
async function checkProxyOne(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ex = new ccxt.bitget({
      enableRateLimit: true,
      options: { defaultType: 'swap', fetchMarkets: ['swap'] },
      timeout: 12000,
      httpsProxy: url
    });
    await ex.fetchTicker('BTC/USDT:USDT');
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return { ok: false, error: msg };
  }
}

/** POST /api/admin/proxies/check — проверить прокси (работает ли). Body: { url? } — один URL или без body проверяем все */
router.post('/proxies/check', requireAdmin, async (req: Request, res: Response) => {
  try {
    const singleUrl = (req.body?.url as string)?.trim();
    const list = listProxiesForAdmin(config.proxyList);
    const toCheck = singleUrl ? list.filter((p) => p.url === singleUrl) : list;
    if (toCheck.length === 0) {
      res.json({ results: singleUrl ? [{ url: singleUrl, ok: false, error: 'Прокси не найден в списке' }] : [] });
      return;
    }
    const results: Array<{ url: string; ok: boolean; error?: string }> = [];
    for (const p of toCheck) {
      const r = await checkProxyOne(p.url);
      results.push({ url: p.url, ok: r.ok, error: r.error });
    }
    res.json({ results });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/maintenance — статус режима технического обслуживания */
router.get('/maintenance', requireAdmin, (_req: Request, res: Response) => {
  try {
    res.json({ enabled: getMaintenanceMode() });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/maintenance — включить/выключить техническое обслуживание (только admin имеет доступ к сайту) */
router.post('/maintenance', requireAdmin, (req: Request, res: Response) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    setMaintenanceMode(enabled);
    logger.info('Admin', `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ enabled: getMaintenanceMode() });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/stats-display-config — настройки демо-статистики (рост от даты запуска) */
router.get('/stats-display-config', requireAdmin, (_req: Request, res: Response) => {
  try {
    res.json(getStatsDisplayConfig());
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/stats-display-config — сохранить настройки демо-статистики */
router.put('/stats-display-config', requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<StatsDisplayConfig>;
    const patch: Partial<StatsDisplayConfig> = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.launchDate != null) patch.launchDate = body.launchDate;
    if (typeof body.volumePerDay === 'number') patch.volumePerDay = body.volumePerDay;
    if (typeof body.ordersPerDay === 'number') patch.ordersPerDay = body.ordersPerDay;
    if (typeof body.winRateShare === 'number') patch.winRateShare = body.winRateShare;
    if (typeof body.usersPerDay === 'number') patch.usersPerDay = body.usersPerDay;
    if (body.usersPerDayTo !== undefined) patch.usersPerDayTo = body.usersPerDayTo === null ? undefined : Number(body.usersPerDayTo);
    if (typeof body.signalsPerDay === 'number') patch.signalsPerDay = body.signalsPerDay;
    if (body.signalsPerDayTo !== undefined) patch.signalsPerDayTo = body.signalsPerDayTo === null ? undefined : Number(body.signalsPerDayTo);
    if (body.volumePerDayTo !== undefined) patch.volumePerDayTo = body.volumePerDayTo === null ? undefined : Number(body.volumePerDayTo);
    if (body.ordersPerDayTo !== undefined) patch.ordersPerDayTo = body.ordersPerDayTo === null ? undefined : Number(body.ordersPerDayTo);
    if (body.winRateShareTo !== undefined) patch.winRateShareTo = body.winRateShareTo === null ? undefined : Number(body.winRateShareTo);
    const next = setStatsDisplayConfig(patch);
    logger.info('Admin', 'Stats display config updated');
    res.json(next);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/external-ai — настройки внешнего ИИ. Ключи не отдаём, только флаги «задан». */
router.get('/external-ai', requireAdmin, (_req: Request, res: Response) => {
  try {
    const cfg = getExternalAiConfig();
    res.json({
      ...cfg,
      openaiKeySet: hasOpenAiKey(),
      anthropicKeySet: hasAnthropicKey(),
      glmKeySet: hasGlmKey(),
      cryptopanicKeySet: hasCryptoPanicKey(),
      gnewsKeySet: hasGNewsKey(),
      currentProviderKeySet: hasAnyApiKey(cfg)
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/external-ai — сохранить настройки внешнего ИИ и/или API-ключи (все в админке). */
router.put('/external-ai', requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<ExternalAiConfig> & { openaiApiKey?: string; anthropicApiKey?: string; glmApiKey?: string; cryptoPanicApiKey?: string; gnewsApiKey?: string };
    const patch: Partial<ExternalAiConfig> = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.provider === 'openai' || body.provider === 'claude' || body.provider === 'glm') patch.provider = body.provider;
    if (typeof body.useAllProviders === 'boolean') patch.useAllProviders = body.useAllProviders;
    if (typeof body.minScore === 'number') patch.minScore = Math.max(0, Math.min(1, body.minScore));
    if (typeof body.blockOnLowScore === 'boolean') patch.blockOnLowScore = body.blockOnLowScore;
    if (typeof body.openaiModel === 'string') patch.openaiModel = body.openaiModel.trim();
    if (typeof body.claudeModel === 'string') patch.claudeModel = body.claudeModel.trim();
    if (typeof body.glmModel === 'string') patch.glmModel = body.glmModel.trim();
    const next = setExternalAiConfig(patch);
    if (body.openaiApiKey !== undefined) setOpenAiKey(body.openaiApiKey === '' ? null : body.openaiApiKey);
    if (body.anthropicApiKey !== undefined) setAnthropicKey(body.anthropicApiKey === '' ? null : body.anthropicApiKey);
    if (body.glmApiKey !== undefined) setGlmKey(body.glmApiKey === '' ? null : body.glmApiKey);
    if (body.cryptoPanicApiKey !== undefined) setCryptoPanicKey(body.cryptoPanicApiKey === '' ? null : body.cryptoPanicApiKey);
    if (body.gnewsApiKey !== undefined) setGNewsKey(body.gnewsApiKey === '' ? null : body.gnewsApiKey);
    logger.info('Admin', 'External AI config updated', { enabled: next.enabled, provider: next.provider, useAllProviders: next.useAllProviders });
    res.json({
      ...next,
      openaiKeySet: hasOpenAiKey(),
      anthropicKeySet: hasAnthropicKey(),
      glmKeySet: hasGlmKey(),
      cryptopanicKeySet: hasCryptoPanicKey(),
      gnewsKeySet: hasGNewsKey(),
      currentProviderKeySet: hasAnyApiKey(next)
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/wallet — статус кошелька, статистика (без seed) */
router.get('/wallet', requireAdmin, (_req: Request, res: Response) => {
  try {
    const deposits = getDepositsStats();
    const withdrawals = getWithdrawalsStats();
    const pending = getPendingWithdrawals();
    const customAddresses = getAllCustomAddresses();
    res.json({
      enabled: isHdWalletEnabled(),
      deposits,
      withdrawals,
      pendingWithdrawals: pending,
      customAddresses
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/wallet/config — seed (шифруется), только TRC20 */
router.post('/wallet/config', requireAdmin, (req: Request, res: Response) => {
  try {
    const mnemonic = (req.body?.mnemonic as string)?.trim();
    if (!mnemonic || mnemonic.split(' ').length < 12) {
      return res.status(400).json({ error: 'Seed-фраза: 12 или 24 слова' });
    }
    setWalletConfigFromAdmin(mnemonic, 'trc20');
    res.json({ ok: true, enabled: isHdWalletEnabled() });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/wallet/custom-address — добавить TRC20/др. адрес для аккаунта (0-4) */
router.post('/wallet/custom-address', requireAdmin, (req: Request, res: Response) => {
  try {
    const idx = Math.floor(Number(req.body?.derivationIndex ?? 0));
    const network = String(req.body?.network || 'trc20').toLowerCase();
    const address = String(req.body?.address || '').trim();
    if (address.length < 20) return res.status(400).json({ error: 'Укажите адрес' });
    setCustomAddress(idx, network, address);
    res.json({ ok: true });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/wallet/withdrawals/:id/approve — подтвердить и отправить вывод */
router.post('/wallet/withdrawals/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const w = getWithdrawalById(id);
    if (!w || w.status !== 'pending') {
      return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
    }
    const walletInfo = getWalletAddress(w.user_id);
    if (!walletInfo) return res.status(500).json({ error: 'Адрес кошелька пользователя не найден' });
    const feePct = 0.005;
    const amountNet = w.amount_usdt * (1 - feePct);
    const result = await signWithdraw(walletInfo.derivation_index, w.to_address, amountNet);
    if ('error' in result) return res.status(500).json({ error: result.error });
    const txHash = result.txHash ?? (result as any).signedTx;
    if (!txHash) return res.status(500).json({ error: 'Нет txHash' });
    updateWithdrawalTx(id, txHash);
    logger.info('Admin', 'Withdrawal approved and sent', { id, txHash });
    res.json({ ok: true, txHash });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/wallet/withdrawals/:id/reject — отклонить вывод (возврат на баланс) */
router.post('/wallet/withdrawals/:id/reject', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!rejectWithdrawal(id)) {
      return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
    }
    res.json({ ok: true });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
