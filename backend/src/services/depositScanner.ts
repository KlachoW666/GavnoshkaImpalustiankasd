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
/** Задержка между запросами по разным адресам (мс), чтобы не упираться в rate limit */
const DELAY_BETWEEN_ADDRESSES_MS = 1500;
/** При 429 ждём столько мс и повторяем один раз */
const RETRY_AFTER_RATE_LIMIT_MS = 8000;
/** После 429 не дергать TronGrid столько мс (5 мин), чтобы не спамить лимит */
const BACKOFF_AFTER_RATE_LIMIT_MS = 5 * 60 * 1000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Сканировать TRC20 транзакции на адрес через TronGrid (с одним повтором при 429) */
async function fetchTrc20Transfers(toAddress: string, minTs?: number, isRetry = false): Promise<Trc20Tx[]> {
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  const headers: Record<string, string> = {};
  if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey;
  const url = `${TRONGRID_API}/v1/accounts/${toAddress}/transactions/trc20?limit=50&only_confirmed=true`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 429) {
      if (!isRetry) {
        await sleep(RETRY_AFTER_RATE_LIMIT_MS);
        return fetchTrc20Transfers(toAddress, minTs, true);
      }
      throw new Error('TronGrid rate limit');
    }
    if (res.status >= 500) throw new Error(`TronGrid ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { data?: Trc20Tx[] };
  const list = data.data ?? [];
  return list.filter((t) => t.token_info?.address === USDT_TRC20 && t.to === toAddress && (!minTs || t.block_timestamp >= minTs));
}

/** Сканировать депозиты USDT TRC20 */
export async function scanDeposits(): Promise<{ processed: number; credits: number }> {
  const cfg = getConfig();
  if (!cfg) return { processed: 0, credits: 0 };

  if (Date.now() < nextScanNoEarlierThan) return { processed: 0, credits: 0 };

  const addressToUser = await getAddressToUser();
  const ourAddresses = Array.from(addressToUser.keys());
  if (ourAddresses.length === 0) return { processed: 0, credits: 0 };

  const minTs = Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // последние 7 дней
  let credits = 0;
  let processed = 0;

  try {
    for (let i = 0; i < ourAddresses.length; i++) {
      if (i > 0) await sleep(DELAY_BETWEEN_ADDRESSES_MS);
      const addr = ourAddresses[i];
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
    const msg = (e as Error).message;
    if (msg === 'TronGrid rate limit') {
      nextScanNoEarlierThan = Date.now() + BACKOFF_AFTER_RATE_LIMIT_MS;
      logger.warn('depositScanner', 'Scan failed (rate limit), next scan in 5 min', { error: msg });
    } else {
      logger.warn('depositScanner', 'Scan failed', { error: msg });
    }
    return { processed: 0, credits: 0 };
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;
/** После 429 не запускать скан до этой метки времени */
let nextScanNoEarlierThan = 0;

/** Запустить периодическое сканирование. С API-ключом — 60 сек, без — 120 сек (меньше лимитов TronGrid). */
export function startDepositScanner(): void {
  if (!getConfig()) return;
  if (intervalId) return;
  const hasKey = !!process.env.TRONGRID_API_KEY?.trim();
  const intervalMs = hasKey ? 60 * 1000 : 120 * 1000;
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
