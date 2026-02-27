/**
 * Cron: периодическая синхронизация закрытых ордеров Bitget для пользователей с ключами.
 * Выполняется каждые 5–10 минут.
 */

import { listUserIdsWithBitgetCredentials, getBitgetCredentials } from '../db/authDb';
import { syncClosedOrdersFromBitget, pullClosedOrdersFromBitget, syncBitgetClosedOrdersForML, cancelExpiredLimitOrders, processTrailingStops, processSmartDOMExits } from './autoTrader';
import { ADMIN_POOL_CLIENT_ID } from './copyTradingProfitShareService';
import { config } from '../config';
import { logger } from '../lib/logger';

const INTERVAL_MS = 6 * 60 * 1000; // 6 минут

let intervalId: ReturnType<typeof setInterval> | null = null;

async function runSync(): Promise<void> {
  const userIds = listUserIdsWithBitgetCredentials();
  const hasUsers = userIds.length > 0;

  if (hasUsers) {
    for (const userId of userIds) {
      try {
        const creds = getBitgetCredentials(userId);
        if (!creds?.apiKey || !creds?.secret) continue;

        const { synced } = await syncClosedOrdersFromBitget(false, {
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        }, userId);

        const { pulled } = await pullClosedOrdersFromBitget(false, {
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        }, userId);

        if (synced > 0 || pulled > 0) {
          logger.info('BitgetSyncCron', `Bitget sync: ${synced} updated, ${pulled} pulled for user ${userId}`);
        }

        const { fed } = await syncBitgetClosedOrdersForML({
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        }, userId);
        if (fed > 0) {
          logger.info('BitgetSyncCron', `ML: fed ${fed} Bitget closed orders for user ${userId}`);
        }

        // Phase 1: Cleaning up dead limit orders
        const { canceled } = await cancelExpiredLimitOrders(false, {
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        });
        if (canceled > 0) {
          logger.info('BitgetSyncCron', `Canceled ${canceled} expired limit orders for user ${userId}`);
        }

        // Phase 2: Trailing Stop / Breakeven Monitor
        const { processedConfigs } = await processTrailingStops(false, {
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        });
        if (processedConfigs > 0) {
          logger.info('BitgetSyncCron', `Updated ${processedConfigs} trailing stops for user ${userId}`);
        }

        // Phase 4: Smart DOM Exits
        const { smartExits } = await processSmartDOMExits(false, {
          apiKey: creds.apiKey,
          secret: creds.secret,
          passphrase: creds.passphrase ?? ''
        });
        if (smartExits > 0) {
          logger.info('BitgetSyncCron', `Triggered ${smartExits} smart DOM exits for user ${userId}`);
        }
      } catch (e) {
        logger.warn('BitgetSyncCron', `Sync failed for user ${userId}`, { error: (e as Error).message });
      }
    }
  }

  if (config.bitget.hasCredentials) {
    try {
      const { synced } = await syncClosedOrdersFromBitget(false, null, ADMIN_POOL_CLIENT_ID);
      if (synced > 0) logger.info('BitgetSyncCron', `Pool sync: ${synced} closed orders (admin_pool)`);
    } catch (e) {
      logger.warn('BitgetSyncCron', 'Pool sync failed', { error: (e as Error).message });
    }
    if (!hasUsers) {
      try {
        const { fed } = await syncBitgetClosedOrdersForML(null, null);
        if (fed > 0) logger.info('BitgetSyncCron', `ML: fed ${fed} Bitget closed orders (global keys)`);
      } catch (e) {
        logger.warn('BitgetSyncCron', 'ML sync (global) failed', { error: (e as Error).message });
      }
    }

    try {
      // Phase 1: Admins global limit orders cleanup
      const { canceled } = await cancelExpiredLimitOrders(false, null);
      if (canceled > 0) logger.info('BitgetSyncCron', `Pool sync: Canceled ${canceled} expired limit orders (admin_pool)`);

      // Phase 2: Admins global limit trailing stops
      const { processedConfigs } = await processTrailingStops(false, null);
      if (processedConfigs > 0) logger.info('BitgetSyncCron', `Pool sync: Updated ${processedConfigs} trailing stops (admin_pool)`);

      // Phase 4: Admins global smart DOM exits
      const { smartExits } = await processSmartDOMExits(false, null);
      if (smartExits > 0) logger.info('BitgetSyncCron', `Pool sync: Triggered ${smartExits} smart DOM exits (admin_pool)`);
    } catch (e) {
      logger.warn('BitgetSyncCron', 'Pool limit-orders cleanup failed', { error: (e as Error).message });
    }
  }
}

export function startBitgetSyncCron(): void {
  if (intervalId) return;
  logger.info('BitgetSyncCron', `Starting Bitget sync cron (interval ${INTERVAL_MS / 60000} min)`);
  runSync();
  intervalId = setInterval(runSync, INTERVAL_MS);
}

export function stopBitgetSyncCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('BitgetSyncCron', 'Stopped');
  }
}
