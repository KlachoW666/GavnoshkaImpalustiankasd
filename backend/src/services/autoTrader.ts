/**
 * Auto-Trader — исполнение ордеров через OKX (флаг + testnet)
 * ROADMAP: полная автоматизация с рисками — только при AUTO_TRADING_EXECUTION_ENABLED и опционально OKX_SANDBOX.
 */

import ccxt, { Exchange } from 'ccxt';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { toOkxCcxtSymbol } from '../lib/symbol';
import { normalizeSymbol } from '../lib/symbol';
import { TradingSignal } from '../types/signal';
import { emotionalFilterInstance } from './emotionalFilter';
import { logger } from '../lib/logger';

function okxProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = getProxy(config.proxyList) || config.proxy;
  if (!proxyUrl || !proxyUrl.startsWith('http')) return undefined;
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

export interface ExecuteOptions {
  /** Доля баланса на позицию (0–100) */
  sizePercent: number;
  /** Плечо */
  leverage: number;
  /** Макс. открытых позиций */
  maxPositions: number;
  /** Использовать testnet (OKX demo) */
  useTestnet?: boolean;
}

export interface ExecuteResult {
  ok: boolean;
  orderId?: string;
  positionSize?: number;
  error?: string;
}

export interface UserOkxCreds {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

function buildExchange(useTestnet: boolean): Exchange {
  const opts: Record<string, unknown> = {
    apiKey: config.okx.apiKey,
    secret: config.okx.secret,
    password: config.okx.passphrase,
    enableRateLimit: true,
    options: {
      defaultType: 'swap',
      sandboxMode: useTestnet
    },
    timeout: config.okx.timeout
  };
  const proxyUrl = getProxy(config.proxyList) || config.proxy;
  if (proxyUrl) (opts as any).httpsProxy = proxyUrl;
  const agent = okxProxyAgent();
  if (agent) (opts as any).agent = agent;
  return new ccxt.okx(opts);
}

function buildExchangeFromCreds(creds: UserOkxCreds, useTestnet: boolean): Exchange {
  const opts: Record<string, unknown> = {
    apiKey: creds.apiKey,
    secret: creds.secret,
    password: creds.passphrase ?? '',
    enableRateLimit: true,
    options: {
      defaultType: 'swap',
      sandboxMode: useTestnet
    },
    timeout: config.okx.timeout
  };
  const proxyUrl = getProxy(config.proxyList) || config.proxy;
  if (proxyUrl) (opts as any).httpsProxy = proxyUrl;
  const agent = okxProxyAgent();
  if (agent) (opts as any).agent = agent;
  return new ccxt.okx(opts);
}

/** Получить доступный баланс (USDT) для маржи */
export async function getTradingBalance(useTestnet: boolean): Promise<number> {
  if (!config.okx.hasCredentials) return 0;
  const exchange = buildExchange(useTestnet);
  try {
    const balance = await exchange.fetchBalance();
    const usdt = (balance as any).USDT ?? balance?.usdt;
    const total = usdt?.total ?? 0;
    const free = usdt?.free ?? total;
    return typeof free === 'number' ? free : 0;
  } catch (e) {
    logger.warn('AutoTrader', 'fetchBalance failed', { error: (e as Error).message });
    return 0;
  }
}

/** Количество открытых позиций (swap) с ненулевым размером */
export async function getOpenPositionsCount(useTestnet: boolean): Promise<number> {
  if (!config.okx.hasCredentials) return 0;
  const exchange = buildExchange(useTestnet);
  try {
    const positions = await exchange.fetchPositions();
    const withSize = positions.filter((p: any) => {
      const contracts = Number(p.contracts ?? p.contractSize ?? 0);
      const size = Number(p.info?.pos ?? p.contracts ?? 0);
      return (contracts !== 0 || size !== 0) && (p.side === 'long' || p.side === 'short');
    });
    return withSize.length;
  } catch (e) {
    logger.warn('AutoTrader', 'fetchPositions failed', { error: (e as Error).message });
    return 0;
  }
}

/**
 * Исполнить сигнал: маркет-ордер + SL/TP (TP1).
 * Проверяет: credentials (сервер или userCreds), emotional filter, max positions, баланс.
 * При передаче userCreds ордер исполняется на счёте пользователя (реальная торговля).
 */
export async function executeSignal(
  signal: TradingSignal,
  options: ExecuteOptions,
  userCreds?: UserOkxCreds | null
): Promise<ExecuteResult> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.okx.hasCredentials) {
    return { ok: false, error: 'OKX credentials not set (настройте ключи в профиле или в .env)' };
  }

  const canOpen = emotionalFilterInstance.canOpenTrade();
  if (!canOpen.allowed) {
    return { ok: false, error: canOpen.reason ?? 'Emotional filter: trading paused' };
  }

  const useTestnet = options.useTestnet ?? config.okx.sandbox;
  const exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);

  let openCount: number;
  let balance: number;
  try {
    const [positionsRes, balanceRes] = await Promise.all([
      exchange.fetchPositions(),
      exchange.fetchBalance()
    ]);
    openCount = positionsRes.filter((p: any) => {
      const sz = Number(p.contracts ?? p.info?.pos ?? 0);
      return sz !== 0 && (p.side === 'long' || p.side === 'short');
    }).length;
    const usdt = (balanceRes as any).USDT ?? balanceRes?.usdt;
    const free = usdt?.free ?? usdt?.total ?? 0;
    balance = typeof free === 'number' ? free : 0;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    logger.warn('AutoTrader', 'executeSignal fetch positions/balance failed', { error: msg });
    return { ok: false, error: msg };
  }

  if (openCount >= options.maxPositions) {
    return { ok: false, error: `Max positions (${options.maxPositions}) reached` };
  }
  if (balance <= 0) {
    return { ok: false, error: 'No balance available' };
  }

  const symbol = normalizeSymbol(signal.symbol);
  const ccxtSymbol = toOkxCcxtSymbol(symbol) || 'BTC/USDT:USDT';
  const entryPrice = signal.entry_price ?? 0;
  const stopLoss = signal.stop_loss ?? 0;
  const takeProfit1 = Array.isArray(signal.take_profit) && signal.take_profit.length
    ? signal.take_profit[0]
    : entryPrice * (signal.direction === 'LONG' ? 1.02 : 0.98);

  const margin = (balance * options.sizePercent) / 100;
  const positionValue = margin * options.leverage;
  const amount = positionValue / entryPrice; // контракты в базе (BTC и т.д.)

  if (amount <= 0 || !Number.isFinite(amount)) {
    return { ok: false, error: 'Invalid position size' };
  }

  try {
    await exchange.setLeverage(options.leverage, ccxtSymbol, { marginMode: 'isolated' });
  } catch (e) {
    logger.warn('AutoTrader', 'setLeverage failed', { symbol: ccxtSymbol, error: (e as Error).message });
  }

  const side = signal.direction === 'LONG' ? 'buy' : 'sell';
  const params: Record<string, unknown> = {
    tdMode: 'isolated'
  };
  if (stopLoss > 0) {
    params.stopLoss = {
      triggerPrice: stopLoss,
      type: 'market'
    };
  }
  if (takeProfit1 > 0 && takeProfit1 !== entryPrice) {
    params.takeProfit = {
      triggerPrice: takeProfit1,
      type: 'market'
    };
  }

  try {
    const order = await exchange.createOrder(
      ccxtSymbol,
      'market',
      side,
      amount,
      undefined,
      params
    );
    const orderId = (order as any).id ?? (order as any).orderId;
    logger.info('AutoTrader', `Order placed: ${signal.symbol} ${signal.direction}`, {
      orderId,
      amount,
      entryPrice: entryPrice,
      useTestnet
    });
    return { ok: true, orderId, positionSize: positionValue };
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    logger.error('AutoTrader', 'createOrder failed', { symbol: signal.symbol, error: errMsg });
    return { ok: false, error: errMsg };
  }
}

/**
 * Список позиций с OKX (для UI).
 */
export async function fetchPositionsForApi(useTestnet: boolean): Promise<Array<{
  symbol: string;
  side: string;
  contracts: number;
  entryPrice: number;
  markPrice?: number;
  unrealizedPnl?: number;
  leverage: number;
}>> {
  if (!config.okx.hasCredentials) return [];
  const exchange = buildExchange(useTestnet);
  try {
    const positions = await exchange.fetchPositions();
    return positions
      .filter((p: any) => {
        const sz = Number(p.contracts ?? p.info?.pos ?? 0);
        return sz !== 0;
      })
      .map((p: any) => ({
        symbol: p.symbol ?? p.info?.instId ?? '',
        side: p.side ?? (Number(p.info?.pos ?? 0) > 0 ? 'long' : 'short'),
        contracts: Number(p.contracts ?? p.info?.pos ?? 0),
        entryPrice: Number(p.entryPrice ?? p.info?.avgPx ?? 0),
        markPrice: p.markPrice != null ? Number(p.markPrice) : undefined,
        unrealizedPnl: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : undefined,
        leverage: Number(p.leverage ?? p.info?.lever ?? 1)
      }));
  } catch (e) {
    logger.warn('AutoTrader', 'fetchPositions failed', { error: (e as Error).message });
    return [];
  }
}

async function fetchBalanceAndPositions(exchange: Exchange): Promise<{ balance: number; positions: any[] }> {
  const [balanceRes, positionsRes] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions()
  ]);
  const usdt = (balanceRes as any).USDT ?? balanceRes?.usdt;
  const total = usdt?.total ?? 0;
  const free = usdt?.free ?? total;
  const balance = typeof free === 'number' ? free : 0;
  const positions = positionsRes
    .filter((p: any) => {
      const sz = Number(p.contracts ?? p.info?.pos ?? 0);
      return sz !== 0;
    })
    .map((p: any) => ({
      symbol: p.symbol ?? p.info?.instId ?? '',
      side: p.side ?? (Number(p.info?.pos ?? 0) > 0 ? 'long' : 'short'),
      contracts: Number(p.contracts ?? p.info?.pos ?? 0),
      entryPrice: Number(p.entryPrice ?? p.info?.avgPx ?? 0),
      markPrice: p.markPrice != null ? Number(p.markPrice) : undefined,
      unrealizedPnl: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : undefined,
      leverage: Number(p.leverage ?? p.info?.lever ?? 1)
    }));
  return { balance, positions };
}

/** Позиции и баланс OKX: при передаче userCreds — ключи пользователя (как в админке), иначе ключи из .env. При таймауте — один повтор с новым прокси. */
export async function getPositionsAndBalanceForApi(
  useTestnet: boolean,
  userCreds?: UserOkxCreds | null
): Promise<{ positions: Array<{ symbol: string; side: string; contracts: number; entryPrice: number; markPrice?: number; unrealizedPnl?: number; leverage: number }>; balance: number; openCount: number; balanceError?: string }> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.okx.hasCredentials) {
    return { positions: [], balance: 0, openCount: 0 };
  }
  let exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { balance, positions } = await fetchBalanceAndPositions(exchange);
      return { positions, balance, openCount: positions.length };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      const isTimeout = /timed out|timeout|ETIMEDOUT/i.test(msg);
      if (isTimeout && attempt === 0) {
        logger.warn('AutoTrader', 'getPositionsAndBalance timeout, retrying with new proxy', { useUserCreds: !!useUserCreds });
        exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
        continue;
      }
      logger.warn('AutoTrader', 'getPositionsAndBalance failed', { error: msg, useUserCreds: !!useUserCreds });
      return { positions: [], balance: 0, openCount: 0, balanceError: msg };
    }
  }
  return { positions: [], balance: 0, openCount: 0, balanceError: 'Request failed after retry' };
}
