/**
 * Копитрейдинг: при открытии позиции провайдером — копирование на счета подписчиков.
 */

import { executeSignal } from './autoTrader';
import { getSubscribers } from '../db/copyTradingDb';
import { getBitgetCredentials } from '../db/authDb';
import type { TradingSignal } from '../types/signal';
import type { ExecuteOptions } from './autoTrader';
import { logger } from '../lib/logger';

export interface CopyResult {
  subscriberId: string;
  ok: boolean;
  orderId?: string;
  error?: string;
}

/**
 * Скопировать сделку провайдера на всех подписчиков (в фоне).
 * Используется тот же сигнал; размер у подписчика = size_percent от его баланса.
 */
export function copyOrderToSubscribers(
  providerId: string,
  signal: TradingSignal,
  options: ExecuteOptions
): void {
  const subs = getSubscribers(providerId);
  if (subs.length === 0) return;

  logger.info('CopyTrading', `Copying order to ${subs.length} subscribers`, { providerId, symbol: signal.symbol });

  subs.forEach((sub) => {
    const creds = getBitgetCredentials(sub.subscriber_id);
    if (!creds?.apiKey?.trim() || !creds?.secret?.trim()) {
      logger.debug('CopyTrading', 'Subscriber has no OKX keys', { subscriberId: sub.subscriber_id });
      return;
    }
    const opts: ExecuteOptions = {
      ...options,
      sizePercent: sub.size_percent,
      maxPositions: options.maxPositions ?? 10
    };
    executeSignal(signal, opts, creds)
      .then((result) => {
        if (result.ok) {
          logger.info('CopyTrading', `Copied to subscriber ${sub.subscriber_id}`, { orderId: result.orderId });
        } else {
          logger.warn('CopyTrading', `Copy failed for ${sub.subscriber_id}: ${result.error}`);
        }
      })
      .catch((e) => logger.warn('CopyTrading', `Copy error for ${sub.subscriber_id}`, { error: (e as Error).message }));
  });
}
