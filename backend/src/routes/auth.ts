/**
 * Регистрация и вход пользователей (без подтверждения почты).
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  findUserByUsername,
  createUser,
  getUserById,
  getGroupById,
  createSession,
  findSessionUserId,
  deleteSession,
  updateUserProxy,
  updateUserGroup,
  redeemActivationKeyForUser,
  setOkxCredentials,
  setBitgetCredentials,
  getBitgetDemoCredentials,
  setBitgetDemoCredentials,
  getMassiveCredentials,
  setMassiveCredentials,
  consumeTelegramRegisterToken,
  consumeTelegramResetToken,
  setUserTelegramId,
  updateUserPassword
} from '../db/authDb';
import { initDb, listOrders } from '../db';
import { getAnalyticsForClient } from '../services/analyticsService';
import { logger } from '../lib/logger';
import { getMaintenanceMode } from '../lib/maintenanceMode';
import { rateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { registerSchema, loginSchema } from '../schemas/auth';

const router = Router();
const authEndpointLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const SALT_ROUNDS = 10;
const PRO_GROUP_ID = 4;
const DEFAULT_GROUP_ID = 1;
const ADMIN_GROUP_ID = 3;

function isActivationActive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > Date.now();
}

function normalizeAllowedTabs(tabs: string[] | null | undefined): string[] {
  const list = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
  // "activate" tab should be available for everyone
  const set = new Set<string>(list.length ? list : ['dashboard', 'settings', 'activate']);
  set.add('activate');
  return [...set];
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export function requireAuth(req: Request, res: Response, next: () => void): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  const userId = findSessionUserId(token);
  if (!userId) {
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
  (req as any).userId = userId;
  next();
}

/** Как requireAuth, но не возвращает 401 при отсутствии токена — только выставляет req.userId при валидном токене. */
export function optionalAuth(req: Request, _res: Response, next: () => void): void {
  const token = getBearerToken(req);
  if (!token) {
    next();
    return;
  }
  const userId = findSessionUserId(token);
  if (userId) (req as any).userId = userId;
  next();
}

/** POST /api/auth/register — регистрация (без подтверждения почты) */
router.post('/register', authEndpointLimit, validateBody(registerSchema), (req: Request, res: Response) => {
  try {
    if (getMaintenanceMode()) {
      res.status(503).json({
        maintenance: true,
        error: 'Регистрация временно недоступна. Сайт на техническом обслуживании.'
      });
      return;
    }
    const { username, password } = (req as any).validatedBody;
    if (findUserByUsername(username)) {
      res.status(400).json({ error: 'Пользователь с таким логином уже есть' });
      return;
    }
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const user = createUser(username, passwordHash, DEFAULT_GROUP_ID);
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      }
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/login — вход */
router.post('/login', authEndpointLimit, validateBody(loginSchema), (req: Request, res: Response) => {
  try {
    const { username, password } = (req as any).validatedBody;
    const user = findUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }
    if (getMaintenanceMode() && user.group_id !== ADMIN_GROUP_ID) {
      res.status(503).json({
        maintenance: true,
        message: 'Сайт на техническом обслуживании. Новости и обновления — в нашем Telegram.'
      });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    // auto-downgrade expired pro users
    const active = isActivationActive((user as any).activation_expires_at ?? null);
    if (!active && user.group_id === PRO_GROUP_ID) {
      updateUserGroup(user.id, DEFAULT_GROUP_ID);
      user.group_id = DEFAULT_GROUP_ID;
    }
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        proxyUrl: user.proxy_url ?? undefined,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      }
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/logout — выход (инвалидация токена) */
router.post('/logout', (req: Request, res: Response) => {
  const token = getBearerToken(req);
  if (token) deleteSession(token);
  res.json({ ok: true });
});

/** GET /api/auth/me — текущий пользователь (по токену) */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const user = getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    if (getMaintenanceMode() && user.group_id !== ADMIN_GROUP_ID) {
      res.status(503).json({
        maintenance: true,
        message: 'Сайт на техническом обслуживании. Новости и обновления — в нашем Telegram.'
      });
      return;
    }
    const active = isActivationActive((user as any).activation_expires_at ?? null);
    if (!active && user.group_id === PRO_GROUP_ID) {
      updateUserGroup(user.id, DEFAULT_GROUP_ID);
      user.group_id = DEFAULT_GROUP_ID;
    }
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      id: user.id,
      username: user.username,
      groupId: user.group_id,
      groupName: group?.name,
      allowedTabs,
      proxyUrl: user.proxy_url ?? undefined,
      activationExpiresAt: (user as any).activation_expires_at ?? null,
      activationActive: isActivationActive((user as any).activation_expires_at ?? null)
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/auth/me/stats — статистика по ордерам текущего пользователя (из БД: ордера бота + закрытия в приложении) */
router.get('/me/stats', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    initDb();
    const closed = listOrders({ clientId: userId, status: 'closed', limit: 5000 });
    const open = listOrders({ clientId: userId, status: 'open', limit: 500 });
    const withPnl = closed.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
    const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
    const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
    const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
    res.json({
      orders: {
        total: closed.length + open.length,
        wins: wins.length,
        losses: losses.length,
        openCount: open.length
      },
      volumeEarned: Math.round(totalPnl * 100) / 100
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({
      orders: { total: 0, wins: 0, losses: 0, openCount: 0 },
      volumeEarned: 0
    });
  }
});

/** GET /api/auth/me/analytics — аналитика по сделкам текущего пользователя (как Admin Analytics, но по userId) */
router.get('/me/analytics', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    initDb();
    const limit = Math.min(parseInt((req.query.limit as string) || '500'), 2000);
    const result = getAnalyticsForClient(userId, limit);
    res.json(result);
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/auth/me/alerts — алерты по drawdown, серии убытков и т.д. */
router.get('/me/alerts', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    initDb();
    const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);
    const result = getAnalyticsForClient(userId, limit);
    const alerts: Array<{ type: string; message: string }> = [];
    const drawdownThresh = 15;
    const lossStreakThresh = 4;
    if (result.maxDrawdownPct >= drawdownThresh) {
      alerts.push({ type: 'drawdown', message: `Макс. просадка ${result.maxDrawdownPct.toFixed(1)}% превышает порог ${drawdownThresh}%` });
    }
    const recent = result.equityCurve.slice(-lossStreakThresh);
    if (recent.length >= lossStreakThresh) {
      let streak = 0;
      for (let i = recent.length - 1; i >= 0 && recent[i].pnl < 0; i--) streak++;
      if (streak >= lossStreakThresh) {
        alerts.push({ type: 'loss_streak', message: `Серия из ${streak} убыточных сделок подряд` });
      }
    }
    res.json({ alerts });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ alerts: [] });
  }
});

/** PUT /api/auth/me/okx-connection — сохранить OKX ключи (legacy, для отображения баланса в админке) */
router.put('/me/okx-connection', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const apiKey = (req.body?.apiKey as string)?.trim();
    const secret = (req.body?.secret as string)?.trim();
    const passphrase = (req.body?.passphrase as string)?.trim() ?? '';
    if (!apiKey || !secret) {
      res.status(400).json({ error: 'API Key и Secret обязательны' });
      return;
    }
    setOkxCredentials(userId, { apiKey, secret, passphrase });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/auth/me/bitget-connection — сохранить Bitget ключи (автоторговля) */
router.put('/me/bitget-connection', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const apiKey = (req.body?.apiKey as string)?.trim();
    const secret = (req.body?.secret as string)?.trim();
    const passphrase = (req.body?.passphrase as string)?.trim() ?? '';
    if (!apiKey || !secret) {
      res.status(400).json({ error: 'API Key и Secret обязательны для Bitget' });
      return;
    }
    setBitgetCredentials(userId, { apiKey, secret, passphrase });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/auth/me/bitget-demo-connection — сохранить Bitget Demo ключи (автоторговля testnet) */
router.put('/me/bitget-demo-connection', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const apiKey = (req.body?.apiKey as string)?.trim();
    const secret = (req.body?.secret as string)?.trim();
    const passphrase = (req.body?.passphrase as string)?.trim() ?? '';
    if (!apiKey || !secret) {
      res.status(400).json({ error: 'API Key и Secret обязательны для Bitget Demo' });
      return;
    }
    setBitgetDemoCredentials(userId, { apiKey, secret, passphrase });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/auth/me/massive-api — наличие Massive.com API key и/или S3 (не сами ключи) */
router.get('/me/massive-api', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const creds = getMassiveCredentials(userId);
    const hasKey = !!creds?.api_key?.trim();
    const hasS3 = !!(creds?.access_key_id?.trim() && creds?.secret_access_key?.trim());
    res.json({ hasKey, hasS3 });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/auth/me/massive-api — сохранить Massive.com: API key и/или S3 (Access Key ID, Secret, Endpoint, Bucket) */
router.put('/me/massive-api', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const body = req.body || {};
    setMassiveCredentials(userId, {
      apiKey: (body.apiKey as string)?.trim(),
      accessKeyId: (body.accessKeyId as string)?.trim(),
      secretAccessKey: (body.secretAccessKey as string)?.trim(),
      s3Endpoint: (body.s3Endpoint as string)?.trim(),
      bucket: (body.bucket as string)?.trim()
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/auth/me — обновить профиль (прокси) */
router.patch('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const proxyUrl = req.body?.proxyUrl as string | undefined;
    const v = proxyUrl === undefined ? undefined : (proxyUrl === '' ? null : String(proxyUrl).trim());
    if (v !== undefined) {
      updateUserProxy(userId, v || null);
    }
    const user = getUserById(userId);
    const group = user ? getGroupById(user.group_id) : null;
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      id: user!.id,
      username: user!.username,
      groupId: user!.group_id,
      groupName: group?.name,
      allowedTabs,
      proxyUrl: user!.proxy_url ?? undefined,
      activationExpiresAt: (user as any).activation_expires_at ?? null,
      activationActive: isActivationActive((user as any).activation_expires_at ?? null)
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/register-by-telegram — регистрация по одноразовому токену из Telegram-бота */
router.post('/register-by-telegram', authEndpointLimit, (req: Request, res: Response) => {
  try {
    if (getMaintenanceMode()) {
      res.status(503).json({
        maintenance: true,
        error: 'Регистрация временно недоступна.'
      });
      return;
    }
    const token = (req.body?.token as string)?.trim();
    const username = (req.body?.username as string)?.trim();
    const password = req.body?.password as string;
    if (!token) {
      res.status(400).json({ error: 'Токен регистрации обязателен. Получите ссылку в боте @clabx_bot.' });
      return;
    }
    const payload = consumeTelegramRegisterToken(token);
    if (!payload) {
      res.status(400).json({ error: 'Ссылка недействительна или истекла. Запросите новую в боте @clabx_bot.' });
      return;
    }
    if (!username || username.length < 2) {
      res.status(400).json({ error: 'Логин от 2 символов' });
      return;
    }
    if (!password || password.length < 4) {
      res.status(400).json({ error: 'Пароль от 4 символов' });
      return;
    }
    if (findUserByUsername(username)) {
      res.status(400).json({ error: 'Пользователь с таким логином уже есть' });
      return;
    }
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const user = createUser(username, passwordHash, DEFAULT_GROUP_ID);
    setUserTelegramId(user.id, payload.telegramUserId);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    createSession(sessionToken, user.id);
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.status(201).json({
      ok: true,
      token: sessionToken,
      user: {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      }
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/reset-password — сброс пароля по одноразовому токену из Telegram-бота */
router.post('/reset-password', authEndpointLimit, (req: Request, res: Response) => {
  try {
    const token = (req.body?.token as string)?.trim();
    const newPassword = req.body?.newPassword as string;
    if (!token) {
      res.status(400).json({ error: 'Токен сброса обязателен. Получите ссылку в боте @clabx_bot.' });
      return;
    }
    const userId = consumeTelegramResetToken(token);
    if (!userId) {
      res.status(400).json({ error: 'Ссылка недействительна или истекла. Запросите новую в боте @clabx_bot.' });
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: 'Пароль от 4 символов' });
      return;
    }
    const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    updateUserPassword(userId, passwordHash);
    res.json({ ok: true, message: 'Пароль изменён. Войдите с новым паролем.' });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/activate — активировать ключ и выдать доступ на срок */
router.post('/activate', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const key = String(req.body?.key ?? '').trim();
    if (!key) {
      res.status(400).json({ error: 'Ключ обязателен' });
      return;
    }
    const result = redeemActivationKeyForUser({ userId, key, proGroupId: PRO_GROUP_ID });
    const user = getUserById(userId);
    const group = user ? getGroupById(user.group_id) : null;
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      ok: true,
      activationExpiresAt: result.activationExpiresAt,
      activationActive: isActivationActive(result.activationExpiresAt),
      user: user ? {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        proxyUrl: user.proxy_url ?? undefined,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      } : null
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
