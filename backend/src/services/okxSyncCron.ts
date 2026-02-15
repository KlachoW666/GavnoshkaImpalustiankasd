/**
 * Cron: периодическая синхронизация закрытых ордеров OKX для пользователей с ключами.
 * Выполняется каждые 5–10 минут.
 */

import { listUserIdsWithOkxCredentials, getOkxCredentials } from '../db/authDb';
import { syncClosedOrdersFromOkx, syncOkxClosedOrdersForML } from './autoTrader';
import { config } from '../config';
import { logger } from '../lib/logger';

const INTERVAL_MS = 6 * 60 * 1000; // 6 минут

let intervalId: ReturnType<typeof setInterval> | null = null;

async function runSync(): Promise<void> {
  const userIds = listUserIdsWithOkxCredentials();
  const hasUsers = userIds.length > 0;

  if (hasUsers) {
  for (const userId of userIds) {
    try {
      const creds = getOkxCredentials(userId);
      if (!creds?.apiKey || !creds?.secret) continue;

      const { synced } = await syncClosedOrdersFromOkx(false, {
        apiKey: creds.apiKey,
        secret: creds.secret,
        passphrase: creds.passphrase ?? ''
      }, userId);

      if (synced > 0) {
        logger.info('OkxSyncCron', `Synced ${synced} order(s) for user ${userId}`);
      }

      const { fed } = await syncOkxClosedOrdersForML({
        apiKey: creds.apiKey,
        secret: creds.secret,
        passphrase: creds.passphrase ?? ''
      }, userId);
      if (fed > 0) {
        logger.info('OkxSyncCron', `ML: fed ${fed} OKX closed orders for user ${userId}`);
      }
    } catch (e) {
      logger.warn('OkxSyncCron', `Sync failed for user ${userId}`, { error: (e as Error).message });
    }
  }
  }

  if (!hasUsers && config.okx.hasCredentials) {
    try {
      const { fed } = await syncOkxClosedOrdersForML(null, null);
      if (fed > 0) logger.info('OkxSyncCron', `ML: fed ${fed} OKX closed orders (global keys)`);
    } catch (e) {
      logger.warn('OkxSyncCron', 'ML sync (global) failed', { error: (e as Error).message });
    }
  }
}

export function startOkxSyncCron(): void {
  if (intervalId) return;
  logger.info('OkxSyncCron', `Starting OKX sync cron (interval ${INTERVAL_MS / 60000} min)`);
  runSync();
  intervalId = setInterval(runSync, INTERVAL_MS);
}

export function stopOkxSyncCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('OkxSyncCron', 'Stopped');
  }
}
