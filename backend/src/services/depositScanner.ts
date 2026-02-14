/**
 * Deposit Scanner — сканирование Tron на входящие USDT TRC20
 * Запускается по крону, начисляет баланс при обнаружении транзакций.
 */

import { logger } from '../lib/logger';
import { getConfig, getDerivedAddress, getAddressForNetwork } from './hdWalletService';
import { recordDeposit, isDepositRecorded, creditBalance } from '../db/walletDb';
import { getDb, initDb } from '../db';

const USDT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_API = 'https://api.trongrid.io';
const USDT_DECIMALS = 6;

/** Адреса наших кошельков → user_id */
async function getAddressToUser(): Promise<Map<string, string>> {
  initDb();
  const db = getDb();
  if (!db) return new Map();
  const addressToUser = new Map<string, string>();
  const rows = db.prepare('SELECT user_id, derivation_index FROM user_wallet_addresses').all() as Array<{ user_id: string; derivation_index: number }>;
  for (const row of rows) {
    const addr = getAddressForNetwork('trc20', row.derivation_index);
    if (addr) addressToUser.set(addr, row.user_id);
  }
  return addressToUser;
}

interface Trc20Tx {
  transaction_id: string;
  token_info: { address: string };
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
}

/** Сканировать TRC20 транзакции на адрес через TronGrid */
async function fetchTrc20Transfers(toAddress: string, minTs?: number): Promise<Trc20Tx[]> {
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  const headers: Record<string, string> = {};
  if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey;
  const url = `${TRONGRID_API}/v1/accounts/${toAddress}/transactions/trc20?limit=50&only_confirmed=true`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 429) throw new Error('TronGrid rate limit');
      if (res.status >= 500) throw new Error(`TronGrid ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { data?: Trc20Tx[] };
    const list = data.data ?? [];
    return list.filter((t) => t.token_info?.address === USDT_TRC20 && t.to === toAddress && (!minTs || t.block_timestamp >= minTs));
  } catch (e) {
    throw e;
  }
}

/** Сканировать депозиты USDT TRC20 */
export async function scanDeposits(): Promise<{ processed: number; credits: number }> {
  const cfg = getConfig();
  if (!cfg) return { processed: 0, credits: 0 };

  const addressToUser = await getAddressToUser();
  const ourAddresses = Array.from(addressToUser.keys());
  if (ourAddresses.length === 0) return { processed: 0, credits: 0 };

  const minTs = Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // последние 7 дней
  let credits = 0;
  let processed = 0;

  try {
    for (const addr of ourAddresses) {
      const txs = await fetchTrc20Transfers(addr, minTs);
      processed += txs.length;
      for (const tx of txs) {
        const userId = addressToUser.get(addr);
        if (!userId) continue;
        const txHash = tx.transaction_id ?? '';
        if (!txHash || isDepositRecorded(txHash)) continue;

        const value = parseInt(tx.value, 10);
        const amountUsdt = value / 10 ** USDT_DECIMALS;
        if (amountUsdt < 0.01) continue;

        if (recordDeposit(userId, txHash, amountUsdt)) {
          creditBalance(userId, amountUsdt);
          credits++;
          logger.info('depositScanner', 'Deposit credited', { userId, amountUsdt, txHash: txHash.slice(0, 18) + '…' });
        }
      }
    }
    return { processed, credits };
  } catch (e) {
    logger.warn('depositScanner', 'Scan failed', { error: (e as Error).message });
    return { processed: 0, credits: 0 };
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Запустить периодическое сканирование (каждые 60 сек) */
export function startDepositScanner(): void {
  if (!getConfig()) return;
  if (intervalId) return;
  const intervalMs = 60 * 1000;
  intervalId = setInterval(() => {
    scanDeposits().catch((e) => logger.warn('depositScanner', 'Cron error', { error: (e as Error).message }));
  }, intervalMs);
  logger.info('depositScanner', 'Started (TRC20)', { intervalMs });
}

/** Остановить сканер */
export function stopDepositScanner(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
