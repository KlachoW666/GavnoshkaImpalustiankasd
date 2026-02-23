/**
 * Cron: периодическая синхронизация закрытых ордеров Bitget для пользователей с ключами.
 * Выполняется каждые 5–10 минут.
 */

import { listUserIdsWithBitgetCredentials, getBitgetCredentials } from '../db/authDb';
import { syncClosedOrdersFromBitget, pullClosedOrdersFromBitget, syncBitgetClosedOrdersForML } from './autoTrader';
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
