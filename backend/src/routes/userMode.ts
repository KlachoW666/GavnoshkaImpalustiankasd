/**
 * User Mode API — управление режимом пользователя (auto_trading | copy_trading)
 */

import { Router, Request, Response } from 'express';
import { getBearerToken } from './auth';
import { findSessionUserId, getUserById } from '../db/authDb';
import { getUserMode, setUserMode } from '../db/copyTradingBalanceDb';

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

router.get('/', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }
  
  const mode = getUserMode(userId);
  const user = getUserById(userId);
  
  res.json({
    mode,
    username: user?.username ?? null,
    hasSeenOnboarding: true // TODO: хранить в БД
  });
});

router.post('/', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }
  
  const { mode } = req.body;
  if (mode !== 'auto_trading' && mode !== 'copy_trading') {
    res.status(400).json({ error: 'Неверный режим. Допустимо: auto_trading, copy_trading' });
    return;
  }
  
  const success = setUserMode(userId, mode);
  if (!success) {
    res.status(500).json({ error: 'Ошибка сохранения режима' });
    return;
  }
  
  res.json({ ok: true, mode });
});

export default router;
