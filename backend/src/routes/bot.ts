/**
 * API для Telegram-бота: регистрация ключа, отзыв (chargeback), список тарифов.
 * Авторизация: заголовок X-Bot-Token должен совпадать с BOT_WEBHOOK_SECRET.
 */

import { Router, Request, Response } from 'express';
import { registerActivationKeyFromBot, revokeActivationKeyByKey } from '../db/authDb';
import { listSubscriptionPlans } from '../db/subscriptionPlans';
import { logger } from '../lib/logger';

const router = Router();
const BOT_SECRET = process.env.BOT_WEBHOOK_SECRET || '';

function requireBotToken(req: Request, res: Response, next: () => void) {
  const token = (req.headers['x-bot-token'] as string) || '';
  if (!BOT_SECRET || token !== BOT_SECRET) {
    res.status(401).json({ error: 'Invalid or missing X-Bot-Token' });
    return;
  }
  next();
}

router.use(requireBotToken);

/** POST /api/bot/register-key — бот сгенерировал ключ, регистрирует его на сайте */
router.post('/register-key', (req: Request, res: Response) => {
  try {
    const { key, durationDays, telegramUserId } = req.body || {};
    if (!key || typeof key !== 'string') {
      res.status(400).json({ error: 'key required (32 chars)' });
      return;
    }
    const days = Math.max(1, Math.floor(Number(durationDays) || 30));
    const note = telegramUserId != null ? String(telegramUserId) : null;
    const row = registerActivationKeyFromBot(key.trim(), days, note);
    res.json({ ok: true, id: row.id, key: row.key, duration_days: row.duration_days });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('Bot register-key', msg);
    if (msg.includes('32') || msg.includes('существует')) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/** POST /api/bot/revoke-key — отзыв ключа (chargeback). Если ключ использован — пользователь банится */
router.post('/revoke-key', (req: Request, res: Response) => {
  try {
    const { key } = req.body || {};
    if (!key || typeof key !== 'string') {
      res.status(400).json({ error: 'key required' });
      return;
    }
    const { revoked, bannedUserId } = revokeActivationKeyByKey(key.trim());
    res.json({ ok: true, revoked, bannedUserId: bannedUserId ?? undefined });
  } catch (e) {
    logger.error('Bot revoke-key', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/bot/plans — список включённых тарифов для меню бота */
router.get('/plans', (_req: Request, res: Response) => {
  try {
    const plans = listSubscriptionPlans(true);
    res.json({ ok: true, plans });
  } catch (e) {
    logger.error('Bot plans', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
