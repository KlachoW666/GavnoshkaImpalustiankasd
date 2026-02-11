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

function okxProxyAgent(): InstanceType<typeof HttpsProxyAgent> | undefined {
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
  /** Множитель TP (0.5–1): 0.85 = уже TP, быстрее выход из позиции */
  tpMultiplier?: number;
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

  /** Минимальный баланс для реального счёта: OKX при малой марже часто отклоняет ордера */
  const MIN_BALANCE_REAL = 25;
  if (!useTestnet && balance < MIN_BALANCE_REAL) {
    return {
      ok: false,
      error: `Баланс OKX (Real) слишком мал: $${balance.toFixed(2)}. Для реальной торговли пополните счёт до $${MIN_BALANCE_REAL}+ или переключитесь на «Демо (Testnet)» в настройках.`
    };
  }

  const symbol = normalizeSymbol(signal.symbol);
  const ccxtSymbol = toOkxCcxtSymbol(symbol) || 'BTC/USDT:USDT';
  const entryPrice = signal.entry_price ?? 0;
  const isLong = signal.direction === 'LONG';
  let stopLoss = signal.stop_loss ?? 0;
  let takeProfit1 = Array.isArray(signal.take_profit) && signal.take_profit.length
    ? signal.take_profit[0]
    : entryPrice * (isLong ? 1.02 : 0.98);
  if (isLong) {
    if (stopLoss > 0 && stopLoss >= entryPrice) stopLoss = 0;
    if (takeProfit1 <= entryPrice) takeProfit1 = entryPrice * 1.02;
  } else {
    if (stopLoss > 0 && stopLoss <= entryPrice) stopLoss = entryPrice * 1.005;
    if (takeProfit1 >= entryPrice) takeProfit1 = entryPrice * 0.98;
  }
  const tpMult = Math.max(0.5, Math.min(1, options.tpMultiplier ?? 1));
  if (tpMult < 1) {
    const distance = takeProfit1 - entryPrice;
    takeProfit1 = entryPrice + distance * tpMult;
  }

  // Ограничиваем долю баланса запасом (OKX может отклонять при точном 100% из-за комиссий и маржи)
  const reserveRatio = balance < 50 ? 0.7 : 0.85; // при малом балансе — больший запас
  const maxUsableBalance = balance * reserveRatio;
  const margin = Math.min((balance * options.sizePercent) / 100, maxUsableBalance);
  const positionValue = margin * options.leverage;
  let amount = positionValue / entryPrice; // контракты в базе (BTC и т.д.)

  if (amount <= 0 || !Number.isFinite(amount)) {
    return { ok: false, error: 'Invalid position size' };
  }

  const { minAmount, precision } = getOkxMinAmountAndPrecision(ccxtSymbol);
  amount = roundToPrecision(Math.max(amount, minAmount), precision);
  let requiredMargin = (amount * entryPrice) / options.leverage;
  if (requiredMargin > maxUsableBalance) {
    // Уменьшаем размер под доступную маржу
    const maxMargin = maxUsableBalance;
    const maxAmount = (maxMargin * options.leverage) / entryPrice;
    amount = roundToPrecision(Math.max(minAmount, Math.min(amount, maxAmount)), precision);
    requiredMargin = (amount * entryPrice) / options.leverage;
  }
  if (requiredMargin > balance || amount < minAmount) {
    return {
      ok: false,
      error: `Недостаточно маржи на счёте (доступно ~$${balance.toFixed(2)} USDT, нужно ~$${requiredMargin.toFixed(2)}). Уменьшите «Долю баланса» или пополните счёт.`
    };
  }

  const side = signal.direction === 'LONG' ? 'buy' : 'sell';

  const tryPlaceOrder = async (tdMode: 'isolated' | 'cross') => {
    try {
      await exchange.setLeverage(options.leverage, ccxtSymbol, { marginMode: tdMode });
    } catch (e) {
      logger.warn('AutoTrader', 'setLeverage failed', { symbol: ccxtSymbol, tdMode, error: (e as Error).message });
    }
    const params: Record<string, unknown> = { tdMode };
    if (stopLoss > 0) {
      params.stopLoss = { triggerPrice: stopLoss, type: 'market' };
    }
    if (takeProfit1 > 0 && takeProfit1 !== entryPrice) {
      params.takeProfit = { triggerPrice: takeProfit1, type: 'market' };
    }
    const order = await exchange.createOrder(ccxtSymbol, 'market', side, amount, undefined, params);
    return order;
  };

  try {
    let order: unknown;
    try {
      order = await tryPlaceOrder('cross');
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      const isAccountModeError = /51010|account mode|cannot complete.*account mode/i.test(errMsg);
      if (isAccountModeError) {
        logger.info('AutoTrader', 'Retrying with tdMode=isolated (account mode 51010)', { symbol: signal.symbol });
        order = await tryPlaceOrder('isolated');
      } else {
        throw e;
      }
    }
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
    let userMsg = parseOkxShortError(errMsg) || errMsg;
    if (/insufficient|margin|51020|51119/i.test(errMsg)) {
      userMsg = `Недостаточно маржи на OKX. Уменьшите «Долю баланса» в настройках, закройте часть позиций или пополните счёт USDT.`;
    }
    return { ok: false, error: userMsg };
  }
}

/** Минимальный объём и точность по инструменту OKX (swap). Для всех пар минимум не ниже 0.01 (требование OKX). */
function getOkxMinAmountAndPrecision(ccxtSymbol: string): { minAmount: number; precision: number } {
  const base = (ccxtSymbol.split('/')[0] || '').toUpperCase();
  const byBase: Record<string, { min: number; prec: number }> = {
    BTC: { min: 0.01, prec: 2 },
    ETH: { min: 0.01, prec: 2 },
    SOL: { min: 0.1, prec: 1 },
    DOGE: { min: 1, prec: 0 },
    XRP: { min: 1, prec: 0 },
    OP: { min: 0.1, prec: 1 },
    ARB: { min: 0.1, prec: 1 },
    RIVER: { min: 0.01, prec: 2 }
  };
  const def = { min: 0.01, prec: 2 };
  const v = byBase[base] ?? def;
  const minAmount = Math.max(v.min, 0.01);
  return { minAmount, precision: v.prec };
}

function roundToPrecision(value: number, decimalPlaces: number): number {
  if (decimalPlaces <= 0) return Math.max(1, Math.floor(value));
  const p = 10 ** decimalPlaces;
  return Math.round(value * p) / p;
}

/** Извлечь короткое сообщение из ответа OKX (например sMsg из data[0]) для отображения пользователю */
function parseOkxShortError(errMsg: string): string | null {
  try {
    const m = errMsg.match(/"sMsg"\s*:\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
    const j = errMsg.replace(/^okx\s+/i, '').trim();
    if (j.startsWith('{')) {
      const o = JSON.parse(j) as { msg?: string; data?: Array<{ sMsg?: string }> };
      if (o.data?.[0]?.sMsg) return o.data[0].sMsg;
      if (o.msg) return o.msg;
    }
  } catch {
    // ignore parse errors
  }
  return null;
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
    .map((p: any) => {
      const contracts = Number(p.contracts ?? p.info?.pos ?? 0);
      const entryPrice = Number(p.entryPrice ?? p.info?.avgPx ?? 0);
      const info = p.info ?? {};
      return {
        symbol: p.symbol ?? info?.instId ?? '',
        side: p.side ?? (Number(info?.pos ?? 0) > 0 ? 'long' : 'short'),
        contracts,
        entryPrice,
        notional: contracts * entryPrice,
        markPrice: p.markPrice != null ? Number(p.markPrice) : undefined,
        unrealizedPnl: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : undefined,
        leverage: Number(p.leverage ?? info?.lever ?? 1),
        stopLoss: info?.slTriggerPx != null ? Number(info.slTriggerPx) : undefined,
        takeProfit: info?.tpTriggerPx != null ? Number(info.tpTriggerPx) : undefined
      };
    });
  return { balance, positions };
}

/** Позиции и баланс OKX: при передаче userCreds — ключи пользователя (как в админке), иначе ключи из .env. При таймауте — один повтор с новым прокси. */
export async function getPositionsAndBalanceForApi(
  useTestnet: boolean,
  userCreds?: UserOkxCreds | null
): Promise<{ positions: Array<{ symbol: string; side: string; contracts: number; entryPrice: number; notional?: number; markPrice?: number; unrealizedPnl?: number; leverage: number; stopLoss?: number; takeProfit?: number }>; balance: number; openCount: number; balanceError?: string }> {
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
