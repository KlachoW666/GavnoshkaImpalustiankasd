/**
 * Cron: периодическая синхронизация закрытых ордеров OKX для пользователей с ключами.
 * Выполняется каждые 5–10 минут.
 */

import { listUserIdsWithOkxCredentials, getOkxCredentials } from '../db/authDb';
import { syncClosedOrdersFromOkx } from './autoTrader';
import { logger } from '../lib/logger';

const INTERVAL_MS = 6 * 60 * 1000; // 6 минут

let intervalId: ReturnType<typeof setInterval> | null = null;

async function runSync(): Promise<void> {
  const userIds = listUserIdsWithOkxCredentials();
  if (userIds.length === 0) return;

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
    } catch (e) {
      logger.warn('OkxSyncCron', `Sync failed for user ${userId}`, { error: (e as Error).message });
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
