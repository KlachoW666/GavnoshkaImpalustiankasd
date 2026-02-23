/**
 * Копитрейдинг: при открытии позиции провайдером — копирование на счета подписчиков.
 */

import { executeSignal } from './autoTrader';
import { getSubscribers } from '../db/copyTradingDb';
import { getBitgetCredentials } from '../db/authDb';
import { insertOrder, listOrders } from '../db/index';
import type { TradingSignal } from '../types/signal';
import type { ExecuteOptions } from './autoTrader';
import { logger } from '../lib/logger';

export interface CopyResult {
  subscriberId: string;
  ok: boolean;
  orderId?: string;
  error?: string;
}

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
      logger.debug('CopyTrading', 'Subscriber has no Bitget keys', { subscriberId: sub.subscriber_id });
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
          
          const orderId = `bitget-${result.orderId}-${sub.subscriber_id}-${Date.now()}`;
          insertOrder({
            id: orderId,
            clientId: sub.subscriber_id,
            pair: signal.symbol,
            direction: signal.direction,
            size: 0,
            leverage: 1,
            openPrice: signal.entry_price ?? 0,
            openTime: new Date().toISOString(),
            status: 'open',
            autoOpened: true,
            confidenceAtOpen: signal.confidence,
            copyProviderId: providerId
          });
        } else {
          logger.warn('CopyTrading', `Copy failed for ${sub.subscriber_id}: ${result.error}`);
        }
      })
      .catch((e) => logger.warn('CopyTrading', `Copy error for ${sub.subscriber_id}`, { error: (e as Error).message }));
  });
}
