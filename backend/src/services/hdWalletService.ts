/**
 * HD Wallet Service — пополнение и вывод только USDT/TRC20
 * Seed-фраза: из .env или из админки (шифрованная в БД).
 * Trust Wallet: импортируйте seed — видите все средства на производных Tron-адресах.
 */

import { logger } from '../lib/logger';
import { getSetting, setSetting } from '../db';
import { getCustomAddress } from '../db/walletDb';
import { decrypt, encrypt } from '../lib/encrypt';
import { getTronAddressFromMnemonic, signAndSendTrc20Usdt } from './tronService';

const SETTINGS_KEY_MNEMONIC = 'hd_wallet_mnemonic_enc';
const SETTINGS_KEY_CHAIN = 'hd_wallet_chain';

export interface WalletConfig {
  mnemonic: string;
  chain: 'trc20';
  rpcUrl?: string;
}

export function getConfig(): WalletConfig | null {
  let mnemonic = process.env.HD_WALLET_MNEMONIC?.trim();
  if (!mnemonic || mnemonic.split(' ').length < 12) {
    const enc = getSetting(SETTINGS_KEY_MNEMONIC);
    mnemonic = enc ? (decrypt(enc) ?? '') : '';
  }
  if (!mnemonic || mnemonic.split(' ').length < 12) return null;
  const chain = (getSetting(SETTINGS_KEY_CHAIN) || process.env.HD_WALLET_CHAIN || 'trc20') as 'trc20';
  return { mnemonic, chain };
}

export function setWalletConfigFromAdmin(mnemonic: string, chain: 'trc20'): void {
  setSetting(SETTINGS_KEY_MNEMONIC, encrypt(mnemonic.trim()));
  setSetting(SETTINGS_KEY_CHAIN, chain);
}

/** Проверить, настроен ли кошелёк (только TRC20) */
export function isHdWalletEnabled(): boolean {
  return getConfig() != null;
}

/** Сети для депозитов — только TRC20 */
export const DEPOSIT_NETWORKS = ['trc20'] as const;
export type DepositNetwork = (typeof DEPOSIT_NETWORKS)[number];

/** Получить производный Tron-адрес по индексу (TRC20) */
export function getDerivedAddress(userIndex: number): { address: string } | null {
  const cfg = getConfig();
  if (!cfg) return null;
  return getTronAddressFromMnemonic(cfg.mnemonic, userIndex);
}

/** Адрес для сети: TRC20 — кастом из админки или derived из seed */
export function getAddressForNetwork(network: DepositNetwork, derivationIndex: number): string | null {
  const custom = getCustomAddress(derivationIndex, network);
  if (custom) return custom;
  if (network === 'trc20') {
    const derived = getDerivedAddress(derivationIndex);
    return derived?.address ?? null;
  }
  return null;
}

/** Все адреса пользователя (только TRC20) */
export function getAllAddressesForUser(derivationIndex: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const net of DEPOSIT_NETWORKS) {
    const addr = getAddressForNetwork(net, derivationIndex);
    if (addr) out[net] = addr;
  }
  return out;
}

/** Подписать и отправить USDT TRC20 — для вывода */
export async function signWithdraw(
  userIndex: number,
  toAddress: string,
  amountUsdt: number
): Promise<{ signedTx?: string; txHash?: string } | { error: string }> {
  const cfg = getConfig();
  if (!cfg) return { error: 'Кошелёк не настроен' };
  const result = await signAndSendTrc20Usdt(cfg.mnemonic, userIndex, toAddress, amountUsdt);
  if ('error' in result) return result;
  return { txHash: result.txHash };
}

/** Для совместимости API — TRC20 отправляет сразу, не нужен broadcast */
export async function broadcastTx(_signedTx: string): Promise<{ txHash: string } | { error: string }> {
  return { error: 'TRC20: use signWithdraw' };
}
