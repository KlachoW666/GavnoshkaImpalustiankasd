/**
 * Copy Trading Profit Share Service
 * High Water Mark mechanism for profit distribution
 */

import { getDb, initDb, isMemoryStore } from '../db/index';
import { getOrCreateCopyTradingBalance, updateCopyTradingBalance, createCopyTradingTransaction, getCopyTradingBalancesWithPositiveBalance } from '../db/copyTradingBalanceDb';
import { getSubscription, getSubscriptionsForSubscriber } from '../db/copyTradingDb';
import { logger } from '../lib/logger';

/** client_id ордеров, исполняемых с пула копитрейдинга (счёт админа на Bitget) */
export const ADMIN_POOL_CLIENT_ID = 'admin_pool';

export interface CopySubscriptionProfitState {
  subscriber_id: string;
  provider_id: string;
  balance_after_last_distribution: number;
  last_distribution_at: string | null;
}

const memoryProfitState: Map<string, CopySubscriptionProfitState> = new Map();

function ensureTables(): void {
  initDb();
}

export function getProfitState(subscriberId: string, providerId: string): CopySubscriptionProfitState | null {
  ensureTables();
  const key = `${subscriberId}:${providerId}`;
  if (isMemoryStore()) {
    return memoryProfitState.get(key) ?? null;
  }
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM copy_subscription_profit_state WHERE subscriber_id = ? AND provider_id = ?').get(subscriberId, providerId);
    return (row as CopySubscriptionProfitState) ?? null;
  } catch { return null; }
}

export function getOrCreateProfitState(subscriberId: string, providerId: string): CopySubscriptionProfitState {
  ensureTables();
  const existing = getProfitState(subscriberId, providerId);
  if (existing) return existing;
  
  const balance = getOrCreateCopyTradingBalance(subscriberId);
  const newState: CopySubscriptionProfitState = {
    subscriber_id: subscriberId,
    provider_id: providerId,
    balance_after_last_distribution: balance.balance_usdt,
    last_distribution_at: null
  };
  upsertProfitState(newState);
  return newState;
}

export function upsertProfitState(state: CopySubscriptionProfitState): void {
  ensureTables();
  const key = `${state.subscriber_id}:${state.provider_id}`;
  if (isMemoryStore()) {
    memoryProfitState.set(key, state);
    return;
  }
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO copy_subscription_profit_state (subscriber_id, provider_id, balance_after_last_distribution, last_distribution_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(subscriber_id, provider_id) DO UPDATE SET
        balance_after_last_distribution = excluded.balance_after_last_distribution,
        last_distribution_at = excluded.last_distribution_at
    `).run(state.subscriber_id, state.provider_id, state.balance_after_last_distribution, state.last_distribution_at);
  } catch {}
}

export function deleteProfitState(subscriberId: string, providerId: string): void {
  ensureTables();
  const key = `${subscriberId}:${providerId}`;
  if (isMemoryStore()) {
    memoryProfitState.delete(key);
    return;
  }
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('DELETE FROM copy_subscription_profit_state WHERE subscriber_id = ? AND provider_id = ?').run(subscriberId, providerId);
  } catch {}
}

export interface DistributionResult {
  distributed: boolean;
  profitSinceLast: number;
  shareAmount: number;
  newHighWaterMark: number;
  error?: string;
}

export function distributeProfitShare(subscriberId: string, providerId: string): DistributionResult {
  ensureTables();
  
  const subscription = getSubscription(providerId, subscriberId);
  if (!subscription) {
    return { distributed: false, profitSinceLast: 0, shareAmount: 0, newHighWaterMark: 0, error: 'No subscription' };
  }

  const subscriberBalance = getOrCreateCopyTradingBalance(subscriberId);
  const profitState = getOrCreateProfitState(subscriberId, providerId);
  const hwm = profitState.balance_after_last_distribution;
  const currentBalance = subscriberBalance.balance_usdt;
  const profitSinceLast = currentBalance - hwm;

  if (profitSinceLast <= 0) {
    logger.debug('ProfitShare', `No profit to distribute for ${subscriberId} -> ${providerId}`, { hwm, currentBalance, profitSinceLast });
    return { distributed: false, profitSinceLast: 0, shareAmount: 0, newHighWaterMark: hwm };
  }

  const profitSharePercent = subscription.profit_share_percent ?? 10;
  const shareAmount = Math.round(profitSinceLast * (profitSharePercent / 100) * 100) / 100;

  if (shareAmount <= 0) {
    return { distributed: false, profitSinceLast, shareAmount: 0, newHighWaterMark: hwm };
  }

  logger.info('ProfitShare', `Distributing profit share`, {
    subscriberId,
    providerId,
    profitSinceLast,
    profitSharePercent,
    shareAmount
  });

  const db = getDb();
  
  if (isMemoryStore()) {
    updateCopyTradingBalance(subscriberId, { balance: -shareAmount, pnl: -shareAmount });
    updateCopyTradingBalance(providerId, { balance: shareAmount, pnl: shareAmount });
    
    createCopyTradingTransaction(subscriberId, 'fee', shareAmount, { providerId, adminNote: `Profit share ${profitSharePercent}% to provider` });
    createCopyTradingTransaction(providerId, 'pnl_credit', shareAmount, { providerId: subscriberId, adminNote: `Profit share from subscriber` });

    const newHwm = currentBalance - shareAmount;
    upsertProfitState({
      subscriber_id: subscriberId,
      provider_id: providerId,
      balance_after_last_distribution: newHwm,
      last_distribution_at: new Date().toISOString()
    });

    return { distributed: true, profitSinceLast, shareAmount, newHighWaterMark: newHwm };
  }

  if (!db) {
    return { distributed: false, profitSinceLast, shareAmount: 0, newHighWaterMark: hwm, error: 'No DB' };
  }

  try {
    const transaction = db.transaction(() => {
      updateCopyTradingBalance(subscriberId, { balance: -shareAmount, pnl: -shareAmount });
      updateCopyTradingBalance(providerId, { balance: shareAmount, pnl: shareAmount });
      
      createCopyTradingTransaction(subscriberId, 'fee', shareAmount, { providerId, adminNote: `Profit share ${profitSharePercent}% to provider` });
      createCopyTradingTransaction(providerId, 'pnl_credit', shareAmount, { providerId: subscriberId, adminNote: `Profit share from subscriber` });

      const newHwm = currentBalance - shareAmount;
      upsertProfitState({
        subscriber_id: subscriberId,
        provider_id: providerId,
        balance_after_last_distribution: newHwm,
        last_distribution_at: new Date().toISOString()
      });

      return newHwm;
    });

    const newHwm = transaction();
    return { distributed: true, profitSinceLast, shareAmount, newHighWaterMark: newHwm };
  } catch (e) {
    logger.error('ProfitShare', `Failed to distribute profit share: ${(e as Error).message}`);
    return { distributed: false, profitSinceLast, shareAmount: 0, newHighWaterMark: hwm, error: (e as Error).message };
  }
}

export function handleCopyOrderPnL(subscriberId: string, providerId: string, pnl: number): void {
  if (pnl <= 0) {
    logger.debug('ProfitShare', `No PnL to credit for ${subscriberId}`, { pnl });
    return;
  }

  logger.info('ProfitShare', `Crediting PnL to subscriber`, { subscriberId, providerId, pnl });

  updateCopyTradingBalance(subscriberId, { balance: pnl, pnl: pnl });
  createCopyTradingTransaction(subscriberId, 'pnl_credit', pnl, { providerId });

  distributeProfitShare(subscriberId, providerId);
}

/**
 * Распределение PnL пула (ордера admin_pool с Bitget) по балансам копитрейдинга пропорционально
 * и вызов distributeProfitShare для каждой подписки — синхронизация с реализованным распределением.
 */
export function distributePoolPnLToCopyTrading(pnl: number): void {
  if (pnl <= 0) return;
  const balances = getCopyTradingBalancesWithPositiveBalance();
  const total = balances.reduce((s, b) => s + b.balance_usdt, 0);
  if (total <= 0) {
    logger.warn('ProfitShare', 'Pool PnL distribution skipped: no positive copy-trading balances');
    return;
  }
  logger.info('ProfitShare', 'Distributing pool PnL to copy-trading', { pnl, participants: balances.length, totalPool: total });
  for (const { user_id, balance_usdt } of balances) {
    const share = balance_usdt / total;
    const credit = Math.round(pnl * share * 100) / 100;
    if (credit <= 0) continue;
    updateCopyTradingBalance(user_id, { balance: credit, pnl: credit });
    createCopyTradingTransaction(user_id, 'pnl_credit', credit, { adminNote: 'Pool PnL (admin auto)' });
    const subs = getSubscriptionsForSubscriber(user_id);
    for (const sub of subs) {
      distributeProfitShare(user_id, sub.provider_id);
    }
  }
}
