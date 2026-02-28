/**
 * API ордеров — сохранение и получение из БД (все пользователи).
 * Валидация Zod, проверка владельца при PATCH.
 */

import { Router, Request, Response } from 'express';
import { initDb, insertOrder, updateOrderClose, listOrders, getOrderById } from '../db';
import { feedOrderToML } from '../services/onlineMLService';
import { handleCopyOrderPnL, distributePoolPnLToCopyTrading, ADMIN_POOL_CLIENT_ID } from '../services/copyTradingProfitShareService';
import { syncClosedOrdersFromBitget, pullClosedOrdersFromBitget } from '../services/autoTrader';
import { getBitgetCredentials, getBitgetDemoCredentials } from '../db/authDb';
import { logger } from '../lib/logger';
import { optionalAuth } from './auth';
import { orderCloseSchema } from '../schemas/orders';

const router = Router();

function getClientId(req: Request): string {
  const header = req.headers['x-client-id'] as string | undefined;
  const body = (req.body?.clientId as string) || (req.query?.clientId as string);
  const userId = (req as any).userId as string | undefined;
  return (userId || header || body || 'default').trim() || 'default';
}

/** POST /api/orders — создать ордер (открытие) или обновить (закрытие) */
router.post('/', optionalAuth, (req: Request, res: Response) => {
  try {
    initDb();
    const clientId = getClientId(req);
    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return res.status(400).json({ error: 'id обязателен' });
    }
    if (body.status === 'closed' && body.closePrice != null) {
      const order = getOrderById(id);
      if (order && order.client_id !== clientId) {
        return res.status(403).json({ error: 'Ордер принадлежит другому пользователю' });
      }
      const pnl = Number(body.pnl) || 0;
      const closedOrder = updateOrderClose({
        id,
        closePrice: Number(body.closePrice),
        pnl,
        pnlPercent: Number(body.pnlPercent) || 0,
        closeTime: typeof body.closeTime === 'string' ? body.closeTime : new Date().toISOString()
      });
      if (order) feedOrderToML(order, pnl);
      if (pnl > 0) {
        if (closedOrder?.client_id === ADMIN_POOL_CLIENT_ID) {
          distributePoolPnLToCopyTrading(pnl);
        } else if (closedOrder?.copy_provider_id && closedOrder.client_id) {
          handleCopyOrderPnL(closedOrder.client_id, closedOrder.copy_provider_id, pnl);
        }
      }
      return res.json({ ok: true, updated: true });
    }
    insertOrder({
      id,
      clientId,
      pair: String(body.pair || ''),
      direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
      size: Number(body.size) || 0,
      leverage: Number(body.leverage) || 1,
      openPrice: Number(body.openPrice) || 0,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
      takeProfit: Array.isArray(body.takeProfit) ? body.takeProfit.map(Number) : undefined,
      openTime: typeof body.openTime === 'string' ? body.openTime : new Date().toISOString(),
      status: 'open',
      autoOpened: Boolean(body.autoOpened),
      confidenceAtOpen: body.confidenceAtOpen != null ? Number(body.confidenceAtOpen) : undefined
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/orders/:id — закрыть ордер. Проверка владельца. */
router.patch('/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    initDb();
    const id = req.params.id?.trim();
    const body = req.body || {};
    const parseResult = orderCloseSchema.safeParse({
      closePrice: body.closePrice,
      pnl: body.pnl,
      pnlPercent: body.pnlPercent,
      closeTime: body.closeTime
    });
    if (!parseResult.success) {
      const msg = parseResult.error.issues[0]?.message ?? 'Неверные данные';
      return res.status(400).json({ error: msg });
    }
    const { closePrice, pnl, pnlPercent, closeTime } = parseResult.data;
    if (!id) {
      return res.status(400).json({ error: 'id обязателен' });
    }
    const clientId = getClientId(req);
    const order = getOrderById(id);
    if (order && order.client_id !== clientId) {
      return res.status(403).json({ error: 'Ордер принадлежит другому пользователю' });
    }
    const pnlVal = pnl ?? 0;
    const closedOrder = updateOrderClose({
      id,
      closePrice,
      pnl: pnlVal,
      pnlPercent: pnlPercent ?? 0,
      closeTime: closeTime ?? new Date().toISOString()
    });
    if (order) feedOrderToML(order, pnlVal);
    if (pnlVal > 0) {
      if (closedOrder?.client_id === ADMIN_POOL_CLIENT_ID) {
        distributePoolPnLToCopyTrading(pnlVal);
      } else if (closedOrder?.copy_provider_id && closedOrder.client_id) {
        handleCopyOrderPnL(closedOrder.client_id, closedOrder.copy_provider_id, pnlVal);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/orders — список ордеров (всех или по clientId). При авторизации без clientId в query — по userId. Перед выдачей синхронизируем закрытые ордера с OKX. */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    initDb();
    const userId = (req as any).userId as string | undefined;
    let clientId = req.query.clientId as string | undefined;
    if (!clientId && userId) clientId = userId;
    /** Демо режим только при явном useTestnet=true */
    const useTestnet = req.query.useTestnet === 'true';
    if (userId && clientId) {
      try {
        const userCreds = useTestnet ? getBitgetDemoCredentials(userId) : getBitgetCredentials(userId);
        if (userCreds?.apiKey && userCreds?.secret) {
          await syncClosedOrdersFromBitget(useTestnet, userCreds, clientId);
          await pullClosedOrdersFromBitget(useTestnet, userCreds, clientId);
        }
      } catch (_) { /* ignore */ }
    }
    const status = req.query.status as 'open' | 'closed' | undefined;
    const limit = Math.min(Math.max(0, Number(req.query.limit) || 100), 500);
    const rows = listOrders({ clientId, status, limit });
    const orders = rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      pair: r.pair,
      direction: r.direction,
      size: r.size,
      leverage: r.leverage,
      openPrice: r.open_price,
      closePrice: r.close_price,
      stopLoss: r.stop_loss,
      takeProfit: r.take_profit ? JSON.parse(r.take_profit) : undefined,
      pnl: r.pnl,
      pnlPercent: r.pnl_percent,
      openTime: r.open_time,
      closeTime: r.close_time,
      status: r.status,
      autoOpened: Boolean(r.auto_opened),
      confidenceAtOpen: r.confidence_at_open,
      createdAt: r.created_at
    }));
    res.json(orders);
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
