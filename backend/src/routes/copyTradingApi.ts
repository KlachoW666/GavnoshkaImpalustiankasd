/**
 * Copy Trading Extended API — баланс, пополнения, выводы, провайдеры
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { getBearerToken } from './auth';
import { findSessionUserId, getUserById, findUserByUsername, createUser } from '../db/authDb';
import {
  getCopyTradingBalance,
  getOrCreateCopyTradingBalance,
  getCopyTradingTransactions,
  createCopyTradingTransaction,
  createWithdrawRequest,
  getPendingTransactions,
  processWithdraw,
  getCopyTradingProviders,
  addCopyTradingProvider,
  removeCopyTradingProvider,
  getAllProvidersWithStats,
  updateProviderFakeStats,
  updateProviderDetails,
  getProviderByUserId
} from '../db/copyTradingBalanceDb';
import { getSubscribers } from '../db/copyTradingDb';
import { listOrders } from '../db';
import { logger } from '../lib/logger';
import { validateAdminToken } from '../services/adminService';
import {
  getDepositAddresses,
  createDepositRequest,
  getPendingDeposits,
  approveDeposit,
  rejectDeposit,
  checkDepositOnBitget,
  autoConfirmDeposits,
  getAllDepositAddresses,
  updateDepositAddress,
  addDepositAddress,
  deleteDepositAddress
} from '../services/depositService';


function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!validateAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

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

router.get('/balance', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const balance = getOrCreateCopyTradingBalance(userId);
  res.json({
    balance: balance.balance_usdt,
    totalPnl: balance.total_pnl,
    totalDeposit: balance.total_deposit,
    totalWithdraw: balance.total_withdraw
  });
});

router.get('/deposit-addresses', (req: Request, res: Response) => {
  const addresses = getDepositAddresses();
  res.json({ addresses });
});

router.post('/deposit', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const { amount, txHash, network } = req.body;
  const amountUsdt = parseFloat(amount);

  if (!amountUsdt || amountUsdt < 10) {
    res.status(400).json({ error: 'Минимальная сумма пополнения: 10 USDT' });
    return;
  }

  if (!txHash || typeof txHash !== 'string') {
    res.status(400).json({ error: 'Укажите хэш транзакции' });
    return;
  }

  const result = createDepositRequest(userId, amountUsdt, txHash, network);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    ok: true,
    txId: result.txId,
    status: 'pending',
    message: 'Заявка создана. При поступлении средств баланс будет зачислен автоматически (обычно 1–2 мин).'
  });

  setImmediate(() => {
    setTimeout(() => {
      autoConfirmDeposits().then((r) => {
        if (r.processed > 0) logger.info('CopyTradingApi', 'Immediate deposit check', { processed: r.processed });
      }).catch(() => { });
    }, 20000);
  });
});

router.get('/deposits', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const transactions = getCopyTradingTransactions(userId, { limit: 50 });
  const deposits = transactions.filter(t => t.type === 'deposit');

  res.json({ deposits });
});

router.post('/withdraw', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const { amount, address } = req.body;
  const amountUsdt = parseFloat(amount);

  if (!amountUsdt || amountUsdt < 10) {
    res.status(400).json({ error: 'Минимальная сумма вывода: 10 USDT' });
    return;
  }

  if (!address || typeof address !== 'string' || address.length < 20) {
    res.status(400).json({ error: 'Укажите адрес для вывода (TRC20/BEP20/ERC20)' });
    return;
  }

  const result = createWithdrawRequest(userId, amountUsdt, address.trim());
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    ok: true,
    txId: result.txId,
    status: 'pending',
    message: 'Заявка на вывод создана. Средства заблокированы до подтверждения администратором.'
  });
});

router.get('/withdrawals', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const transactions = getCopyTradingTransactions(userId, { limit: 50 });
  const withdrawals = transactions.filter(t => t.type === 'withdraw');

  res.json({ withdrawals });
});

router.get('/transactions', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const transactions = getCopyTradingTransactions(userId, {
    status: status as any,
    limit,
    offset
  });

  res.json({ transactions });
});

router.get('/pnl-history', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Необходима авторизация' });
    return;
  }

  // Dummy data generator for visually appealing graph until fully integrated
  const history = [];
  const now = new Date();
  let currentBalance = 1000;
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    currentBalance += (Math.random() * 50 - 20); // random drift
    history.push({
      time: d.toISOString().split('T')[0],
      value: parseFloat(currentBalance.toFixed(2))
    });
  }

  res.json({ history });
});

router.get('/providers', (req: Request, res: Response) => {
  try {
    const providers = getAllProvidersWithStats();
    res.json({ providers });
  } catch (e) {
    logger.error('CopyTradingApi', 'providers error', { error: (e as Error).message });
    res.status(500).json({ error: 'Ошибка загрузки провайдеров' });
  }
});

router.get('/providers/:id/stats', (req: Request, res: Response) => {
  const providerId = req.params.id;

  const user = getUserById(providerId);
  if (!user) {
    res.status(404).json({ error: 'Провайдер не найден' });
    return;
  }

  const closed = listOrders({ clientId: providerId, status: 'closed', limit: 10000 });

  let totalPnl = 0;
  let wins = 0;
  let losses = 0;

  for (const o of closed) {
    if (o.pnl == null) continue;
    totalPnl += o.pnl;
    if (o.pnl > 0) wins++;
    else losses++;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const subscribers = getSubscribers(providerId);

  res.json({
    providerId,
    username: user.username,
    totalPnl: Math.round(totalPnl * 100) / 100,
    wins,
    losses,
    winRate: Math.round(winRate * 10) / 10,
    subscribersCount: subscribers.length,
    totalTrades,
    recentTrades: closed.slice(0, 20)
  });
});

// Admin endpoints
router.get('/admin/pending', requireAdmin, (req: Request, res: Response) => {

  const pending = getPendingTransactions();
  const enriched = pending.map(tx => {
    const u = getUserById(tx.user_id);
    return {
      ...tx,
      username: u?.username ?? tx.user_id
    };
  });

  res.json({ transactions: enriched });
});

router.get('/admin/deposits/pending', requireAdmin, (req: Request, res: Response) => {
  const deposits = getPendingDeposits();
  const enriched = deposits.map(d => {
    const u = getUserById(d.user_id);
    return {
      ...d,
      username: u?.username ?? d.user_id
    };
  });

  res.json({ deposits: enriched });
});

router.post('/admin/deposits/:txId/approve', requireAdmin, async (req: Request, res: Response) => {
  const txId = parseInt(req.params.txId);
  const { note } = req.body;

  const result = approveDeposit(txId, note);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, message: 'Депозит подтверждён' });
});

router.post('/admin/deposits/:txId/reject', requireAdmin, (req: Request, res: Response) => {
  const txId = parseInt(req.params.txId);
  const { note } = req.body;

  const result = rejectDeposit(txId, note);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, message: 'Депозит отклонён' });
});

router.post('/admin/deposits/check', requireAdmin, async (req: Request, res: Response) => {
  const { txHash } = req.body;

  if (!txHash) {
    res.status(400).json({ error: 'txHash required' });
    return;
  }

  const result = await checkDepositOnBitget(txHash);
  res.json(result);
});

router.post('/admin/withdrawals/:txId/approve', requireAdmin, (req: Request, res: Response) => {
  const txId = parseInt(req.params.txId);
  const { note, txHash } = req.body;

  const result = processWithdraw(txId, true, note || `Перевод: ${txHash || 'выполнен'}`);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, message: 'Вывод подтверждён' });
});

router.post('/admin/withdrawals/:txId/reject', requireAdmin, (req: Request, res: Response) => {
  const txId = parseInt(req.params.txId);
  const { note } = req.body;

  const result = processWithdraw(txId, false, note || 'Отклонено администратором');

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, message: 'Вывод отклонён, средства возвращены' });
});

router.post('/admin/process/:txId', requireAdmin, (req: Request, res: Response) => {

  const txId = parseInt(req.params.txId);
  const { action, note } = req.body;

  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ error: 'Неверное действие' });
    return;
  }

  const approve = action === 'approve';
  const result = approve ? approveDeposit(txId, note) : rejectDeposit(txId, note);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, status: approve ? 'completed' : 'rejected' });
});

router.post('/admin/providers', requireAdmin, (req: Request, res: Response) => {

  const { providerUserId, displayName, description, isBot } = req.body;

  if (!providerUserId) {
    res.status(400).json({ error: 'providerUserId обязателен' });
    return;
  }

  // Try to find user by ID or username
  let user = getUserById(providerUserId);
  if (!user) {
    user = findUserByUsername(providerUserId);
  }

  // For bot providers, auto-create user if not found
  if (!user && isBot) {
    const botName = providerUserId.trim();
    if (botName.length < 2) {
      res.status(400).json({ error: 'Имя бота должно быть минимум 2 символа' });
      return;
    }
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = crypto.createHash('sha256').update(randomPassword).digest('hex');
    user = createUser(botName, passwordHash, 1);
    logger.info('CopyTradingApi', 'Created bot user', { userId: user.id, username: user.username });
  }

  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден. Укажите ID или логин пользователя.' });
    return;
  }

  const success = addCopyTradingProvider(user.id, displayName || user.username, description);
  if (!success) {
    res.status(400).json({ error: 'Ошибка добавления провайдера' });
    return;
  }

  logger.info('CopyTradingApi', 'Provider added', { userId: user.id, username: user.username });
  res.json({ ok: true, providerId: user.id, username: user.username });
});

router.delete('/admin/providers/:providerId', requireAdmin, (req: Request, res: Response) => {

  const providerId = req.params.providerId;
  const success = removeCopyTradingProvider(providerId);

  if (!success) {
    res.status(400).json({ error: 'Ошибка удаления провайдера' });
    return;
  }

  res.json({ ok: true });
});

router.put('/admin/providers/:providerId', requireAdmin, (req: Request, res: Response) => {
  const providerId = decodeURIComponent(req.params.providerId);
  const { displayName, description } = req.body;

  const provider = getProviderByUserId(providerId);
  if (!provider) {
    res.status(404).json({ error: 'Провайдер не найден' });
    return;
  }

  const success = updateProviderDetails(providerId, { displayName, description });
  if (!success) {
    res.status(500).json({ error: 'Ошибка обновления провайдера' });
    return;
  }

  res.json({ ok: true });
});

router.patch('/admin/providers/:providerId/stats', requireAdmin, (req: Request, res: Response) => {
  const providerId = decodeURIComponent(req.params.providerId);
  const raw = req.body || {};
  const fake_pnl = typeof raw.fake_pnl === 'number' ? raw.fake_pnl : Number(raw.fake_pnl);
  const fake_win_rate = typeof raw.fake_win_rate === 'number' ? raw.fake_win_rate : Number(raw.fake_win_rate);
  const fake_trades = typeof raw.fake_trades === 'number' ? raw.fake_trades : Number(raw.fake_trades);
  const fake_subscribers = typeof raw.fake_subscribers === 'number' ? raw.fake_subscribers : Number(raw.fake_subscribers);

  const stats: { fake_pnl?: number; fake_win_rate?: number; fake_trades?: number; fake_subscribers?: number } = {};
  if (!Number.isNaN(fake_pnl)) stats.fake_pnl = fake_pnl;
  if (!Number.isNaN(fake_win_rate)) stats.fake_win_rate = fake_win_rate;
  if (!Number.isNaN(fake_trades)) stats.fake_trades = Math.floor(fake_trades);
  if (!Number.isNaN(fake_subscribers)) stats.fake_subscribers = Math.floor(fake_subscribers);

  logger.info('CopyTradingApi', 'PATCH stats request START', {
    rawProviderId: req.params.providerId,
    decodedProviderId: providerId,
    stats
  });

  let provider = getProviderByUserId(providerId);
  logger.info('CopyTradingApi', 'Provider lookup result', { providerId, found: !!provider });

  if (!provider) {
    const user = getUserById(providerId) || findUserByUsername(providerId);
    logger.info('CopyTradingApi', 'User lookup for provider creation', { providerId, userFound: !!user });

    if (user) {
      const added = addCopyTradingProvider(user.id, user.username, undefined);
      logger.info('CopyTradingApi', 'Provider creation attempt', { userId: user.id, added });

      if (added) {
        provider = getProviderByUserId(user.id);
        logger.info('CopyTradingApi', 'Created provider on demand', { userId: user.id, providerFound: !!provider });
      }
    }
  }

  if (!provider) {
    logger.error('CopyTradingApi', 'Provider not found after all attempts', { providerId });
    res.status(404).json({ error: 'Провайдер не найден. Сначала добавьте пользователя как провайдера.' });
    return;
  }

  logger.info('CopyTradingApi', 'Calling updateProviderFakeStats', { providerId: provider.user_id, stats });

  const result = updateProviderFakeStats(provider.user_id, stats);
  logger.info('CopyTradingApi', 'updateProviderFakeStats result', { result });

  if (!result.ok) {
    logger.error('CopyTradingApi', 'Failed to update fake stats', { providerId: provider.user_id, stats, error: result.error });
    res.status(500).json({ error: result.error || 'Ошибка обновления статистики' });
    return;
  }

  logger.info('CopyTradingApi', 'Provider fake stats updated successfully', { providerId: provider.user_id, stats });
  res.json({ ok: true, stats });
});

// Deposit addresses management
router.get('/admin/deposit-addresses', requireAdmin, (req: Request, res: Response) => {
  const addresses = getAllDepositAddresses();
  res.json({ addresses });
});

router.post('/admin/deposit-addresses', requireAdmin, (req: Request, res: Response) => {
  const { network, address, minDeposit, confirmations } = req.body;

  if (!network || !address) {
    res.status(400).json({ error: 'Network и address обязательны' });
    return;
  }

  const result = addDepositAddress(network, address, minDeposit || 10, confirmations || 12);

  if (!result.success) {
    res.status(400).json({ error: result.error || 'Ошибка добавления адреса' });
    return;
  }

  res.json({ ok: true, id: result.id });
});

router.put('/admin/deposit-addresses/:id', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { address, minDeposit, confirmations, enabled } = req.body;

  const success = updateDepositAddress(id, { address, minDeposit, confirmations, enabled });

  if (!success) {
    res.status(400).json({ error: 'Ошибка обновления адреса' });
    return;
  }

  res.json({ ok: true });
});

router.delete('/admin/deposit-addresses/:id', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const success = deleteDepositAddress(id);

  if (!success) {
    res.status(400).json({ error: 'Ошибка удаления адреса' });
    return;
  }

  res.json({ ok: true });
});

export default router;
