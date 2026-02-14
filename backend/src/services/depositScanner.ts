/**
 * Deposit Scanner — сканирование блокчейна на входящие USDT (BEP-20/ERC-20)
 * Запускается по крону, начисляет баланс при обнаружении транзакций.
 */

import { JsonRpcProvider, Contract, Log } from 'ethers';
import { logger } from '../lib/logger';
import { getConfig, getDerivedAddress, getAddressForNetwork } from './hdWalletService';
import {
  recordDeposit,
  isDepositRecorded,
  creditBalance
} from '../db/walletDb';
import { getDb, initDb } from '../db';

const USDT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ERC20 = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak256(Transfer(address,address,uint256))

let lastScannedBlock = 0;
const BLOCKS_PER_RUN = 500;
const BSC_BLOCK_TIME = 3;
const ETH_BLOCK_TIME = 12;

function getTokenAddress(): string {
  const cfg = getConfig();
  if (!cfg) return USDT_BEP20;
  return cfg.chain === 'bsc' ? USDT_BEP20 : USDT_ERC20;
}

function getRpcUrl(): string {
  const cfg = getConfig();
  if (!cfg?.rpcUrl) return 'https://bsc-dataseed.binance.org';
  return cfg.rpcUrl;
}

/** Убедиться, что все адреса в БД заполнены (для пользователей с индексом, но без адреса) */
async function ensureAddressesInDb(): Promise<Map<string, string>> {
  initDb();
  const db = getDb();
  if (!db) return new Map();
  const addressToUser = new Map<string, string>();
  const rows = db.prepare('SELECT user_id, derivation_index, address FROM user_wallet_addresses').all() as Array<{ user_id: string; derivation_index: number; address: string }>;
  for (const row of rows) {
    const derived = getDerivedAddress(row.derivation_index);
    if (derived) {
      const addr = (row.address && row.address.length > 20) ? row.address : derived.address;
      if (!row.address || row.address.length < 20) {
        db.prepare('UPDATE user_wallet_addresses SET address = ? WHERE user_id = ?').run(derived.address, row.user_id);
      }
      addressToUser.set(addr.toLowerCase(), row.user_id);
      const ethAddr = getAddressForNetwork('eth', row.derivation_index);
      if (ethAddr) addressToUser.set(ethAddr.toLowerCase(), row.user_id);
    }
  }
  return addressToUser;
}

/** Сканировать последние блоки на Transfer(to=our_address) */
export async function scanDeposits(): Promise<{ processed: number; credits: number }> {
  const cfg = getConfig();
  if (!cfg) return { processed: 0, credits: 0 };

  const provider = new JsonRpcProvider(getRpcUrl());
  const addressToUser = await ensureAddressesInDb();
  const ourAddresses = Array.from(addressToUser.keys());
  if (ourAddresses.length === 0) return { processed: 0, credits: 0 };

  const tokenAddr = getTokenAddress();
  let fromBlock: number;
  try {
    const currentBlock = await provider.getBlockNumber();
    if (lastScannedBlock === 0) lastScannedBlock = Math.max(0, currentBlock - 1000);
    fromBlock = lastScannedBlock + 1;
    const toBlock = Math.min(fromBlock + BLOCKS_PER_RUN - 1, currentBlock);
    if (fromBlock > toBlock) return { processed: 0, credits: 0 };

    const logs = await provider.getLogs({
      address: tokenAddr,
      topics: [TRANSFER_TOPIC],
      fromBlock,
      toBlock
    });

    let credits = 0;
    for (const log of logs as Log[]) {
      if (!log.topics || log.topics.length < 3) continue;
      const toAddr = '0x' + log.topics[2].slice(-40).toLowerCase();
      if (!ourAddresses.includes(toAddr)) continue;
      const userId = addressToUser.get(toAddr);
      if (!userId) continue;

      const txHash = log.transactionHash ?? '';
      if (isDepositRecorded(txHash)) continue;

      const value = BigInt(log.data);
      const amountUsdt = Number(value) / 1e18;
      if (amountUsdt < 0.01) continue;

      if (recordDeposit(userId, txHash, amountUsdt)) {
        creditBalance(userId, amountUsdt);
        credits++;
        logger.info('depositScanner', 'Deposit credited', { userId, amountUsdt, txHash: txHash.slice(0, 18) + '…' });
      }
    }

    lastScannedBlock = toBlock;
    return { processed: logs.length, credits };
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
  logger.info('depositScanner', 'Started', { intervalMs });
}

/** Остановить сканер */
export function stopDepositScanner(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
