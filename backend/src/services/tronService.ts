/**
 * Tron Service — TRC20 USDT: адреса из seed, подпись и отправка выводов
 * Tron path: m/44'/195'/0'/0/index
 */

import { TronWeb } from 'tronweb';
import { logger } from '../lib/logger';

const USDT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_DECIMALS = 6; // USDT on Tron uses 6 decimals
const TRONGRID_API = 'https://api.trongrid.io';

export function getTronAddressFromMnemonic(mnemonic: string, index: number): { address: string } | null {
  try {
    const path = `m/44'/195'/0'/0/${index}`;
    const result = TronWeb.fromMnemonic(mnemonic, path) as { address: string; privateKey: string };
    const addr = result?.address;
    if (!addr || typeof addr !== 'string') return null;
    return { address: addr };
  } catch (e) {
    logger.error('tronService', 'getTronAddressFromMnemonic failed', { index, error: (e as Error).message });
    return null;
  }
}

/** Подписать и отправить USDT TRC20 */
export async function signAndSendTrc20Usdt(
  mnemonic: string,
  fromIndex: number,
  toAddress: string,
  amountUsdt: number
): Promise<{ txHash: string } | { error: string }> {
  try {
    const path = `m/44'/195'/0'/0/${fromIndex}`;
    const account = TronWeb.fromMnemonic(mnemonic, path) as { privateKey: string };
    if (!account?.privateKey) return { error: 'Failed to derive Tron key' };

    const tronWeb = new TronWeb({
      fullHost: TRONGRID_API,
      privateKey: account.privateKey
    });

    const amountSun = Math.floor(amountUsdt * 10 ** USDT_DECIMALS);
    const contract = await tronWeb.contract().at(USDT_TRC20);

    const tx = await contract.transfer(toAddress, amountSun).send();
    const txHash = tx ? (typeof tx === 'string' ? tx : (tx as any).transaction?.txID || (tx as any).txID) : '';
    if (!txHash) return { error: 'No tx hash returned' };
    return { txHash };
  } catch (e) {
    logger.error('tronService', 'signAndSendTrc20Usdt failed', { fromIndex, error: (e as Error).message });
    return { error: (e as Error).message };
  }
}
