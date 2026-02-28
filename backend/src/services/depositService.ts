/**
 * Deposit Service - проверка депозитов через Bitget API и/или блокчейн (TRC20)
 */

import ccxt from 'ccxt';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { TronWeb, TronWebOptions } from 'tronweb';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { logger } from '../lib/logger';
import {
  updateCopyTradingBalance,
  getOrCreateCopyTradingBalance,
  CopyTradingTransaction
} from '../db/copyTradingBalanceDb';
import { getDb, initDb, isMemoryStore } from '../db/index';

/** USDT TRC20 contract (Tron) */
const TRC20_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

interface TronTxInfo {
  result?: string;
  log?: TronLogEntry[];
}
interface TronLogEntry {
  address?: string;
  topics?: string[];
  data?: string | Buffer;
}

export interface DepositAddress {
  id?: number;
  network: string;
  address: string;
  minDeposit: number;
  confirmations: number;
  enabled?: boolean;
}

const memoryDepositAddresses: DepositAddress[] = [
  { network: 'TRC20', address: 'TBWVx8a36ATZoH64TRiLLsLVMRXjtS7ZHX', minDeposit: 10, confirmations: 20, enabled: true },
  { network: 'BEP20', address: '0x7f21fd37c99245b1c020d233530f49c9aee0af7f', minDeposit: 10, confirmations: 12, enabled: true },
  { network: 'ERC20', address: '0x7f21fd37c99245b1c020d233530f49c9aee0af7f', minDeposit: 20, confirmations: 12, enabled: true }
];

export function getDepositAddresses(): DepositAddress[] {
  initDb();
  if (isMemoryStore()) {
    return memoryDepositAddresses.filter(a => a.enabled !== false);
  }
  const db = getDb();
  if (!db) return memoryDepositAddresses;
  try {
    const rows = db.prepare('SELECT id, network, address, min_deposit as minDeposit, confirmations, enabled FROM deposit_addresses WHERE enabled = 1 ORDER BY id').all() as DepositAddress[];
    return rows.length > 0 ? rows : memoryDepositAddresses;
  } catch {
    return memoryDepositAddresses;
  }
}

export function getAllDepositAddresses(): DepositAddress[] {
  initDb();
  if (isMemoryStore()) {
    return memoryDepositAddresses;
  }
  const db = getDb();
  if (!db) return memoryDepositAddresses;
  try {
    const rows = db.prepare('SELECT id, network, address, min_deposit as minDeposit, confirmations, enabled FROM deposit_addresses ORDER BY id').all() as DepositAddress[];
    return rows.length > 0 ? rows : memoryDepositAddresses;
  } catch {
    return memoryDepositAddresses;
  }
}

export function updateDepositAddress(id: number, data: { address?: string; minDeposit?: number; confirmations?: number; enabled?: boolean }): boolean {
  initDb();
  if (isMemoryStore()) {
    const addr = memoryDepositAddresses.find(a => a.id === id || a.network === String(id));
    if (!addr) return false;
    if (data.address !== undefined) addr.address = data.address;
    if (data.minDeposit !== undefined) addr.minDeposit = data.minDeposit;
    if (data.confirmations !== undefined) addr.confirmations = data.confirmations;
    if (data.enabled !== undefined) addr.enabled = data.enabled;
    return true;
  }
  const db = getDb();
  if (!db) return false;
  try {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (data.address !== undefined) { sets.push('address = ?'); params.push(data.address); }
    if (data.minDeposit !== undefined) { sets.push('min_deposit = ?'); params.push(data.minDeposit); }
    if (data.confirmations !== undefined) { sets.push('confirmations = ?'); params.push(data.confirmations); }
    if (data.enabled !== undefined) { sets.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
    if (sets.length === 0) return true;
    sets.push('updated_at = datetime(\'now\')');
    params.push(id);
    db.prepare('UPDATE deposit_addresses SET ' + sets.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  } catch (e) {
    logger.error('DepositService', `updateDepositAddress error: ${(e as Error).message}`);
    return false;
  }
}

export function addDepositAddress(network: string, address: string, minDeposit: number, confirmations: number): { success: boolean; id?: number; error?: string } {
  initDb();
  if (isMemoryStore()) {
    const id = memoryDepositAddresses.length + 1;
    memoryDepositAddresses.push({ id, network, address, minDeposit, confirmations, enabled: true });
    return { success: true, id };
  }
  const db = getDb();
  if (!db) return { success: false, error: 'DB unavailable' };
  try {
    const result = db.prepare('INSERT INTO deposit_addresses (network, address, min_deposit, confirmations) VALUES (?, ?, ?, ?)').run(network, address, minDeposit, confirmations);
    return { success: true, id: result.lastInsertRowid as number };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function deleteDepositAddress(id: number): boolean {
  initDb();
  if (isMemoryStore()) {
    const idx = memoryDepositAddresses.findIndex(a => a.id === id);
    if (idx === -1) return false;
    memoryDepositAddresses.splice(idx, 1);
    return true;
  }
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare('DELETE FROM deposit_addresses WHERE id = ?').run(id);
    return true;
  } catch {
    return false;
  }
}

export interface PendingDeposit {
  id: number;
  user_id: string;
  amount_usdt: number;
  tx_hash: string | null;
  network: string | null;
  status: string;
  created_at: string;
}

function getDepositNetwork(address: string): string | null {
  const addresses = getDepositAddresses();
  for (const da of addresses) {
    if (da.address.toLowerCase() === address.toLowerCase()) {
      return da.network;
    }
  }
  return null;
}

export function createDepositRequest(userId: string, amount: number, txHash: string, network?: string): { success: boolean; error?: string; txId?: number } {
  initDb();

  if (!txHash || txHash.trim().length < 10) {
    return { success: false, error: 'Неверный хэш транзакции' };
  }

  if (amount < 10) {
    return { success: false, error: 'Минимальная сумма пополнения: 10 USDT' };
  }

  const detectedNetwork = network || 'TRC20';

  if (isMemoryStore()) {
    return { success: true, txId: Date.now() };
  }

  const db = getDb();
  if (!db) return { success: false, error: 'DB error' };

  try {
    const existing = db.prepare('SELECT id FROM copy_trading_transactions WHERE tx_hash = ? AND type = ?').get(txHash.trim(), 'deposit');
    if (existing) {
      return { success: false, error: 'Транзакция уже обрабатывается' };
    }

    const result = db.prepare(`
      INSERT INTO copy_trading_transactions (user_id, type, amount_usdt, tx_hash, status, admin_note)
      VALUES (?, 'deposit', ?, ?, 'pending', ?)
    `).run(userId, amount, txHash.trim(), `Network: ${detectedNetwork}`);

    return { success: true, txId: result.lastInsertRowid as number };
  } catch (e) {
    logger.error('DepositService', `createDepositRequest error: ${(e as Error).message}`);
    return { success: false, error: 'Ошибка создания заявки' };
  }
}

export function getPendingDeposits(): PendingDeposit[] {
  initDb();

  if (isMemoryStore()) {
    return [];
  }

  const db = getDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT id, user_id, amount_usdt, tx_hash, admin_note, status, created_at
      FROM copy_trading_transactions
      WHERE type = 'deposit' AND status = 'pending'
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      amount_usdt: r.amount_usdt,
      tx_hash: r.tx_hash,
      network: r.admin_note?.replace('Network: ', '') || 'Unknown',
      status: r.status,
      created_at: r.created_at
    }));
  } catch {
    return [];
  }
}

export function approveDeposit(txId: number, adminNote?: string): { success: boolean; error?: string } {
  initDb();

  if (isMemoryStore()) {
    return { success: true };
  }

  const db = getDb();
  if (!db) return { success: false, error: 'DB error' };

  try {
    const tx = db.prepare('SELECT * FROM copy_trading_transactions WHERE id = ?').get(txId) as CopyTradingTransaction | undefined;
    if (!tx) return { success: false, error: 'Транзакция не найдена' };
    if (tx.status !== 'pending') return { success: false, error: 'Транзакция уже обработана' };
    if (tx.type !== 'deposit') return { success: false, error: 'Неверный тип транзакции' };

    const result = db.prepare(`
      UPDATE copy_trading_transactions 
      SET status = 'completed', admin_note = ?, processed_at = datetime('now')
      WHERE id = ?
    `).run(adminNote || 'Подтверждено администратором', txId);

    if (result.changes > 0) {
      updateCopyTradingBalance(tx.user_id, { balance: tx.amount_usdt, deposit: tx.amount_usdt });

      const balance = getOrCreateCopyTradingBalance(tx.user_id);
      logger.info('DepositService', `Deposit approved: ${tx.amount_usdt} USDT to user ${tx.user_id}`, {
        newBalance: balance.balance_usdt
      });

      return { success: true };
    }

    return { success: false, error: 'Ошибка обновления' };
  } catch (e) {
    logger.error('DepositService', `approveDeposit error: ${(e as Error).message}`);
    return { success: false, error: 'Ошибка базы данных' };
  }
}

export function rejectDeposit(txId: number, adminNote?: string): { success: boolean; error?: string } {
  initDb();

  if (isMemoryStore()) {
    return { success: true };
  }

  const db = getDb();
  if (!db) return { success: false, error: 'DB error' };

  try {
    const result = db.prepare(`
      UPDATE copy_trading_transactions 
      SET status = 'rejected', admin_note = ?, processed_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(adminNote || 'Отклонено администратором', txId);

    if (result.changes > 0) {
      return { success: true };
    }

    return { success: false, error: 'Транзакция не найдена или уже обработана' };
  } catch (e) {
    return { success: false, error: 'Ошибка базы данных' };
  }
}

let exchangeInstance: any = null;
let autoConfirmInterval: ReturnType<typeof setInterval> | null = null;

const AUTO_CONFIRM_INTERVAL_MS = Math.max(60 * 1000, parseInt(process.env.COPY_TRADING_DEPOSIT_SCAN_INTERVAL_MS || '60000', 10));

export function startCopyTradingDepositScanner(): void {
  if (autoConfirmInterval) return;

  autoConfirmInterval = setInterval(async () => {
    try {
      const result = await autoConfirmDeposits();
      if (result.processed > 0 || result.errors > 0) {
        logger.info('DepositService', `Auto-confirm scan: ${result.processed} processed, ${result.errors} errors`);
      }
    } catch (e) {
      logger.warn('DepositService', `Auto-confirm cron error: ${(e as Error).message}`);
    }
  }, AUTO_CONFIRM_INTERVAL_MS);

  logger.info('DepositService', `Copy trading deposit scanner started`, { intervalMs: AUTO_CONFIRM_INTERVAL_MS });
}

export function stopCopyTradingDepositScanner(): void {
  if (autoConfirmInterval) {
    clearInterval(autoConfirmInterval);
    autoConfirmInterval = null;
  }
}

function getExchange(): any {
  if (exchangeInstance) return exchangeInstance;

  if (!config.bitget.hasCredentials) {
    return null;
  }

  const proxyUrl = getProxy(config.proxyList) || config.proxy;
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  exchangeInstance = new ccxt.bitget({
    apiKey: config.bitget.apiKey,
    secret: config.bitget.secret,
    password: config.bitget.passphrase,
    enableRateLimit: true,
    agent: agent
  });

  return exchangeInstance;
}

export async function checkDepositOnBitget(txHash: string): Promise<{ found: boolean; confirmed: boolean; amount?: number; network?: string }> {
  const exchange = getExchange();
  if (!exchange) {
    logger.warn('DepositService', 'Bitget credentials not configured');
    return { found: false, confirmed: false };
  }

  const depositAddresses = getDepositAddresses();

  try {
    for (const depositAddr of depositAddresses) {
      try {
        const deposits = await (exchange as any).fetchDeposits('USDT', undefined, 50, { network: depositAddr.network });

        for (const deposit of deposits) {
          if (deposit.txid && deposit.txid.toLowerCase() === txHash.toLowerCase()) {
            const isConfirmed = deposit.status === 'ok' || deposit.status === 'success';
            const amount = parseFloat(deposit.amount) || 0;

            logger.info('DepositService', `Found deposit on Bitget`, {
              txHash,
              network: depositAddr.network,
              amount,
              status: deposit.status,
              confirmed: isConfirmed
            });

            return {
              found: true,
              confirmed: isConfirmed,
              amount,
              network: depositAddr.network
            };
          }
        }
      } catch (netErr) {
        logger.debug('DepositService', `Network ${depositAddr.network} check error`, { error: (netErr as Error).message });
      }
    }
  } catch (e) {
    logger.error('DepositService', `checkDepositOnBitget error: ${(e as Error).message}`);
  }

  return { found: false, confirmed: false };
}

/**
 * Проверка депозита по блокчейну (без Bitget).
 * TRC20: TronGrid API — транзакция успешна и на наш адрес пришло USDT >= expectedAmount.
 */
export async function verifyDepositOnBlockchain(
  txHash: string,
  network: string,
  expectedAmount: number,
  ourAddress: string
): Promise<{ verified: boolean; amount?: number; error?: string }> {
  const hash = txHash.trim();
  if (network !== 'TRC20') {
    return { verified: false, error: 'Автопроверка по блокчейну пока только для TRC20' };
  }

  try {
    const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    const info = await (tronWeb as any).trx.getTransactionInfo(hash);
    if (!info) {
      return { verified: false, error: 'Транзакция не найдена' };
    }
    if (info.result !== 'SUCCESS') {
      return { verified: false, error: 'Транзакция ещё не подтверждена или неуспешна' };
    }

    const ourHex = (tronWeb as any).address.toHex(ourAddress).toLowerCase().replace('0x', '').replace(/^41/, '');
    const ourHex20 = ourHex.length >= 40 ? ourHex.slice(-40) : ourHex.padStart(40, '0').slice(-40);

    const usdtContractHex = (tronWeb as any).address.toHex(TRC20_USDT_CONTRACT).toLowerCase().replace('0x', '').replace(/^41/, '').slice(-40);
    const log = (info.log || []).find((l: TronLogEntry) => {
      const addr = String(l.address || '').toLowerCase().replace('0x', '').slice(-40);
      return addr === usdtContractHex;
    });
    if (!log || !log.topics || !Array.isArray(log.topics) || log.topics.length < 3) {
      return { verified: false, error: 'Нет лога TRC20 Transfer для USDT' };
    }

    const topicTo = log.topics[2];
    const toHex = String(topicTo || '').toLowerCase().replace('0x', '').slice(-40);
    if (toHex !== ourHex20) {
      return { verified: false, error: 'Получатель не совпадает с адресом платформы' };
    }

    let amountRaw = 0;
    if (log.data) {
      const data = typeof log.data === 'string' ? log.data : Buffer.isBuffer(log.data) ? (log.data as Buffer).toString('hex') : '';
      if (data.length >= 64) amountRaw = parseInt(data.slice(0, 64), 16);
    }
    const amountUsdt = amountRaw / 1e6;
    if (amountUsdt < expectedAmount - 0.01) {
      return { verified: false, error: `Сумма в сети ${amountUsdt.toFixed(2)} USDT меньше заявленной ${expectedAmount}` };
    }

    logger.info('DepositService', 'Blockchain verification OK', { txHash: hash.slice(0, 16) + '...', network, amountUsdt });
    return { verified: true, amount: amountUsdt };
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn('DepositService', `verifyDepositOnBlockchain error: ${msg}`);
    return { verified: false, error: msg };
  }
}

export async function autoConfirmDeposits(): Promise<{ processed: number; errors: number }> {
  const pending = getPendingDeposits();
  let processed = 0;
  let errors = 0;
  const addresses = getDepositAddresses();

  for (const deposit of pending) {
    if (!deposit.tx_hash) continue;

    const network = deposit.network || 'TRC20';
    const ourAddr = addresses.find(a => a.network === network)?.address;
    let approved = false;
    let note = '';

    const bitgetResult = await checkDepositOnBitget(deposit.tx_hash);
    if (bitgetResult.found && bitgetResult.confirmed) {
      note = `Автоматически (Bitget). Сеть: ${bitgetResult.network}`;
      approved = true;
    }

    if (!approved && ourAddr && (network === 'TRC20' || network === 'BEP20' || network === 'ERC20')) {
      const chainResult = await verifyDepositOnBlockchain(
        deposit.tx_hash,
        network,
        deposit.amount_usdt,
        ourAddr
      );
      if (chainResult.verified) {
        note = `Автоматически (блокчейн). Сеть: ${network}`;
        approved = true;
      }
    }

    if (approved) {
      const success = approveDeposit(deposit.id, note);
      if (success.success) {
        processed++;
        logger.info('DepositService', `Auto-confirmed deposit ${deposit.id}`, {
          userId: deposit.user_id,
          amount: deposit.amount_usdt
        });
      } else {
        errors++;
      }
    }
  }

  return { processed, errors };
}
