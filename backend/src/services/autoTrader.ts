/**
 * Auto-Trader — исполнение ордеров через Bitget (флаг + testnet)
 * Ключи: пользователь (Bitget) или .env BITGET_*.
 */

import ccxt, { Exchange } from 'ccxt';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { listOrders, updateOrderClose, orderExistsWithBitgetOrdId, upsertOrderFromOkx } from '../db';
import { feedOrderToML, feedOkxClosedOrderToML } from './onlineMLService';
import { toOkxCcxtSymbol } from '../lib/symbol';
import { normalizeSymbol } from '../lib/symbol';
import { MIN_TP_DISTANCE_PCT } from '../lib/tradingPrinciples';
import { TradingSignal } from '../types/signal';
import { emotionalFilterInstance } from './emotionalFilter';
import { logger } from '../lib/logger';
import { getPositionSize } from '../lib/positionSizing';

function exchangeProxyAgent(): InstanceType<typeof HttpsProxyAgent> | undefined {
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
  /** Использовать testnet (Bitget demo) */
  useTestnet?: boolean;
  /** Множитель TP (0.5–1): 0.85 = уже TP, быстрее выход из позиции */
  tpMultiplier?: number;
  /** Режим размера: percent = доля баланса; risk = по стопу (riskPct баланса на сделку) */
  sizeMode?: 'percent' | 'risk';
  /** Риск на сделку (0.01–0.03) при sizeMode=risk */
  riskPct?: number;
  /** Sinclair: множитель при высокой волатильности (ATR>1.5×avg). 1 = без уменьшения. */
  volatilityMultiplier?: number;
  /** Мин. Open Interest в USDT — пропустить вход, если ликвидность ниже (0 = не проверять) */
  minOpenInterestUsdt?: number;
}

export interface ExecuteResult {
  ok: boolean;
  orderId?: string;
  positionSize?: number;
  error?: string;
}

export interface UserBitgetCreds {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

function buildBitgetExchange(creds: { apiKey: string; secret: string; passphrase?: string }, useTestnet: boolean): Exchange {
  const opts: Record<string, unknown> = {
    apiKey: creds.apiKey,
    secret: creds.secret,
    password: creds.passphrase ?? '',
    enableRateLimit: true,
    options: {
      defaultType: 'swap',
      fetchMarkets: ['swap']
    },
    timeout: config.bitget.timeout
  };
  if (useTestnet) (opts.options as any).sandboxMode = true;
  const proxyUrl = getProxy(config.proxyList) || config.proxy;
  if (proxyUrl) (opts as any).httpsProxy = proxyUrl;
  const agent = exchangeProxyAgent();
  if (agent) (opts as any).agent = agent;
  return new ccxt.bitget(opts);
}

function buildExchange(useTestnet: boolean): Exchange {
  return buildBitgetExchange(
    {
      apiKey: config.bitget.apiKey,
      secret: config.bitget.secret,
      passphrase: config.bitget.passphrase
    },
    useTestnet
  );
}

function buildExchangeFromCreds(creds: UserBitgetCreds, useTestnet: boolean): Exchange {
  return buildBitgetExchange(creds, useTestnet);
}

/** Получить доступный баланс (USDT) для маржи */
export async function getTradingBalance(useTestnet: boolean): Promise<number> {
  if (!config.bitget.hasCredentials) return 0;
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
  if (!config.bitget.hasCredentials) return 0;
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
  userCreds?: UserBitgetCreds | null
): Promise<ExecuteResult> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.bitget.hasCredentials) {
    return { ok: false, error: 'Bitget credentials not set (настройте ключи в профиле или в .env)' };
  }

  const canOpen = emotionalFilterInstance.canOpenTrade();
  if (!canOpen.allowed) {
    return { ok: false, error: canOpen.reason ?? 'Emotional filter: trading paused' };
  }

  const useTestnet = options.useTestnet ?? config.bitget.sandbox;
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

  /** Минимальный баланс для реального счёта (порог, ниже которого не пробуем открывать) */
  const MIN_BALANCE_REAL = 10;
  if (!useTestnet && balance < MIN_BALANCE_REAL) {
    return {
      ok: false,
      error: `Баланс Bitget (Real) слишком мал: $${balance.toFixed(2)}. Пополните счёт до $${MIN_BALANCE_REAL}+ или используйте «Демо (Testnet)».`
    };
  }

  /** Минимальный объём позиции в USDT (Bitget отклоняет слишком мелкие ордера) */
  const MIN_NOTIONAL_USD = 5;

  const symbol = normalizeSymbol(signal.symbol);
  const ccxtSymbol = toOkxCcxtSymbol(symbol) || 'BTC/USDT:USDT';
  const entryPrice = signal.entry_price ?? 0;

  // Open Interest фильтр (опционально)
  const minOi = options.minOpenInterestUsdt ?? 0;
  if (minOi > 0) {
    try {
      const oiData = await exchange.fetchOpenInterest(ccxtSymbol);
      const oiUsdt = (oiData as any).openInterestValue ?? (oiData as any).value ?? 0;
      if (typeof oiUsdt === 'number' && oiUsdt < minOi) {
        return { ok: false, error: `Open Interest ${oiUsdt.toFixed(0)} USDT ниже порога ${minOi}. Пропуск входа.` };
      }
    } catch (e) {
      logger.warn('AutoTrader', 'fetchOpenInterest failed, skipping OI filter', { symbol: ccxtSymbol, error: (e as Error).message });
    }
  }
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
    const newDistance = distance * tpMult;
    const minAbsDist = entryPrice * MIN_TP_DISTANCE_PCT;
    const newAbsDist = Math.abs(newDistance);
    const useAbsDist = Math.max(newAbsDist, minAbsDist);
    const effectiveDistance = (distance >= 0 ? 1 : -1) * useAbsDist;
    takeProfit1 = entryPrice + effectiveDistance;
    if (newAbsDist < minAbsDist) {
      logger.info('AutoTrader', 'TP ограничен минимумом 0.2% (покрытие комиссии): быстрый выход дал бы цель < комиссии', { symbol: signal.symbol });
    } else {
      logger.info('AutoTrader', 'Быстрый выход: TP уменьшен по множителю', { tpMultiplier: tpMult, symbol: signal.symbol });
    }
  }

  // POSITIONS_AND_ORDERS_ANALYSIS: резерв баланса — пороги вынесены в константы
  const RESERVE_THRESHOLD_SMALL = 50;
  const RESERVE_THRESHOLD_TINY = 20;
  const RESERVE_RATIO_NORMAL = 0.85;
  const RESERVE_RATIO_SMALL = 0.7;
  const MAX_PCT_WHEN_TINY = 0.15;
  const reserveRatio = balance < RESERVE_THRESHOLD_SMALL ? RESERVE_RATIO_SMALL : RESERVE_RATIO_NORMAL;
  let maxUsableBalance = balance * reserveRatio;
  if (balance < RESERVE_THRESHOLD_TINY) {
    maxUsableBalance = Math.min(maxUsableBalance, balance * MAX_PCT_WHEN_TINY);
  }
  let margin: number;
  let positionValue: number;
  const volMult = typeof options.volatilityMultiplier === 'number' && options.volatilityMultiplier > 0 && options.volatilityMultiplier <= 1
    ? options.volatilityMultiplier
    : 1;
  if (options.sizeMode === 'risk' && stopLoss > 0) {
    const riskPct = Math.max(0.01, Math.min(0.03, options.riskPct ?? 0.02));
    let sizeUsd = getPositionSize(balance, entryPrice, stopLoss, { riskPct, fallbackPct: options.sizePercent / 100 });
    sizeUsd *= volMult;
    const limitedSize = Math.min(sizeUsd, maxUsableBalance * options.leverage);
    positionValue = Math.min(limitedSize, balance * 0.25 * options.leverage);
    margin = positionValue / options.leverage;
  } else {
    margin = Math.min((balance * options.sizePercent) / 100 * volMult, maxUsableBalance);
    positionValue = margin * options.leverage;
  }
  // Bitget не принимает слишком мелкие ордера — не менее MIN_NOTIONAL_USD
  if (positionValue < MIN_NOTIONAL_USD) {
    const needMargin = MIN_NOTIONAL_USD / options.leverage;
    if (needMargin <= maxUsableBalance) {
      margin = needMargin;
      positionValue = MIN_NOTIONAL_USD;
    } else {
      return {
        ok: false,
        error: `Размер позиции меньше минимума Bitget (~$${MIN_NOTIONAL_USD} объём). Нужна маржа ~$${needMargin.toFixed(2)}. Пополните счёт или переключитесь на Демо.`
      };
    }
  }
  let amount = positionValue / entryPrice; // контракты в базе (BTC и т.д.)

  if (amount <= 0 || !Number.isFinite(amount)) {
    return { ok: false, error: 'Invalid position size' };
  }

  const { minAmount, precision } = getBitgetMinAmountAndPrecision(ccxtSymbol);
  amount = roundToPrecision(Math.max(amount, minAmount), precision);
  const notional = amount * entryPrice;
  // Фактический объём не должен быть ниже минимума Bitget
  let requiredMargin = notional / options.leverage;
  if (notional < MIN_NOTIONAL_USD && requiredMargin <= maxUsableBalance) {
    const minAmountForNotional = MIN_NOTIONAL_USD / entryPrice;
    amount = roundToPrecision(Math.max(amount, minAmountForNotional), precision);
    requiredMargin = (amount * entryPrice) / options.leverage;
    positionValue = amount * entryPrice;
  }
  if (requiredMargin > maxUsableBalance) {
    const maxMargin = maxUsableBalance;
    const maxAmount = (maxMargin * options.leverage) / entryPrice;
    amount = roundToPrecision(Math.max(minAmount, Math.min(amount, maxAmount)), precision);
    requiredMargin = (amount * entryPrice) / options.leverage;
    positionValue = amount * entryPrice;
  }
  if (requiredMargin > balance || amount < minAmount) {
    return {
      ok: false,
      error: `Недостаточно маржи на счёте (доступно ~$${balance.toFixed(2)} USDT, нужно ~$${requiredMargin.toFixed(2)}). Уменьшите «Долю баланса» или пополните счёт.`
    };
  }
  if (amount * entryPrice < MIN_NOTIONAL_USD) {
    return {
      ok: false,
      error: `Объём позиции получился меньше минимума Bitget (~$${MIN_NOTIONAL_USD}). Пополните счёт или увеличьте «Долю баланса».`
    };
  }

  const side = signal.direction === 'LONG' ? 'buy' : 'sell';
  let posSide: string = signal.direction === 'LONG' ? 'long' : 'short';

  /** oneWayMode: для Bitget в режиме unilateral (one-way) — не передаём posSide, используем side buy_single/sell_single */
  const tryPlaceOrder = async (tdMode: 'isolated' | 'cross', oneWayMode?: boolean) => {
    try {
      await exchange.setLeverage(options.leverage, ccxtSymbol, { marginMode: tdMode });
    } catch (e) {
      logger.warn('AutoTrader', 'setLeverage failed', { symbol: ccxtSymbol, tdMode, error: (e as Error).message });
    }
    const isBitget = (exchange as any).id === 'bitget';
    const params: Record<string, unknown> = { tdMode };
    let orderSide = side;
    if (oneWayMode && isBitget) {
      orderSide = signal.direction === 'LONG' ? 'buy_single' : 'sell_single';
      params.side = orderSide;
    } else {
      params.posSide = posSide;
    }
    if (stopLoss > 0) {
      params.stopLoss = { triggerPrice: stopLoss, type: 'market' };
    }
    if (takeProfit1 > 0 && takeProfit1 !== entryPrice) {
      params.takeProfit = { triggerPrice: takeProfit1, type: 'market' };
    }
    const order = await exchange.createOrder(ccxtSymbol, 'market', orderSide, amount, undefined, params);
    return order;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    let order: unknown;
    try {
      order = await tryPlaceOrder('cross');
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      const isAccountModeError = /51010|account mode|cannot complete.*account mode/i.test(errMsg);
      const isTimestampExpired = /50102|Timestamp request expired|timestamp expired/i.test(errMsg);
      const isPosSideError = /51000.*posSide|Parameter posSide/i.test(errMsg);
      const isBitgetUnilateral = /40774|unilateral position must also be the unilateral|side mismatch/i.test(errMsg);
      if (isBitgetUnilateral) {
        logger.info('AutoTrader', 'Retrying with Bitget one-way mode (buy_single/sell_single)', { symbol: signal.symbol });
        try {
          order = await tryPlaceOrder('cross', true);
        } catch (e2: any) {
          const errMsg2 = e2?.message ?? String(e2);
          if (/51010|account mode/i.test(errMsg2)) {
            logger.info('AutoTrader', 'Retrying Bitget one-way + tdMode=isolated', { symbol: signal.symbol });
            order = await tryPlaceOrder('isolated', true);
          } else {
            throw e2;
          }
        }
      } else if (isPosSideError) {
        posSide = 'net';
        logger.info('AutoTrader', 'Retrying with posSide=net (account in net/one-way mode)', { symbol: signal.symbol });
        try {
          order = await tryPlaceOrder('cross');
        } catch (e2: any) {
          const errMsg2 = e2?.message ?? String(e2);
          if (/51010|account mode/i.test(errMsg2)) {
            logger.info('AutoTrader', 'Retrying with posSide=net + tdMode=isolated', { symbol: signal.symbol });
            order = await tryPlaceOrder('isolated');
          } else if (/40774|unilateral|side mismatch/i.test(errMsg2)) {
            logger.info('AutoTrader', 'Retrying with Bitget one-way mode (buy_single/sell_single)', { symbol: signal.symbol });
            order = await tryPlaceOrder('cross', true);
          } else {
            throw e2;
          }
        }
      } else if (isAccountModeError) {
        logger.info('AutoTrader', 'Retrying with tdMode=isolated (account mode 51010)', { symbol: signal.symbol });
        try {
          order = await tryPlaceOrder('isolated');
        } catch (e2: any) {
          const errMsg2 = e2?.message ?? String(e2);
          if (/51000.*posSide|Parameter posSide/i.test(errMsg2)) {
            posSide = 'net';
            logger.info('AutoTrader', 'Retrying with posSide=net + tdMode=isolated', { symbol: signal.symbol });
            order = await tryPlaceOrder('isolated');
          } else {
            throw e2;
          }
        }
      } else if (isTimestampExpired) {
        logger.info('AutoTrader', '50102 Timestamp expired, retrying createOrder after 2s (sync server clock: timedatectl set-ntp true)', { symbol: signal.symbol });
        await sleep(2000);
        order = await tryPlaceOrder('cross');
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
    let userMsg = parseBitgetShortError(errMsg) || errMsg;
    if (/40774|unilateral position must also be the unilateral|side mismatch/i.test(errMsg)) {
      userMsg = `Bitget: режим позиции (40774/side mismatch). Убедитесь, что на бирже выбран режим One-way или перезапустите сервер после обновления.`;
    } else if (/insufficient|margin|51008|51020|51119/i.test(errMsg)) {
      userMsg = `Недостаточно маржи на Bitget. Пополните счёт USDT, закройте часть позиций или уменьшите «Долю баланса» в настройках.`;
    } else if (/50102|Timestamp request expired|timestamp expired/i.test(errMsg)) {
      userMsg = `Bitget: время сервера рассинхронизировано. На сервере выполните: timedatectl set-ntp true (или ntpdate -s time.nist.gov).`;
    }
    return { ok: false, error: userMsg };
  }
}

/** Минимальный объём и точность по инструменту Bitget (swap). Для всех пар минимум не ниже 0.01. */
function getBitgetMinAmountAndPrecision(ccxtSymbol: string): { minAmount: number; precision: number } {
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

/** Извлечь короткое сообщение из ответа Bitget (например sMsg из data[0]) для отображения пользователю */
function parseBitgetShortError(errMsg: string): string | null {
  try {
    const m = errMsg.match(/"sMsg"\s*:\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
    const j = errMsg.replace(/^bitget\s+/i, '').trim();
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
 * Синхронизация закрытых ордеров с Bitget: для каждого открытого в БД ордера с id okx-* или bitget-* проверяем статус на Bitget;
 * если ордер закрыт — обновляем close_price, pnl, close_time в БД.
 */
export async function syncClosedOrdersFromBitget(
  useTestnet: boolean,
  userCreds?: UserBitgetCreds | null,
  clientId?: string | null
): Promise<{ synced: number }> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.bitget.hasCredentials) return { synced: 0 };
  const openOrders = listOrders({ status: 'open', clientId: clientId ?? undefined, limit: 200 });
  const exchangeOrders = openOrders.filter((o) => o.id && (String(o.id).startsWith('okx-') || String(o.id).startsWith('bitget-')));
  if (exchangeOrders.length === 0) return { synced: 0 };
  const exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
  let synced = 0;
  for (const row of exchangeOrders) {
    const parts = String(row.id).split('-');
    if (parts.length < 3) continue;
    const exchangeOrderId = parts.slice(1, -1).join('-');
    const ccxtSymbol = toOkxCcxtSymbol(row.pair) || row.pair.replace('-', '/') + ':USDT';
    try {
      const exOrder = await exchange.fetchOrder(exchangeOrderId, ccxtSymbol);
      const status = (exOrder as any).status ?? '';
      if (status !== 'closed' && status !== 'filled' && status !== 'canceled') continue;
      const closePrice = Number((exOrder as any).average ?? (exOrder as any).price ?? row.open_price) || row.open_price;
      const openPrice = row.open_price || closePrice;
      const size = row.size || 0;
      let pnl = 0;
      const info = (exOrder as any).info ?? {};
      if (typeof info.realizedPnl === 'number') pnl = info.realizedPnl;
      else if (size > 0 && openPrice > 0)
        pnl = row.direction === 'LONG'
          ? ((closePrice - openPrice) / openPrice) * size
          : ((openPrice - closePrice) / openPrice) * size;
      const pnlPercent = openPrice > 0
        ? (row.direction === 'LONG' ? (closePrice - openPrice) / openPrice : (openPrice - closePrice) / openPrice) * 100
        : 0;
      const closeTime = (exOrder as any).datetime
        ? new Date((exOrder as any).datetime).toISOString()
        : (info.uTime ? new Date(Number(info.uTime)).toISOString() : new Date().toISOString());
      updateOrderClose({
        id: row.id,
        closePrice,
        pnl,
        pnlPercent,
        closeTime
      });
      feedOrderToML(row, pnl);
      synced++;
      logger.info('AutoTrader', 'Synced closed order from Bitget', { id: row.id, pair: row.pair, pnl });
    } catch (e) {
      logger.debug('AutoTrader', 'fetchOrder skip', { id: row.id, error: (e as Error).message });
    }
  }
  return { synced };
}

const SYMBOLS_FOR_ML_SYNC = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'MATIC-USDT', 'ADA-USDT', 'DOT-USDT', 'AVAX-USDT', 'UNI-USDT', 'LINK-USDT', 'LTC-USDT', 'ATOM-USDT', 'NEAR-USDT', 'APT-USDT', 'ARB-USDT', 'OP-USDT', 'SUI-USDT', 'PEPE-USDT'];

/**
 * Подтягивание ВСЕХ закрытых ордеров с Bitget в БД — ордера, открытые/закрытые на бирже (в т.ч. вручную),
 * чтобы история на сайте совпадала с Bitget.
 */
export async function pullClosedOrdersFromBitget(
  useTestnet: boolean,
  userCreds: UserBitgetCreds | null,
  clientId: string
): Promise<{ pulled: number }> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.bitget.hasCredentials) return { pulled: 0 };
  const exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
  const since = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 дней
  let pulled = 0;
  try {
    for (const sym of SYMBOLS_FOR_ML_SYNC) {
      const ccxtSym = toOkxCcxtSymbol(sym) || `${sym.replace('-', '/')}:USDT`;
      try {
        const orders = await exchange.fetchClosedOrders(ccxtSym, since, 100);
        for (const o of orders) {
          const info = (o as any).info ?? {};
          const ordId = String(o.id ?? info.ordId ?? info.clOrdId ?? '');
          if (!ordId) continue;
          if (orderExistsWithBitgetOrdId(ordId, clientId)) continue; // уже в БД
          const dbId = `bitget-${ordId}-${clientId}`;
          const pnl = Number(info.realizedPnl ?? info.pnl ?? 0);
          const avgPx = Number((o as any).average ?? info.avgPx ?? o.price ?? 0);
          const filled = Number((o as any).filled ?? info.fillSz ?? 0);
          const side = String((o as any).side ?? info.side ?? 'buy').toLowerCase();
          const posSide = String(info.posSide ?? '').toLowerCase();
          const direction = posSide === 'long' ? 'LONG' : posSide === 'short' ? 'SHORT' : (side === 'sell' ? 'SHORT' : 'LONG');
          const pair = normalizeSymbol((o.symbol ?? sym).replace(/\/.*|:.*/, '').replace('/', '-') + '-USDT') || sym;
          const sizeUsdt = filled > 0 && avgPx > 0 ? filled * avgPx : 0;
          if (sizeUsdt <= 0) continue;
          const closeTime = (o.datetime ? new Date(o.datetime) : info.uTime ? new Date(Number(info.uTime)) : new Date()).toISOString();
          const openPrice = avgPx;
          const closePrice = avgPx;
          const pnlPercent = sizeUsdt > 0 && Number.isFinite(pnl)
            ? (pnl / sizeUsdt) * 100
            : 0;
          upsertOrderFromOkx({
            id: dbId,
            clientId,
            pair,
            direction,
            size: sizeUsdt,
            leverage: 1,
            openPrice,
            closePrice,
            pnl: Number.isFinite(pnl) ? pnl : 0,
            pnlPercent,
            openTime: closeTime, // у close-order нет openTime — используем close
            closeTime,
            status: 'closed',
            autoOpened: false
          });
          pulled++;
        }
      } catch (e) {
        logger.debug('AutoTrader', 'pullClosedOrders fetch skip', { symbol: sym, error: (e as Error).message });
      }
    }
    if (pulled > 0) logger.info('AutoTrader', 'Pulled closed orders from Bitget', { clientId, pulled });
  } catch (e) {
    logger.warn('AutoTrader', 'pullClosedOrdersFromBitget failed', { error: (e as Error).message });
  }
  return { pulled };
}

/**
 * Подгрузка закрытых ордеров с Bitget для обучения ML.
 * Вызывается из bitgetSyncCron. Использует ключи пользователя или глобальные из .env.
 */
export async function syncBitgetClosedOrdersForML(
  userCreds?: UserBitgetCreds | null,
  userId?: string | null
): Promise<{ fed: number }> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.bitget.hasCredentials) return { fed: 0 };
  const exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, false) : buildExchange(false);
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000; // последние 7 дней
  let fed = 0;
  try {
    for (const sym of SYMBOLS_FOR_ML_SYNC) {
      const ccxtSym = toOkxCcxtSymbol(sym) || `${sym.replace('-', '/')}:USDT`;
      try {
        const orders = await exchange.fetchClosedOrders(ccxtSym, since, 30);
        for (const o of orders) {
          const info = (o as any).info ?? {};
          const pnl = Number(info.realizedPnl ?? info.pnl ?? 0);
          if (!Number.isFinite(pnl)) continue;
          const orderId = (o.id ?? info.ordId ?? info.clOrdId ?? '') + (userId ? `-${userId}` : '');
          if (!orderId) continue;
          const mlId = `bitget-ml-${orderId}`;
          const side = String((o as any).side ?? info.side ?? 'buy').toLowerCase();
          feedOkxClosedOrderToML({
            id: mlId,
            symbol: (o as any).symbol ?? sym,
            side,
            pnl,
            average: Number((o as any).average ?? info.avgPx ?? 0),
            price: Number((o as any).price ?? info.px ?? 0)
          });
          fed++;
        }
      } catch (e) {
        logger.debug('AutoTrader', 'fetchClosedOrders for ML skip', { symbol: sym, error: (e as Error).message });
      }
    }
    if (fed > 0) logger.info('AutoTrader', `Bitget ML sync: fed ${fed} closed orders`);
  } catch (e) {
    logger.warn('AutoTrader', 'syncBitgetClosedOrdersForML failed', { error: (e as Error).message });
  }
  return { fed };
}

/**
 * Список позиций с Bitget (для UI).
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
  if (!config.bitget.hasCredentials) return [];
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
  const [balanceSettled, positionsSettled] = await Promise.allSettled([
    exchange.fetchBalance(),
    exchange.fetchPositions()
  ]);
  const balanceRes = balanceSettled.status === 'fulfilled' ? balanceSettled.value : {};
  const positionsRes: any[] = positionsSettled.status === 'fulfilled' ? (positionsSettled.value || []) : [];
  if (balanceSettled.status === 'rejected') {
    logger.debug('AutoTrader', 'fetchBalance failed (positions may be ok)', { error: (balanceSettled.reason as Error)?.message });
  }
  const usdt = (balanceRes as any)?.USDT ?? (balanceRes as any)?.usdt;
  const total = usdt?.total ?? 0;
  const free = usdt?.free ?? total;
  /** total = equity (вся стоимость), free = доступно. Показываем total — пользователь ожидает полный баланс. */
  const balance = typeof total === 'number' && total > 0 ? total : (typeof free === 'number' ? free : 0);
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

const BITGET_TIMESTAMP_EXPIRED = /50102|Timestamp request expired/i;

/** Сообщение для пользователя при ошибке времени Bitget: ордера могут исполняться, баланс не показывается. */
function formatTimestampExpiredMessage(raw: string): string {
  return `${raw} Исполнение ордеров при этом может работать. Синхронизируйте время на сервере с интернетом (NTP).`;
}

/** Позиции и баланс Bitget: при передаче userCreds — ключи пользователя (как в админке), иначе ключи из .env. При таймауте — один повтор с новым прокси. */
export async function getPositionsAndBalanceForApi(
  useTestnet: boolean,
  userCreds?: UserBitgetCreds | null
): Promise<{ positions: Array<{ symbol: string; side: string; contracts: number; entryPrice: number; notional?: number; markPrice?: number; unrealizedPnl?: number; leverage: number; stopLoss?: number; takeProfit?: number }>; balance: number; openCount: number; balanceError?: string }> {
  const useUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  if (!useUserCreds && !config.bitget.hasCredentials) {
    return { positions: [], balance: 0, openCount: 0 };
  }
  let exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        const isTimestampRetry = BITGET_TIMESTAMP_EXPIRED.test(lastError || '');
        const isTimeout = /timed out|timeout|ETIMEDOUT/i.test(lastError || '');
        const delayMs = isTimestampRetry ? 2000 : (isTimeout ? 2500 : 0); // таймаут — пауза перед сменой прокси
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        exchange = useUserCreds ? buildExchangeFromCreds(userCreds!, useTestnet) : buildExchange(useTestnet);
      }
      const { balance, positions } = await fetchBalanceAndPositions(exchange);
      return { positions, balance, openCount: positions.length };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      lastError = msg;
      const isTimeout = /timed out|timeout|ETIMEDOUT/i.test(msg);
      const isTimestampExpired = BITGET_TIMESTAMP_EXPIRED.test(msg);
      if (isTimeout && attempt < 2) {
        logger.warn('AutoTrader', 'getPositionsAndBalance timeout, retrying with new proxy after 2.5s', { attempt: attempt + 1, useUserCreds: !!useUserCreds });
        continue;
      }
      if (isTimestampExpired && attempt < 2) {
        logger.warn('AutoTrader', 'getPositionsAndBalance 50102 Timestamp expired, retrying after 2s', { useUserCreds: !!useUserCreds });
        continue;
      }
      logger.warn('AutoTrader', 'getPositionsAndBalance failed', { error: msg, useUserCreds: !!useUserCreds });
      const balanceError = isTimestampExpired ? formatTimestampExpiredMessage(msg) : msg;
      return { positions: [], balance: 0, openCount: 0, balanceError };
    }
  }
  const balanceError = lastError && BITGET_TIMESTAMP_EXPIRED.test(lastError)
    ? formatTimestampExpiredMessage(lastError)
    : (lastError || 'Request failed after retry');
  return { positions: [], balance: 0, openCount: 0, balanceError };
}
