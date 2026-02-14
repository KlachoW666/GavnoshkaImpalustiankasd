/**
 * HD Wallet Service — BIP44/HD кошельки для приёма депозитов
 * Seed-фраза: из .env или из админки (шифрованная в БД).
 * Trust Wallet: импортируйте seed — видите все средства на производных адресах.
 */

import { HDNodeWallet, JsonRpcProvider } from 'ethers';
import { logger } from '../lib/logger';
import { getSetting, setSetting } from '../db';
import { getCustomAddress } from '../db/walletDb';
import { decrypt, encrypt } from '../lib/encrypt';

const BIP44_PATH = "m/44'/60'/0'/0";  // Ethereum/BNB Chain
const USDT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ERC20 = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_DECIMALS = 18;
const SETTINGS_KEY_MNEMONIC = 'hd_wallet_mnemonic_enc';
const SETTINGS_KEY_CHAIN = 'hd_wallet_chain';
const SETTINGS_KEY_RPC = 'hd_wallet_rpc';

export interface WalletConfig {
  mnemonic: string;
  chain: 'bsc' | 'eth';
  rpcUrl?: string;
}

const BSC_RPC = 'https://bsc-dataseed.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';

export function getConfig(): WalletConfig | null {
  let mnemonic = process.env.HD_WALLET_MNEMONIC?.trim();
  if (!mnemonic || mnemonic.split(' ').length < 12) {
    const enc = getSetting(SETTINGS_KEY_MNEMONIC);
    mnemonic = enc ? (decrypt(enc) ?? '') : '';
  }
  if (!mnemonic || mnemonic.split(' ').length < 12) return null;
  const chain = (getSetting(SETTINGS_KEY_CHAIN) || process.env.HD_WALLET_CHAIN || 'bsc') as 'bsc' | 'eth';
  const rpcUrl = getSetting(SETTINGS_KEY_RPC) || process.env.HD_WALLET_RPC || (chain === 'bsc' ? BSC_RPC : ETH_RPC);
  return { mnemonic, chain, rpcUrl };
}

export function setWalletConfigFromAdmin(mnemonic: string, chain: 'bsc' | 'eth', rpcUrl?: string): void {
  setSetting(SETTINGS_KEY_MNEMONIC, encrypt(mnemonic.trim()));
  setSetting(SETTINGS_KEY_CHAIN, chain);
  if (rpcUrl) setSetting(SETTINGS_KEY_RPC, rpcUrl.trim());
  clearWalletCache();
}

let rootWallet: HDNodeWallet | null = null;

export function clearWalletCache(): void {
  rootWallet = null;
}

function getRootWallet(): HDNodeWallet | null {
  if (rootWallet) return rootWallet;
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    rootWallet = HDNodeWallet.fromPhrase(cfg.mnemonic, BIP44_PATH);
    return rootWallet;
  } catch (e) {
    logger.error('hdWallet', 'Invalid mnemonic', { error: (e as Error).message });
    return null;
  }
}

/** Проверить, настроен ли HD кошелёк */
export function isHdWalletEnabled(): boolean {
  return getRootWallet() != null;
}

/** Сети для депозитов. BSC/ETH — из seed, TRC20 — кастом из админки. */
export const DEPOSIT_NETWORKS = ['bsc', 'eth', 'trc20'] as const;
export type DepositNetwork = (typeof DEPOSIT_NETWORKS)[number];

/** Получить производный адрес по индексу (EVM: BSC, ETH). */
export function getDerivedAddress(userIndex: number): { address: string } | null {
  const root = getRootWallet();
  if (!root) return null;
  try {
    const wallet = root.derivePath(String(userIndex));
    return { address: wallet.address };
  } catch (e) {
    logger.error('hdWallet', 'derivePath failed', { userIndex, error: (e as Error).message });
    return null;
  }
}

/** Адрес для сети: EVM — derive, TRC20 — кастом из wallet_custom_addresses */
export function getAddressForNetwork(network: DepositNetwork, derivationIndex: number): string | null {
  const custom = getCustomAddress(derivationIndex, network);
  if (custom) return custom;
  if (network === 'bsc' || network === 'eth') {
    const derived = getDerivedAddress(derivationIndex);
    return derived?.address ?? null;
  }
  return null;
}

/** Все адреса пользователя по сетям */
export function getAllAddressesForUser(derivationIndex: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const net of DEPOSIT_NETWORKS) {
    const addr = getAddressForNetwork(net, derivationIndex);
    if (addr) out[net] = addr;
  }
  return out;
}

/** Баланс USDT на адресе (BEP-20 / ERC-20) */
export async function getUsdtBalance(address: string): Promise<number> {
  const cfg = getConfig();
  if (!cfg) return 0;
  try {
    const provider = new JsonRpcProvider(cfg.rpcUrl || (cfg.chain === 'bsc' ? BSC_RPC : ETH_RPC));
    const tokenAddr = cfg.chain === 'bsc' ? USDT_BEP20 : USDT_ERC20;
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new (await import('ethers')).Contract(tokenAddr, abi, provider);
    const raw = await contract.balanceOf(address);
    const balance = Number((raw as bigint) / BigInt(10 ** USDT_DECIMALS));
    return balance;
  } catch (e) {
    logger.warn('hdWallet', 'getUsdtBalance failed', { address, error: (e as Error).message });
    return 0;
  }
}

/** Баланс нативной монеты (BNB / ETH) на адресе */
export async function getNativeBalance(address: string): Promise<number> {
  const cfg = getConfig();
  if (!cfg) return 0;
  try {
    const provider = new JsonRpcProvider(cfg.rpcUrl || (cfg.chain === 'bsc' ? BSC_RPC : ETH_RPC));
    const raw = await provider.getBalance(address);
    const balance = Number(raw) / 1e18;
    return balance;
  } catch (e) {
    logger.warn('hdWallet', 'getNativeBalance failed', { address, error: (e as Error).message });
    return 0;
  }
}

/** Подписать транзакцию вывода (для withdraw) — вызывается только сервером с seed */
export async function signWithdraw(
  userIndex: number,
  toAddress: string,
  amountUsdt: number
): Promise<{ signedTx: string; txHash?: string } | { error: string }> {
  const root = getRootWallet();
  if (!root) return { error: 'HD Wallet not configured' };
  const cfg = getConfig();
  if (!cfg) return { error: 'HD Wallet not configured' };

  try {
    const wallet = root.derivePath(String(userIndex)).connect(
      new JsonRpcProvider(cfg.rpcUrl || (cfg.chain === 'bsc' ? BSC_RPC : ETH_RPC))
    );
    const tokenAddr = cfg.chain === 'bsc' ? USDT_BEP20 : USDT_ERC20;
    const abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)'
    ];
    const { Contract } = await import('ethers');
    const contract = new Contract(tokenAddr, abi, wallet);
    const amountRaw = BigInt(Math.floor(amountUsdt * 10 ** USDT_DECIMALS));

    const tx = await contract.transfer.populateTransaction(toAddress, amountRaw);
    const populated = await wallet.populateTransaction({
      to: tx.to,
      data: tx.data,
      value: 0n
    });
    const signedTx = await wallet.signTransaction(populated);
    return { signedTx };
  } catch (e) {
    logger.error('hdWallet', 'signWithdraw failed', { userIndex, error: (e as Error).message });
    return { error: (e as Error).message };
  }
}

/** Отправить USDT (broadcast signed tx) */
export async function broadcastTx(signedTx: string): Promise<{ txHash: string } | { error: string }> {
  const cfg = getConfig();
  if (!cfg) return { error: 'HD Wallet not configured' };
  try {
    const provider = new JsonRpcProvider(cfg.rpcUrl || (cfg.chain === 'bsc' ? BSC_RPC : ETH_RPC));
    const { ethers } = await import('ethers');
    const tx = ethers.Transaction.from(signedTx);
    const resp = await provider.broadcastTransaction(signedTx);
    return { txHash: resp.hash };
  } catch (e) {
    logger.error('hdWallet', 'broadcastTx failed', { error: (e as Error).message });
    return { error: (e as Error).message };
  }
}
