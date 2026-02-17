/**
 * Wallet API — баланс, пополнить (адрес), вывести
 * HD кошелёк (BIP44): Trust Wallet с seed-фразой видит все средства.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import { getBalance, debitBalance, creditBalance, getOrCreateWalletIndex, createWithdrawal } from '../db/walletDb';
import { getAddressForNetwork, isHdWalletEnabled } from '../services/hdWalletService';
import { getOpenPositions, getClosedPositions, insertInternalPosition, getPositionById, closeInternalPosition } from '../db/internalTradingDb';
import { insertTriggerOrder, listTriggerOrders, cancelTriggerOrder, getTriggerOrderById } from '../db/triggerOrdersDb';
import { DataAggregator } from '../services/dataAggregator';
import { updateWalletAddress } from '../db/walletDb';
import { logger } from '../lib/logger';

const router = Router();
const MIN_WITHDRAW_USDT = 1;
const MAX_WITHDRAW_USDT = 10000;
const WITHDRAW_FEE_PCT = 0.5;

/** GET /api/wallet/balance — баланс пользователя (USDT) */
router.get('/balance', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const balance = getBalance(userId);
    res.json({ balance, currency: 'USDT', walletEnabled: isHdWalletEnabled() });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/wallet/deposit-address — адрес для пополнения (только USDT/TRC20) */
router.get('/deposit-address', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    if (!isHdWalletEnabled()) {
      return res.status(503).json({ error: 'Кошелёк не настроен. Обратитесь к администратору.' });
    }
    const idx = getOrCreateWalletIndex(userId);
    if (idx == null) return res.status(500).json({ error: 'Не удалось создать адрес' });
    const addresses: Array<{ network: string; label: string; address: string }> = [];
    const addr = getAddressForNetwork('trc20', idx);
    if (addr) {
      updateWalletAddress(userId, idx, addr);
      addresses.push({ network: 'trc20', label: 'Tron (TRC20)', address: addr });
    }
    res.json({
      primaryAddress: addr ?? '',
      primaryNetwork: 'Tron (TRC20)',
      addresses,
      currency: 'USDT',
      warning: 'Отправляйте только USDT по сети Tron (TRC20). Другие токены или сети будут потеряны.'
    });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/wallet/withdraw — заявка на вывод (ожидает подтверждения администратора) */
router.post('/withdraw', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const toAddress = String(req.body?.toAddress || '').trim();
    const amountRaw = parseFloat(String(req.body?.amount || 0));

    if (!isHdWalletEnabled()) {
      return res.status(503).json({ error: 'HD Wallet не настроен.' });
    }
    if (!toAddress || toAddress.length < 30) {
      return res.status(400).json({ error: 'Укажите корректный Tron (TRC20) адрес кошелька (начинается с T, 34 символа).' });
    }
    if (!Number.isFinite(amountRaw) || amountRaw < MIN_WITHDRAW_USDT) {
      return res.status(400).json({ error: `Минимальная сумма вывода: ${MIN_WITHDRAW_USDT} USDT` });
    }
    if (amountRaw > MAX_WITHDRAW_USDT) {
      return res.status(400).json({ error: `Максимальная сумма: ${MAX_WITHDRAW_USDT} USDT` });
    }

    const balance = getBalance(userId);
    if (balance < amountRaw) {
      return res.status(400).json({ error: `Недостаточно средств. Баланс: ${balance.toFixed(2)} USDT` });
    }

    if (!debitBalance(userId, amountRaw)) {
      return res.status(400).json({ error: 'Ошибка списания баланса' });
    }
    const wdId = createWithdrawal(userId, amountRaw, toAddress);
    if (!wdId) {
      creditBalance(userId, amountRaw);
      return res.status(500).json({ error: 'Не удалось создать заявку' });
    }
    logger.info('wallet', 'Withdrawal requested', { userId, amountRaw, toAddress: toAddress.slice(0, 10) + '…' });

    res.json({
      ok: true,
      id: wdId,
      message: 'Заявка создана. Ожидайте подтверждения администратором.'
    });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/wallet/positions — открытые и закрытые позиции (внутренняя торговля) */
router.get('/positions', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const open = getOpenPositions(userId);
    const closed = getClosedPositions(userId, 50);
    res.json({ open, closed });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/wallet/open-position — открыть позицию (списание с баланса) */
router.post('/open-position', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const symbol = String(req.body?.symbol || 'BTC-USDT').replace(/_/g, '-');
    const direction = req.body?.direction === 'SHORT' ? 'SHORT' : 'LONG';
    const sizeUsdt = Math.max(1, Math.min(10000, parseFloat(String(req.body?.sizeUsdt || 0)) || 0));
    const leverage = Math.max(1, Math.min(125, parseInt(String(req.body?.leverage || 1), 10) || 1));

    const aggregator = new DataAggregator();
    const price = await aggregator.getCurrentPrice(symbol);
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Не удалось получить цену' });
    }

    const margin = sizeUsdt / leverage;
    const balance = getBalance(userId);
    if (balance < margin) {
      return res.status(400).json({ error: `Недостаточно баланса. Нужно ${margin.toFixed(2)} USDT` });
    }

    if (!debitBalance(userId, margin)) {
      return res.status(400).json({ error: 'Ошибка списания' });
    }

    const id = `int_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    insertInternalPosition({
      id,
      user_id: userId,
      symbol,
      direction,
      size_usdt: sizeUsdt,
      leverage,
      open_price: price
    });
    res.json({ ok: true, id, openPrice: price });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/wallet/trigger-orders — список условных ордеров пользователя */
router.get('/trigger-orders', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const status = req.query.status as 'pending' | 'executed' | 'cancelled' | undefined;
    const rows = listTriggerOrders(userId, status);
    res.json(rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      direction: r.direction,
      sizeUsdt: r.size_usdt,
      leverage: r.leverage,
      triggerPrice: r.trigger_price,
      orderType: r.order_type,
      limitPrice: r.limit_price,
      status: r.status,
      createdAt: r.created_at
    })));
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/wallet/trigger-order — создать условный ордер */
router.post('/trigger-order', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const symbol = String(req.body?.symbol || 'BTC-USDT').replace(/_/g, '-');
    const direction = req.body?.direction === 'SHORT' ? 'SHORT' : 'LONG';
    const sizeUsdt = Math.max(1, Math.min(10000, parseFloat(String(req.body?.sizeUsdt || 0)) || 0));
    const leverage = Math.max(1, Math.min(125, parseInt(String(req.body?.leverage || 1), 10) || 1));
    const triggerPrice = Math.max(0, parseFloat(String(req.body?.triggerPrice || 0)) || 0);
    const orderType = req.body?.orderType === 'limit' ? 'limit' : 'market';
    const limitPrice = req.body?.limitPrice != null ? parseFloat(String(req.body.limitPrice)) : undefined;
    if (!triggerPrice) {
      return res.status(400).json({ error: 'Укажите цену срабатывания (triggerPrice)' });
    }
    const id = `trg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    insertTriggerOrder({
      id,
      user_id: userId,
      symbol,
      direction,
      size_usdt: sizeUsdt,
      leverage,
      trigger_price: triggerPrice,
      order_type: orderType,
      limit_price: limitPrice
    });
    res.json({ ok: true, id });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/wallet/trigger-orders/:id — отменить условный ордер */
router.delete('/trigger-orders/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Укажите id ордера' });
    const order = getTriggerOrderById(id);
    if (!order || order.user_id !== userId) {
      return res.status(404).json({ error: 'Ордер не найден' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Можно отменить только ожидающий ордер' });
    }
    const ok = cancelTriggerOrder(id, userId);
    res.json({ ok });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/wallet/close-position — закрыть позицию */
router.post('/close-position', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Укажите id позиции' });

    const pos = getPositionById(id);
    if (!pos || pos.user_id !== userId || pos.status !== 'open') {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const aggregator = new DataAggregator();
    const price = await aggregator.getCurrentPrice(pos.symbol);
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Не удалось получить цену' });
    }

    const sizeUsdt = pos.size_usdt;
    const lev = pos.leverage;
    const margin = sizeUsdt / lev;
    let pnlUsdt: number;
    if (pos.direction === 'LONG') {
      pnlUsdt = (price - pos.open_price) / pos.open_price * sizeUsdt;
    } else {
      pnlUsdt = (pos.open_price - price) / pos.open_price * sizeUsdt;
    }
    const pnlPct = (pnlUsdt / margin) * 100;

    closeInternalPosition(id, price, pnlUsdt, pnlPct);
    creditBalance(userId, margin + pnlUsdt);
    res.json({ ok: true, pnl: pnlUsdt, pnlPercent: pnlPct });
  } catch (e) {
    logger.error('wallet', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
