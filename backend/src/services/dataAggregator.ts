import ccxt, { Exchange } from 'ccxt';
import { OHLCVCandle } from '../types/candle';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { getMarketDataCache, setMarketDataCache } from '../db';
import { toOkxCcxtSymbol, toBinanceCcxtSymbol, toMassiveTicker } from '../lib/symbol';
import { computeDensity } from './marketDensity';
import { getAggs, getOrderBookFromSnapshot, getCryptoSnapshotTicker } from './massiveClient';
import { getOrderBookFromStream } from './bitgetOrderBookStream';
import { getCandlesFromStream, getTickerFromStream } from './bitgetMarketStream';
import { logger } from '../lib/logger';
import { TtlCache } from '../lib/ttlCache';
import { acquire as bitgetRateLimitAcquire, setMaxPerSecond as setBitgetRateLimit } from '../lib/bitgetRateLimiter';

/**
 * Data Aggregator — источник рыночных данных для анализа.
 * При useBinanceForMarketData: только Binance REST (свечи, стакан, тикер).
 * Иначе: Massive (если включён) с fallback на Bitget.
 * TTL кэша из config.marketDataCacheTtl.
 */
const ohlcvInFlight = new Map<string, Promise<OHLCVCandle[]>>();
const obInFlight = new Map<string, Promise<{ bids: [number, number][]; asks: [number, number][] }>>();
/** После 403/429 от Massive не обращаться к нему до этой метки (мс), использовать только Bitget */
let massiveBackoffUntil = 0;
const MASSIVE_BACKOFF_MS = 10 * 60 * 1000; // 10 мин
/** Троттлинг логов при недоступности Bitget (сеть/блокировка): не чаще раза в минуту */
let lastBitgetNetworkErrorLogAt = 0;
let bitgetNetworkErrorCount = 0;
const BITGET_NETWORK_ERROR_LOG_INTERVAL_MS = 60 * 1000;
/** Троттлинг логов при недоступности Binance (fapi.binance.com fetch failed): не чаще раза в минуту */
let lastBinanceNetworkErrorLogAt = 0;
let binanceNetworkErrorCount = 0;
const BINANCE_NETWORK_ERROR_LOG_INTERVAL_MS = 60 * 1000;
/** Допустимые значения depth для Binance fapi/v1/depth: только эти. */
const BINANCE_ORDERBOOK_LIMITS = [5, 10, 20, 50, 100, 500, 1000];

function clampToBinanceOrderBookLimit(limit: number): number {
  const valid = BINANCE_ORDERBOOK_LIMITS.filter((v) => v <= limit);
  return valid.length > 0 ? valid[valid.length - 1]! : BINANCE_ORDERBOOK_LIMITS[0]!;
}

export class DataAggregator {
  private exchange: Exchange;
  private ohlcvCache = new TtlCache<OHLCVCandle[]>(15_000);
  private obCache = new TtlCache<{ bids: [number, number][]; asks: [number, number][] }>(
    config.marketDataCacheTtl?.orderbook ?? 5_000
  );
  private priceCache = new TtlCache<number>(
    config.marketDataCacheTtl?.orderbook ?? 10_000
  );
  private tradesCache = new TtlCache<any[]>(10_000);

  private createExchange(proxyUrl?: string): Exchange {
    const { bitget } = config;
    const url = proxyUrl ?? getProxy(config.proxyList) ?? config.proxy ?? '';
    const opts: Record<string, unknown> = {
      apiKey: bitget.hasCredentials ? bitget.apiKey : undefined,
      secret: bitget.hasCredentials ? bitget.secret : undefined,
      password: bitget.hasCredentials && bitget.passphrase ? bitget.passphrase : undefined,
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
        fetchMarkets: ['swap'],
        fetchCurrencies: false
      },
      timeout: bitget.timeout
    };
    if (url) opts.httpsProxy = url;
    return new ccxt.bitget(opts);
  }

  private createBinanceExchange(proxyUrl?: string): Exchange {
    const { binance } = config;
    const url = proxyUrl ?? getProxy(config.proxyList) ?? config.proxy ?? '';
    const opts: Record<string, unknown> = {
      apiKey: binance.hasCredentials ? binance.apiKey : undefined,
      secret: binance.hasCredentials ? binance.secret : undefined,
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
        /** Binance ccxt: только linear = USDT-M фьючерсы (не spot). */
        fetchMarkets: { types: ['linear'] },
        fetchCurrencies: false
      },
      timeout: binance.timeout
    };
    if (url) opts.httpsProxy = url;
    return new ccxt.binance(opts);
  }

  constructor() {
    if (config.useBinanceForMarketData) {
      this.exchange = this.createBinanceExchange();
      const proxyUrl = getProxy(config.proxyList) || config.proxy || '';
      logger.info('DataAggregator', `Market data: Binance only${config.binance.hasCredentials ? ' (keys set)' : ' (public)'}${proxyUrl ? ' [proxy]' : ''}`);
    } else {
      this.exchange = this.createExchange();
      setBitgetRateLimit(config.bitget.rateLimitPerSecond);
      const proxyUrl = getProxy(config.proxyList) || config.proxy || '';
      if (config.useMassiveForMarketData) {
        const base = (config.massive.baseUrl || 'https://api.massive.com').replace(/\/$/, '');
        logger.info('DataAggregator', `Market data: Massive.com base=${base} apiKey=${config.massive.apiKey ? 'set' : 'MISSING'} (${config.massive.rateLimitPerSecond}/s); fallback Bitget rate=${config.bitget.rateLimitPerSecond}/s`);
      } else {
        logger.info('DataAggregator', `Bitget: public${config.bitget.hasCredentials ? ' + trading' : ''}${proxyUrl ? ' [proxy]' : ''} rate=${config.bitget.rateLimitPerSecond}/s`);
      }
    }
  }

  /**
   * Получает все доступные USDT-M фьючерсы (active && linear && quote === USDT)
   */
  async getAvailableSymbols(): Promise<string[]> {
    try {
      await this.exchange.loadMarkets();
      const markets = Object.values(this.exchange.markets);
      const symbols = markets
        .filter((m) => m !== undefined && m.active && m.linear && m.quote === 'USDT')
        .map((m) => m.symbol);

      logger.info('DataAggregator', `Fetched ${symbols.length} active USDT-M futures pairs`);
      return symbols;
    } catch (err) {
      logger.error('DataAggregator', 'Failed to fetch available symbols', { error: (err as Error).message });
      return ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT']; // Safe fallback
    }
  }

  private isTimeout(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /timed out|timeout|ETIMEDOUT/i.test(msg);
  }

  /** Сетевая ошибка Bitget (api.bitget.com недоступен — блокировка или нет сети). Нужен PROXY_LIST. */
  private isBitgetNetworkError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(msg);
  }

  /** Сетевая ошибка Binance (fapi.binance.com недоступен — блокировка или прокси). */
  private isBinanceNetworkError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /fetch failed|exchangeInfo|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(msg);
  }

  private logBinanceNetworkErrorOnce(context: string): void {
    binanceNetworkErrorCount++;
    const now = Date.now();
    if (now - lastBinanceNetworkErrorLogAt >= BINANCE_NETWORK_ERROR_LOG_INTERVAL_MS) {
      logger.warn('DataAggregator', `Binance unreachable (${binanceNetworkErrorCount} errors). Проверьте PROXY_LIST в .env — fapi.binance.com может быть заблокирован в регионе.`, { context });
      lastBinanceNetworkErrorLogAt = now;
      binanceNetworkErrorCount = 0;
    }
  }

  private logBitgetNetworkErrorOnce(context: string): void {
    bitgetNetworkErrorCount++;
    const now = Date.now();
    if (now - lastBitgetNetworkErrorLogAt >= BITGET_NETWORK_ERROR_LOG_INTERVAL_MS) {
      logger.warn('DataAggregator', `Bitget unreachable (${bitgetNetworkErrorCount} errors). Set PROXY_LIST in .env if api.bitget.com is blocked.`, { context });
      lastBitgetNetworkErrorLogAt = now;
      bitgetNetworkErrorCount = 0;
    }
  }

  /** 401 Unknown API Key, 403 NOT_AUTHORIZED (plan) или 429 rate limit — fallback на Bitget */
  private isMassivePlanLimitOrRateLimit(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /Massive API (401|403|429)|Unknown API Key|NOT_AUTHORIZED|exceeded the maximum requests/i.test(msg);
  }

  getExchangeIds(): string[] {
    return config.useBinanceForMarketData ? ['binance'] : ['bitget'];
  }

  private toCcxtSymbol(symbol: string): string {
    const s = config.useBinanceForMarketData ? toBinanceCcxtSymbol(symbol) : toOkxCcxtSymbol(symbol);
    return s || 'BTC/USDT:USDT';
  }

  async getOHLCV(symbol: string, timeframe = '15m', limit = 100, _exchangeId?: string): Promise<OHLCVCandle[]> {
    return this.getOHLCVByExchange(symbol, timeframe, limit);
  }

  async getOHLCVByExchange(symbol: string, timeframe: string, limit: number): Promise<OHLCVCandle[]> {
    const cacheKey = `${symbol}:${timeframe}:${limit}`;
    const cached = this.ohlcvCache.get(cacheKey);
    if (cached) return cached;

    const dataType = `candles_${timeframe}_${limit}`;
    const ttlKey = `candles_${timeframe}` as keyof typeof config.marketDataCacheTtl;
    const ttlMs = (config.marketDataCacheTtl && ttlKey in config.marketDataCacheTtl ? config.marketDataCacheTtl[ttlKey] : 60_000) as number;

    if (!config.useBinanceForMarketData) {
      const fromStream = getCandlesFromStream(symbol, timeframe, ttlMs);
      const minCandlesFromStream = 50;
      if (fromStream && fromStream.length >= Math.min(limit, minCandlesFromStream)) {
        const candles = fromStream.slice(-limit);
        this.ohlcvCache.set(cacheKey, candles);
        setMarketDataCache(symbol, dataType, candles);
        return candles;
      }
    }

    const fromDb = getMarketDataCache(symbol, dataType, ttlMs);
    if (fromDb?.data && Array.isArray(fromDb.data) && fromDb.data.length > 0) {
      const candles = fromDb.data as OHLCVCandle[];
      if (candles.every((c) => typeof c?.timestamp === 'number' && typeof c?.close === 'number')) {
        this.ohlcvCache.set(cacheKey, candles);
        return candles;
      }
    }

    let promise = ohlcvInFlight.get(cacheKey);
    if (promise) return promise;

    promise = (async (): Promise<OHLCVCandle[]> => {
      if (config.useBinanceForMarketData) {
        const ccxtSymbol = this.toCcxtSymbol(symbol);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const data = await this.exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
            if (data?.length) {
              const candles = data.map((row) => ({
                timestamp: Number(row[0]),
                open: Number(row[1]),
                high: Number(row[2]),
                low: Number(row[3]),
                close: Number(row[4]),
                volume: Number(row[5] ?? 0)
              }));
              this.ohlcvCache.set(cacheKey, candles);
              setMarketDataCache(symbol, dataType, candles);
              return candles;
            }
          } catch (e) {
            const msg = (e as Error).message;
            if (this.isBinanceNetworkError(e)) this.logBinanceNetworkErrorOnce('OHLCV');
            else if (/does not have market symbol/i.test(msg)) logger.debug('DataAggregator', 'Binance: symbol not listed', { symbol });
            else logger.warn('DataAggregator', 'Binance OHLCV fetch failed', { symbol, attempt: attempt + 1, error: msg });
            if (this.isTimeout(e) && attempt === 0) {
              this.exchange = this.createBinanceExchange();
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            return this.getMockCandles(symbol, timeframe, limit);
          }
          break;
        }
        return this.getMockCandles(symbol, timeframe, limit);
      }

      let useBitget = !config.useMassiveForMarketData || Date.now() < massiveBackoffUntil;
      if (config.useMassiveForMarketData && !useBitget) {
        try {
          const ticker = toMassiveTicker(symbol);
          const toMs = Date.now();
          const tfMs = this.timeframeToMs(timeframe);
          const fromMs = toMs - limit * tfMs;
          const data = await getAggs(ticker, timeframe, fromMs, toMs, limit);
          if (data?.length) {
            const candles = data.slice(-limit);
            this.ohlcvCache.set(cacheKey, candles);
            setMarketDataCache(symbol, dataType, candles);
            return candles;
          }
        } catch (e) {
          if (this.isMassivePlanLimitOrRateLimit(e)) {
            massiveBackoffUntil = Date.now() + MASSIVE_BACKOFF_MS;
            useBitget = true;
          } else {
            return this.getMockCandles(symbol, timeframe, limit);
          }
        }
      }
      if (useBitget) {
        const ccxtSymbol = this.toCcxtSymbol(symbol);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await bitgetRateLimitAcquire();
            const data = await this.exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
            if (data?.length) {
              const candles = data.map((row) => ({
                timestamp: Number(row[0]),
                open: Number(row[1]),
                high: Number(row[2]),
                low: Number(row[3]),
                close: Number(row[4]),
                volume: Number(row[5] ?? 0)
              }));
              this.ohlcvCache.set(cacheKey, candles);
              setMarketDataCache(symbol, dataType, candles);
              return candles;
            }
          } catch (e) {
            const msg = (e as Error).message;
            if (this.isBitgetNetworkError(e)) {
              this.logBitgetNetworkErrorOnce('OHLCV');
            } else if (!msg?.includes('does not have market symbol')) {
              logger.warn('DataAggregator', 'OHLCV fetch failed', { symbol, attempt: attempt + 1, error: msg });
            } else {
              logger.debug('DataAggregator', 'Symbol not on Bitget', { symbol });
            }
            if ((this.isTimeout(e) || this.isBitgetNetworkError(e)) && attempt === 0) {
              this.exchange = this.createExchange();
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
          }
          break;
        }
        return this.getMockCandles(symbol, timeframe, limit);
      }
      return this.getMockCandles(symbol, timeframe, limit);
    })();
    ohlcvInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      ohlcvInFlight.delete(cacheKey);
    }
  }

  async getOrderBook(symbol: string, limit = 20, _exchangeId?: string): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    return this.getOrderBookByExchange(symbol, limit);
  }

  async getOrderBookByExchange(symbol: string, limit: number): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    const obCacheKey = `${symbol}:${limit}`;
    const cachedOb = this.obCache.get(obCacheKey);
    if (cachedOb) return cachedOb;

    const dataType = `orderbook_${limit}`;
    const ttlMs = config.marketDataCacheTtl?.orderbook ?? 2_000;

    if (!config.useBinanceForMarketData) {
      const streamTtlMs = config.marketDataCacheTtl?.orderbook ?? 2_000;
      const fromStream = getOrderBookFromStream(symbol);
      if (fromStream && (fromStream.bids.length > 0 || fromStream.asks.length > 0) && (Date.now() - fromStream.ts) < streamTtlMs) {
        const result = { bids: fromStream.bids, asks: fromStream.asks };
        this.obCache.set(obCacheKey, result);
        setMarketDataCache(symbol, dataType, result);
        try {
          const density = computeDensity(result);
          setMarketDataCache(symbol, 'density', {
            spreadPct: density.spreadPct,
            midPrice: density.midPrice,
            depthBidUsd: density.depthBidUsd,
            depthAskUsd: density.depthAskUsd,
            imbalance: density.imbalance
          });
        } catch (_) { /* ignore */ }
        return result;
      }
    }

    const fromDb = getMarketDataCache(symbol, dataType, ttlMs);
    if (fromDb?.data && typeof fromDb.data === 'object' && 'bids' in fromDb.data && 'asks' in fromDb.data) {
      const result = {
        bids: (fromDb.data as { bids: [number, number][] }).bids ?? [],
        asks: (fromDb.data as { asks: [number, number][] }).asks ?? []
      };
      this.obCache.set(obCacheKey, result);
      return result;
    }

    let promise = obInFlight.get(obCacheKey);
    if (promise) return promise;

    promise = (async (): Promise<{ bids: [number, number][]; asks: [number, number][] }> => {
      if (config.useBinanceForMarketData) {
        const ccxtSymbol = this.toCcxtSymbol(symbol);
        const requested = Math.min(limit, config.limits.orderBook);
        const bookLimit = clampToBinanceOrderBookLimit(requested);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const ob = await this.exchange.fetchOrderBook(ccxtSymbol, bookLimit);
            const bids = (ob.bids || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
            const asks = (ob.asks || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
            const result = { bids, asks };
            this.obCache.set(obCacheKey, result);
            setMarketDataCache(symbol, dataType, result);
            try {
              const density = computeDensity(result);
              setMarketDataCache(symbol, 'density', {
                spreadPct: density.spreadPct,
                midPrice: density.midPrice,
                depthBidUsd: density.depthBidUsd,
                depthAskUsd: density.depthAskUsd,
                imbalance: density.imbalance
              });
            } catch (_) { /* ignore */ }
            return result;
          } catch (e) {
            if (this.isBinanceNetworkError(e)) this.logBinanceNetworkErrorOnce('OrderBook');
            else logger.warn('DataAggregator', 'Binance OrderBook fetch failed', { symbol, attempt: attempt + 1, error: (e as Error).message });
            if (this.isTimeout(e) && attempt === 0) {
              this.exchange = this.createBinanceExchange();
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            return this.getMockOrderBook(symbol, limit);
          }
        }
        return this.getMockOrderBook(symbol, limit);
      }

      let useBitgetOb = !config.useMassiveForMarketData || Date.now() < massiveBackoffUntil;
      if (config.useMassiveForMarketData && !useBitgetOb) {
        try {
          const ticker = toMassiveTicker(symbol);
          const ob = await getOrderBookFromSnapshot(ticker);
          const bookLimit = Math.min(limit, config.limits.orderBook);
          const bids = (ob.bids || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
          const asks = (ob.asks || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
          const result = { bids, asks };
          this.obCache.set(obCacheKey, result);
          setMarketDataCache(symbol, dataType, result);
          try {
            const density = computeDensity(result);
            setMarketDataCache(symbol, 'density', {
              spreadPct: density.spreadPct,
              midPrice: density.midPrice,
              depthBidUsd: density.depthBidUsd,
              depthAskUsd: density.depthAskUsd,
              imbalance: density.imbalance
            });
          } catch (_) { /* ignore */ }
          return result;
        } catch (e) {
          if (this.isMassivePlanLimitOrRateLimit(e)) {
            massiveBackoffUntil = Date.now() + MASSIVE_BACKOFF_MS;
            useBitgetOb = true;
          } else return this.getMockOrderBook(symbol, limit);
        }
      }
      if (useBitgetOb) {
        const ccxtSymbol = this.toCcxtSymbol(symbol);
        const bookLimit = Math.min(limit, config.limits.orderBook);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await bitgetRateLimitAcquire();
            const ob = await this.exchange.fetchOrderBook(ccxtSymbol, bookLimit);
            const bids = (ob.bids || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
            const asks = (ob.asks || []).slice(0, bookLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
            const result = { bids, asks };
            this.obCache.set(obCacheKey, result);
            setMarketDataCache(symbol, dataType, result);
            try {
              const density = computeDensity(result);
              setMarketDataCache(symbol, 'density', {
                spreadPct: density.spreadPct,
                midPrice: density.midPrice,
                depthBidUsd: density.depthBidUsd,
                depthAskUsd: density.depthAskUsd,
                imbalance: density.imbalance
              });
            } catch (_) { /* ignore density save errors */ }
            return result;
          } catch (e) {
            if (this.isBitgetNetworkError(e)) this.logBitgetNetworkErrorOnce('OrderBook');
            else logger.warn('DataAggregator', 'OrderBook fetch failed', { symbol, attempt: attempt + 1, error: (e as Error).message });
            if ((this.isTimeout(e) || this.isBitgetNetworkError(e)) && attempt === 0) {
              this.exchange = this.createExchange();
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            return this.getMockOrderBook(symbol, limit);
          }
        }
        return this.getMockOrderBook(symbol, limit);
      }
      return this.getMockOrderBook(symbol, limit);
    })();
    obInFlight.set(obCacheKey, promise);
    try {
      return await promise;
    } finally {
      obInFlight.delete(obCacheKey);
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const cachedPrice = this.priceCache.get(symbol);
    if (cachedPrice) return cachedPrice;

    if (config.useBinanceForMarketData) {
      const ccxtSymbol = this.toCcxtSymbol(symbol);
      try {
        const ticker = await this.exchange.fetchTicker(ccxtSymbol);
        const last = ticker?.last ?? ticker?.close;
        if (typeof last === 'number' && last > 0) {
          this.priceCache.set(symbol, last);
          return last;
        }
      } catch (err) {
        if (this.isBinanceNetworkError(err)) this.logBinanceNetworkErrorOnce('getCurrentPrice');
        else logger.warn('DataAggregator', 'Binance getCurrentPrice failed', { symbol, error: (err as Error).message });
      }
      try {
        const ob = await this.getOrderBookByExchange(symbol, 5);
        const bestBid = ob.bids?.[0]?.[0];
        const bestAsk = ob.asks?.[0]?.[0];
        if (bestBid != null && bestAsk != null && bestBid > 0 && bestAsk > 0) {
          const mid = (bestBid + bestAsk) / 2;
          this.priceCache.set(symbol, mid);
          return mid;
        }
      } catch (err) {
        if (this.isBinanceNetworkError(err)) this.logBinanceNetworkErrorOnce('getCurrentPrice(ob)');
        else logger.warn('DataAggregator', 'Binance getCurrentPrice(ob) failed', { symbol, error: (err as Error).message });
      }
      return this.getSymbolBasePrice(symbol);
    }

    if (config.useMassiveForMarketData && Date.now() >= massiveBackoffUntil) {
      try {
        const snap = await getCryptoSnapshotTicker(toMassiveTicker(symbol));
        const p = snap?.lastTrade?.p ?? snap?.min?.c;
        if (typeof p === 'number' && p > 0) {
          this.priceCache.set(symbol, p);
          return p;
        }
        return this.getSymbolBasePrice(symbol);
      } catch (e) {
        if (this.isMassivePlanLimitOrRateLimit(e)) {
          massiveBackoffUntil = Date.now() + MASSIVE_BACKOFF_MS;
        } else {
          return this.getSymbolBasePrice(symbol);
        }
      }
    }

    const fromTicker = getTickerFromStream(symbol, 5_000);
    if (fromTicker && fromTicker.last > 0) {
      this.priceCache.set(symbol, fromTicker.last);
      return fromTicker.last;
    }

    const ccxtSymbol = this.toCcxtSymbol(symbol);
    try {
      await bitgetRateLimitAcquire();
      const ticker = await this.exchange.fetchTicker(ccxtSymbol);
      const last = ticker?.last ?? ticker?.close;
      if (typeof last === 'number' && last > 0) {
        this.priceCache.set(symbol, last);
        return last;
      }
    } catch (err) {
      if (this.isBitgetNetworkError(err)) this.logBitgetNetworkErrorOnce('getCurrentPrice');
      else logger.warn('DataAggregator', (err as Error).message);
    }
    try {
      const ob = await this.getOrderBookByExchange(symbol, 5);
      const bestBid = ob.bids?.[0]?.[0];
      const bestAsk = ob.asks?.[0]?.[0];
      if (bestBid != null && bestAsk != null && bestBid > 0 && bestAsk > 0) {
        return (bestBid + bestAsk) / 2;
      }
    } catch (err) {
      if (this.isBitgetNetworkError(err)) this.logBitgetNetworkErrorOnce('getCurrentPrice(ob)');
      else logger.warn('DataAggregator', (err as Error).message);
    }
    return this.getSymbolBasePrice(symbol);
  }

  /** Tickers for markets list: symbol, last, change24h (%), volume24h, high24h, low24h */
  async getTickers(symbols?: string[]): Promise<{ symbol: string; last: number; change24h: number; volume24h: number; high24h?: number; low24h?: number }[]> {
    const list = symbols && symbols.length > 0 ? symbols : this.getDefaultTickerSymbols();
    const ttl1d = (config.marketDataCacheTtl && 'candles_1d' in config.marketDataCacheTtl ? config.marketDataCacheTtl.candles_1d : 600_000) as number;
    const results = await Promise.all(
      list.map(async (symbol) => {
        try {
          if (!config.useBinanceForMarketData) {
            const t = getTickerFromStream(symbol, 5_000);
            if (t && t.last > 0) {
              const candles1d = getCandlesFromStream(symbol, '1d', ttl1d);
              const open24h = candles1d?.length ? candles1d[0].open : t.last;
              const change24h = open24h > 0 ? ((t.last - open24h) / open24h) * 100 : 0;
              return {
                symbol,
                last: t.last,
                change24h,
                volume24h: t.volume24h ?? 0,
                high24h: t.high24h,
                low24h: t.low24h
              };
            }
          }
          const [last, candles] = await Promise.all([
            this.getCurrentPrice(symbol),
            this.getOHLCVByExchange(symbol, '1d', 2)
          ]);
          const open24h = candles?.length >= 2 ? candles[0].open : candles?.[0]?.open ?? last;
          const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
          const lastC = candles?.length ? candles[candles.length - 1] : null;
          const volume24h = lastC ? lastC.volume * (lastC.close || lastC.open || last) : 0;
          const high24h = lastC ? lastC.high : last;
          const low24h = lastC ? lastC.low : last;
          return { symbol, last, change24h, volume24h, high24h, low24h };
        } catch (e) {
          const base = this.getSymbolBasePrice(symbol);
          return { symbol, last: base, change24h: 0, volume24h: 0, high24h: base, low24h: base };
        }
      })
    );
    return results;
  }

  private getDefaultTickerSymbols(): string[] {
    return ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'BNB-USDT', 'AVAX-USDT', 'LINK-USDT', 'MATIC-USDT', 'DOT-USDT'];
  }

  async getTrades(symbol: string, limit = 100, _exchangeId?: string): Promise<{ price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[]> {
    const tradesCacheKey = `${symbol}:${limit}`;
    const cachedTrades = this.tradesCache.get(tradesCacheKey);
    if (cachedTrades) return cachedTrades;

    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const tradesLimit = Math.min(limit, config.limits.trades);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!config.useBinanceForMarketData) await bitgetRateLimitAcquire();
        const rows = await this.exchange.fetchTrades(ccxtSymbol, undefined, tradesLimit);
        const trades = rows.map((t: any) => {
          const price = Number(t.price ?? (t.cost && t.amount ? t.cost / t.amount : 0));
          const amount = Number(t.amount ?? (t.cost && t.price ? t.cost / t.price : 0));
          const cost = t.cost ?? (price * amount);
          return {
            price,
            amount,
            time: Number(t.timestamp ?? t.time ?? Date.now()),
            isBuy: t.side === 'buy' || t.buy === true,
            quoteQuantity: Number(cost)
          };
        }).sort((a, b) => a.time - b.time);
        this.tradesCache.set(tradesCacheKey, trades);
        return trades;
      } catch (e) {
        if (config.useBinanceForMarketData) {
          if (this.isBinanceNetworkError(e)) this.logBinanceNetworkErrorOnce('Trades');
          else logger.warn('DataAggregator', 'Binance Trades fetch failed', { symbol, attempt: attempt + 1, error: (e as Error).message });
          if (this.isTimeout(e) && attempt === 0) {
            this.exchange = this.createBinanceExchange();
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        } else {
          if (this.isBitgetNetworkError(e)) this.logBitgetNetworkErrorOnce('Trades');
          else logger.warn('DataAggregator', 'Trades fetch failed', { symbol, attempt: attempt + 1, error: (e as Error).message });
          if ((this.isTimeout(e) || this.isBitgetNetworkError(e)) && attempt === 0) {
            this.exchange = this.createExchange();
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        }
        return this.getMockTrades(symbol, limit);
      }
    }
    return this.getMockTrades(symbol, limit);
  }

  /** Базовые цены для мок-свечей (DOGE и др. — единая нормализация символа в lib/symbol) */
  private getSymbolBasePrice(symbol: string): number {
    const s = symbol.toUpperCase();
    if (s.includes('BTC')) return 97000;
    if (s.includes('ETH')) return 3500;
    if (s.includes('SOL')) return 220;
    if (s.includes('BNB')) return 350;
    if (s.includes('DOGE')) return 0.4;
    return 1;
  }

  private getMockCandles(symbol: string, timeframe: string, limit: number): OHLCVCandle[] {
    const basePrice = this.getSymbolBasePrice(symbol);
    const tfMs = this.timeframeToMs(timeframe);
    const now = Date.now();
    const candles: OHLCVCandle[] = [];
    let price = basePrice;
    for (let i = limit; i >= 0; i--) {
      const change = (Math.random() - 0.48) * basePrice * 0.002;
      const open = price;
      price = price + change;
      candles.push({
        timestamp: now - i * tfMs,
        open,
        high: Math.max(open, price) * (1 + Math.random() * 0.001),
        low: Math.min(open, price) * (1 - Math.random() * 0.001),
        close: price,
        volume: (basePrice * 0.01 + Math.random() * basePrice * 0.02)
      });
    }
    return candles;
  }

  private getMockTrades(symbol: string, limit: number): { price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[] {
    const base = this.getSymbolBasePrice(symbol);
    const trades: { price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[] = [];
    let t = Date.now();
    for (let i = 0; i < limit; i++) {
      const price = base * (1 + (Math.random() - 0.5) * 0.001);
      const amount = Math.random() * 0.1 + 0.001;
      trades.push({
        price,
        amount,
        time: t - i * 2000,
        isBuy: Math.random() > 0.5,
        quoteQuantity: price * amount
      });
    }
    return trades;
  }

  private getMockOrderBook(symbol: string, limit: number): { bids: [number, number][]; asks: [number, number][] } {
    const base = this.getSymbolBasePrice(symbol);
    const spread = base * 0.0001;
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];
    for (let i = 0; i < limit; i++) {
      bids.push([base - spread * (i + 1), Math.random() * 0.5 + 0.01]);
      asks.push([base + spread * (i + 1), Math.random() * 0.5 + 0.01]);
    }
    return { bids, asks };
  }

  private timeframeToMs(tf: string): number {
    const m: Record<string, number> = {
      '1m': 60000, '5m': 300000, '15m': 900000,
      '1h': 3600000, '4h': 14400000, '1d': 86400000
    };
    return m[tf] ?? 900000;
  }
}
