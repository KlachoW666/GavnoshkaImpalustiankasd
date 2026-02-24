import { Router } from 'express';
import { DataAggregator } from '../services/dataAggregator';
import { getBroadcastSignal } from '../websocket';
import { findSessionUserId, getBitgetCredentials } from '../db/authDb';
import { requireAuth } from './auth';
import { rateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { autoAnalyzeStartSchema } from '../schemas/autoAnalyze';
import { CandleAnalyzer } from '../services/candleAnalyzer';
import { SignalGenerator } from '../services/signalGenerator';
import { addSignal, getSignalsSince } from './signals';
import { CandlePattern } from '../types/candle';
import {
  analyzeOrderBook,
  analyzeTape,
  analyzeCandles,
  computeSignal,
  buildAnalysisBreakdown,
  detectAbsorption,
  detectIceberg,
  detectConsolidation
} from '../services/marketAnalysis';
import { config } from '../config';
import { normalizeSymbol, toMassiveStocksTicker } from '../lib/symbol';
import { getStocksSnapshotTicker, getStocksAggs, getOptionChainSnapshot, getOptionsContracts } from '../services/massiveClient';
import { logger } from '../lib/logger';
import { VOLUME_BREAKOUT_MULTIPLIER, volatilitySizeMultiplier, isPotentialFalseBreakout } from '../lib/tradingPrinciples';
import { buildVolumeProfile } from '../services/clusterAnalyzer';
import { FundamentalFilter } from '../services/fundamentalFilter';
import { Semaphore } from '../lib/semaphore';
import { TtlCache } from '../lib/ttlCache';
import { adjustConfidence, update as mlUpdate, predict as mlPredict, getStats as mlGetStats, MIN_SAMPLES_FOR_AI_GATE, effectiveProbability } from '../services/onlineMLService';
import { getExternalAiConfig, hasAnyApiKey as externalAiHasKey, evaluateSignal as externalAiEvaluate } from '../services/externalAiService';
import { FundingRateMonitor } from '../services/fundingRateMonitor';
import { calcLiquidationPrice, calcLiquidationPriceSimple } from '../lib/liquidationPrice';
import { executeSignal, type DensityOptions } from '../services/autoTrader';
import { ADMIN_POOL_CLIENT_ID } from '../services/copyTradingProfitShareService';
import { subscribeSymbols } from '../services/bitgetOrderBookStream';
import { subscribeMarketSymbols } from '../services/bitgetMarketStream';
import { initDb, insertOrder, getSetting, setSetting } from '../db';
import { analyzeBtcTrend, applyBtcCorrelation, type BtcTrendResult } from '../services/btcCorrelation';
import { getCurrentSession, applySessionFilter } from '../services/sessionFilter';

const router = Router();

/** Глобальные флаги (fallback при отсутствии per-user опций) */
let autoAnalyzeExecuteOrders = false;
let autoAnalyzeUseTestnet = true;
let autoAnalyzeMaxPositions = 2;
let autoAnalyzeSizePercent = 25;
let autoAnalyzeLeverage = 25;
let autoAnalyzeTpMultiplier = 1;
let autoAnalyzeMinAiProb = 0;

interface PerUserAutoState {
  timer: ReturnType<typeof setInterval>;
  intervalMs: number;
  lastCycleAt: number;
  executeOrders: boolean;
  useTestnet: boolean;
  maxPositions: number;
  sizePercent: number;
  sizeMode: 'percent' | 'risk';
  riskPct: number;
  leverage: number;
  tpMultiplier: number;
  /** AI-фильтр: мин. вероятность выигрыша (0–1). 0 = выкл. */
  minAiProb: number;
  fullAuto: boolean;
}
const autoAnalyzeByUser = new Map<string, PerUserAutoState>();
const AUTO_ANALYZE_STATE_KEY = 'auto_analyze_persisted_state';
/** Результат последнего исполнения по userId (для отображения на фронте) */
interface LastExecutionEntry {
  lastError?: string;
  lastSkipReason?: string;
  lastOrderId?: string;
  useTestnet?: boolean;
  at: number;
  /** Внутренняя ML-оценка (0–1) лучшего сигнала в цикле */
  lastAiProb?: number;
  /** Консервативная оценка для фильтра (с учётом числа примеров) */
  lastEffectiveAiProb?: number;
  /** Оценка внешнего ИИ (OpenAI/Claude), если вызывался */
  lastExternalAiScore?: number;
  /** Был ли вызван внешний ИИ в этом цикле */
  lastExternalAiUsed?: boolean;
}
const lastExecutionByUser = new Map<string, LastExecutionEntry>();

function setLastExecutionForUser(
  userId: string,
  err?: string,
  orderId?: string,
  skipReason?: string,
  aiInfo?: { aiProb: number; effectiveAiProb: number; externalAiScore?: number; externalAiUsed?: boolean }
): void {
  const entry: LastExecutionEntry = {
    lastError: err,
    lastOrderId: orderId,
    lastSkipReason: skipReason,
    at: Date.now()
  };
  if (aiInfo) {
    entry.lastAiProb = aiInfo.aiProb;
    entry.lastEffectiveAiProb = aiInfo.effectiveAiProb;
    if (aiInfo.externalAiScore != null) entry.lastExternalAiScore = aiInfo.externalAiScore;
    if (aiInfo.externalAiUsed != null) entry.lastExternalAiUsed = aiInfo.externalAiUsed;
  }
  lastExecutionByUser.set(userId, entry);
}
const faFilter = new FundamentalFilter();
const aggregator = new DataAggregator();
const candleAnalyzer = new CandleAnalyzer();
const signalGenerator = new SignalGenerator();

router.get('/candles/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const timeframe = (req.query.timeframe as string) || '5m';
    const limit = Math.min(parseInt(req.query.limit as string) || candlesFor48h(timeframe), config.limits.candlesMax);
    const candles = await aggregator.getOHLCVByExchange(symbol, timeframe, limit);
    res.json(candles);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/exchanges', (_req, res) => {
  res.json(aggregator.getExchangeIds());
});

/** Источник рыночных данных для графика: Massive.com или Bitget (fallback) */
router.get('/data-source', (_req, res) => {
  res.json({ source: config.useMassiveForMarketData ? 'massive' : 'bitget' });
});

// --- Massive Stocks (https://massive.com/stocks) ---

/** GET /api/market/stocks/snapshot/:ticker — снапшот одного тикера акций (Massive) */
router.get('/stocks/snapshot/:ticker', async (req, res) => {
  try {
    const ticker = toMassiveStocksTicker(decodeURIComponent(req.params.ticker || 'AAPL')) || 'AAPL';
    if (!config.massive.apiKey) {
      return res.status(503).json({ error: 'Massive API key not configured. Set MASSIVE_API_KEY in .env.' });
    }
    const snapshot = await getStocksSnapshotTicker(ticker);
    res.json(snapshot ?? {});
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/market/stocks/candles/:ticker — свечи по тикеру акций (Massive aggs) */
router.get('/stocks/candles/:ticker', async (req, res) => {
  try {
    const ticker = toMassiveStocksTicker(decodeURIComponent(req.params.ticker || 'AAPL')) || 'AAPL';
    const timeframe = (req.query.timeframe as string) || '1d';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 5000);
    if (!config.massive.apiKey) {
      return res.status(503).json({ error: 'Massive API key not configured. Set MASSIVE_API_KEY in .env.' });
    }
    const toMs = Date.now();
    // Достаточное окно для любого таймфрейма (2 года)
    const fromMs = toMs - 2 * 365 * 24 * 60 * 60 * 1000;
    const candles = await getStocksAggs(ticker, timeframe, fromMs, toMs, limit);
    res.json(candles);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Massive Options (https://massive.com/options) ---

/** GET /api/market/options/chain/:underlying — снапшот опционной цепочки по базовому активу */
router.get('/options/chain/:underlying', async (req, res) => {
  try {
    const underlying = toMassiveStocksTicker(decodeURIComponent(req.params.underlying || 'AAPL')) || 'AAPL';
    const strike_price = req.query.strike_price as string | undefined;
    const expiration_date = req.query.expiration_date as string | undefined;
    const contract_type = req.query.contract_type as 'call' | 'put' | undefined;
    const limit = req.query.limit != null ? Math.min(parseInt(String(req.query.limit)), 250) : undefined;
    if (!config.massive.apiKey) {
      return res.status(503).json({ error: 'Massive API key not configured. Set MASSIVE_API_KEY in .env.' });
    }
    const data = await getOptionChainSnapshot(underlying, { strike_price, expiration_date, contract_type, limit });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/market/options/contracts — список контрактов опционов (фильтры в query) */
router.get('/options/contracts', async (req, res) => {
  try {
    const underlying_ticker = req.query.underlying_ticker as string | undefined;
    const expiration_date = req.query.expiration_date as string | undefined;
    const expiration_date_gte = req.query.expiration_date_gte as string | undefined;
    const expiration_date_lte = req.query.expiration_date_lte as string | undefined;
    const strike_price = req.query.strike_price != null ? Number(req.query.strike_price) : undefined;
    const contract_type = req.query.contract_type as 'call' | 'put' | undefined;
    const expired = req.query.expired === 'true' || req.query.expired === '1';
    const limit = req.query.limit != null ? Math.min(parseInt(String(req.query.limit)), 1000) : 100;
    if (!config.massive.apiKey) {
      return res.status(503).json({ error: 'Massive API key not configured. Set MASSIVE_API_KEY in .env.' });
    }
    const data = await getOptionsContracts({
      underlying_ticker: underlying_ticker ? toMassiveStocksTicker(underlying_ticker) : undefined,
      expiration_date,
      expiration_date_gte,
      expiration_date_lte,
      strike_price,
      contract_type,
      expired,
      limit
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const price = await aggregator.getCurrentPrice(symbol);
    res.json({ price, symbol, exchange: 'okx' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Цена с OKX */
router.get('/price/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const price = await aggregator.getCurrentPrice(symbol);
    res.json({ price, symbol });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/trades/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const limit = Math.min(parseInt(req.query.limit as string) || 30, config.limits.trades);
    const trades = await aggregator.getTrades(symbol, limit);
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, config.limits.orderBook);
    const data = await aggregator.getOrderBookByExchange(symbol, limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/market/tickers — список рынков для Trade page (symbol, last, change24h, volume24h) */
router.get('/tickers', async (_req, res) => {
  try {
    const tickers = await aggregator.getTickers();
    res.json(tickers);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/market/funding?symbol= — ставка финансирования и время следующего funding (Bitget-style) */
router.get('/funding', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(String(req.query.symbol || 'BTC-USDT'))) || 'BTC-USDT';
    const fundingMonitor = new FundingRateMonitor();
    const funding = await fundingMonitor.getFundingRate(symbol);
    if (!funding) {
      return res.json({ rate: 0, ratePct: '0.0000%', nextFundingTime: null });
    }
    const ratePct = (funding.rate * 100).toFixed(4) + '%';
    res.json({
      rate: funding.rate,
      ratePct,
      nextFundingTime: funding.nextFundingTime ?? null,
      interpretation: funding.interpretation,
      shouldAvoidLong: funding.shouldAvoidLong,
      shouldAvoidShort: funding.shouldAvoidShort
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

function detectThreeWhiteSoldiers(candles: { open: number; high: number; close: number }[]): boolean {
  if (candles.length < 3) return false;
  const [a, b, c] = candles.slice(-3);
  return a.close > a.open && b.close > b.open && c.close > c.open &&
    b.high > a.high && c.high > b.high && a.close < b.open && b.close < c.open;
}

function candlesFor48h(timeframe: string): number {
  const needed = config.timeframes[timeframe] ?? 192;
  return Math.min(Math.max(needed, 100), config.limits.candles);
}

/** Лимиты свечей для глубокого Multi-TF анализа (HTF-first) */
const MTF_LIMITS: Record<string, number> = { '1m': 500, '5m': 600, '15m': 400, '1h': 250, '4h': 150, '1d': 150 };

/** Веса: HTF (1d, 4h) определяют тренд, MTF (1h) — подтверждение, LTF (15m, 5m, 1m) — вход */
const MTF_WEIGHTS: Record<string, number> = { '1d': 0.25, '4h': 0.20, '1h': 0.20, '15m': 0.15, '5m': 0.10, '1m': 0.10 };
/** Скальпинг: приоритет краткосрочных ТФ (1m, 5m, 15m) для быстрых сделок */
const MTF_WEIGHTS_SCALPING: Record<string, number> = { '1d': 0.10, '4h': 0.10, '1h': 0.15, '15m': 0.20, '5m': 0.25, '1m': 0.20 };

/** Рыночная структура: HH/HL = бычий, LH/LL = медвежий. Swing = локальный экстремум в окне 3 */
function detectMarketStructure(candles: { high: number; low: number; close: number }[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 15) return 'neutral';
  const lookback = 3;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isSH = true, isSL = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= h || candles[i + j].high >= h) isSH = false;
      if (candles[i - j].low <= l || candles[i + j].low <= l) isSL = false;
    }
    if (isSH) swingHighs.push(h);
    if (isSL) swingLows.push(l);
  }
  const shLast = swingHighs.slice(-4);
  const slLast = swingLows.slice(-4);
  if (shLast.length < 2 || slLast.length < 2) return 'neutral';
  const hh = shLast[shLast.length - 1] > shLast[shLast.length - 2];
  const hl = slLast[slLast.length - 1] > slLast[slLast.length - 2];
  const lh = shLast[shLast.length - 1] < shLast[shLast.length - 2];
  const ll = slLast[slLast.length - 1] < slLast[slLast.length - 2];
  if (hh && hl) return 'bullish';
  if (lh && ll) return 'bearish';
  return 'neutral';
}

function detectPatterns(candles: { open: number; high: number; low: number; close: number; volume?: number }[], analyzer: CandleAnalyzer): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (candles.length < 2) return patterns;
  const lastCandle = candles[candles.length - 1];
  const engulfing = analyzer.detectEngulfing(candles as any);
  if (engulfing !== 'none') patterns.push(engulfing);
  const prev3 = candles.slice(-4, -1);
  const priorDown = prev3.filter((c) => c.close < c.open).length >= 2;
  if (analyzer.detectHammer(lastCandle as any)) patterns.push(priorDown ? 'hammer' : 'hanging_man');
  if (analyzer.detectInvertedHammer(lastCandle as any)) patterns.push(priorDown ? 'inverted_hammer' : 'shooting_star');
  if (analyzer.detectDoji(lastCandle as any)) {
    if (analyzer.detectDragonflyDoji(lastCandle as any)) patterns.push('dragonfly_doji');
    else if (analyzer.detectGravestoneDoji(lastCandle as any)) patterns.push('gravestone_doji');
    else patterns.push('doji');
  }
  if (analyzer.detectSpinningTop(lastCandle as any)) patterns.push('spinning_top');
  if (analyzer.detectTweezerTops(candles as any)) patterns.push('tweezer_tops');
  if (analyzer.detectTweezerBottoms(candles as any)) patterns.push('tweezer_bottoms');
  const harami = analyzer.detectHarami(candles as any);
  if (harami !== 'none') patterns.push(harami);
  if (analyzer.detectPiercingLine(candles as any)) patterns.push('piercing_line');
  if (analyzer.detectDarkCloudCover(candles as any)) patterns.push('dark_cloud_cover');
  if (analyzer.detectMorningStar(candles as any)) patterns.push('morning_star');
  if (analyzer.detectEveningStar(candles as any)) patterns.push('evening_star');
  if (detectThreeWhiteSoldiers(candles)) patterns.push('three_white_soldiers');
  if (analyzer.detectThreeBlackCrows(candles as any)) patterns.push('three_black_crows');
  if (analyzer.detectBullMarubozu(lastCandle as any)) patterns.push('bull_marubozu');
  if (analyzer.detectBearMarubozu(lastCandle as any)) patterns.push('bear_marubozu');
  return patterns;
}

export async function runAnalysis(symbol: string, timeframe = '5m', mode = 'default', opts?: { silent?: boolean; userId?: string }) {
  const sym = normalizeSymbol(symbol) || 'BTC-USDT';
  const { limits } = config;

  const [orderBook, trades, entryPrice, candles1m, candles5m, candles15m, candles1h, candles4h, candles1d] = await Promise.all([
    aggregator.getOrderBook(sym, limits.orderBook),
    aggregator.getTrades(sym, limits.trades),
    aggregator.getCurrentPrice(sym),
    aggregator.getOHLCV(sym, '1m', MTF_LIMITS['1m'] ?? 500),
    aggregator.getOHLCV(sym, '5m', MTF_LIMITS['5m'] ?? 600),
    aggregator.getOHLCV(sym, '15m', MTF_LIMITS['15m'] ?? 400),
    aggregator.getOHLCV(sym, '1h', MTF_LIMITS['1h'] ?? 250),
    aggregator.getOHLCV(sym, '4h', MTF_LIMITS['4h'] ?? 150),
    aggregator.getOHLCV(sym, '1d', MTF_LIMITS['1d'] ?? 150)
  ]);

  // Data validation (crypto-trading-open + freqtrade startup_candle_count)
  const MIN_OB_LEVELS = 5;
  const MIN_TRADES = 5;
  const MIN_CANDLES_5M = 50;
  const obValid = (orderBook.bids?.length ?? 0) >= MIN_OB_LEVELS && (orderBook.asks?.length ?? 0) >= MIN_OB_LEVELS;
  const tradesValid = (trades?.length ?? 0) >= MIN_TRADES;
  const candles5mValid = (candles5m?.length ?? 0) >= MIN_CANDLES_5M;
  if (!obValid || !tradesValid || !candles5mValid) {
    logger.warn('runAnalysis', 'Insufficient market data', {
      symbol: sym,
      ob: `${orderBook.bids?.length ?? 0}/${orderBook.asks?.length ?? 0}`,
      trades: trades?.length ?? 0,
      candles5m: candles5m?.length ?? 0
    });
    if (!candles5mValid && !opts?.silent) {
      const emptyOb = analyzeOrderBook({ bids: orderBook.bids || [], asks: orderBook.asks || [] });
      const emptyTape = analyzeTape([]);
      const emptyCandles = { direction: 'NEUTRAL' as const, score: 0, patterns: [], rsi: null, emaTrend: null, volumeConfirm: false, bbSqueeze: false, highVolatility: false };
      const emptyBreakdown = buildAnalysisBreakdown(emptyOb, emptyTape, emptyCandles, { direction: null, confidence: 0, reason: 'Insufficient candles' });
      const emptySignal = signalGenerator.generateSignal({
        symbol: sym.replace('-', '/'),
        exchange: 'OKX',
        direction: 'LONG',
        entryPrice: entryPrice || 0,
        patterns: ['none'],
        confidence: 0,
        timeframe,
        mode
      });
      return { signal: emptySignal, analysis: {}, breakdown: emptyBreakdown, dataInsufficient: true };
    }
  }

  const obSignal = analyzeOrderBook({ bids: orderBook.bids || [], asks: orderBook.asks || [] });

  const tradesMapped = (trades || []).map((t: any) => ({
    price: t.price,
    amount: t.amount,
    time: t.time,
    isBuy: t.isBuy ?? false,
    quoteQuantity: t.quoteQuantity ?? t.price * t.amount
  }));
  const tapeSignal = analyzeTape(tradesMapped);

  // Order Flow: absorption & iceberg detection
  const absorptionResult = detectAbsorption({ bids: orderBook.bids || [], asks: orderBook.asks || [] }, tradesMapped);
  const icebergResult = detectIceberg(tradesMapped, entryPrice);

  const now = Date.now();
  const TAPE_WINDOWS_MS = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000 } as const;
  const TAPE_WEIGHTS = { '1m': 0.25, '5m': 0.35, '15m': 0.25, '1h': 0.15 } as const;
  let tapeLongW = 0;
  let tapeShortW = 0;
  const tapeWindowResults: Record<string, { direction: string; delta: number }> = {};
  for (const w of ['1m', '5m', '15m', '1h'] as const) {
    const windowTrades = tradesMapped.filter((t) => t.time >= now - TAPE_WINDOWS_MS[w]);
    if (windowTrades.length < 5) continue;
    const res = analyzeTape(windowTrades);
    tapeWindowResults[w] = { direction: res.direction, delta: res.delta };
    const wgt = TAPE_WEIGHTS[w];
    if (res.direction === 'LONG') tapeLongW += wgt;
    else if (res.direction === 'SHORT') tapeShortW += wgt;
  }
  const tapeWindowDir = tapeLongW > tapeShortW + 0.2 ? 'LONG' : tapeShortW > tapeLongW + 0.2 ? 'SHORT' : tapeSignal.direction;

  const candles = candles5m;
  const mtfCandles = { '1m': candles1m, '5m': candles5m, '15m': candles15m, '1h': candles1h, '4h': candles4h, '1d': candles1d } as const;

  let longWeight = 0;
  let shortWeight = 0;
  const mtfResults: Record<string, { direction: string; score: number }> = {};
  const tfOrder: (keyof typeof mtfCandles)[] = ['1d', '4h', '1h', '15m', '5m', '1m'];

  for (const tf of tfOrder) {
    const cs = mtfCandles[tf];
    if (!cs?.length || cs.length < 5) continue;
    const closes = cs.map((c) => c.close);
    const patterns = detectPatterns(cs, candleAnalyzer);
    const rsi = candleAnalyzer.getRSI(closes);
    const macd = candleAnalyzer.getMACD(closes);
    const bb = candleAnalyzer.getBollingerBands(closes);
    const ema = candleAnalyzer.getEMA(closes);
    const bbWidth = candleAnalyzer.getBollingerBandsWidth(closes);
    const res = analyzeCandles(cs, patterns, rsi ?? null, macd, bb, {
      patterns, rsi: rsi ?? null, macd, bb, ema, atr: null, macdCrossover: candleAnalyzer.getMACDCrossover(closes),
      bbWidth: bbWidth?.width, avgBbWidth: bbWidth?.avgWidth
    });
    const lastClose = cs[cs.length - 1].close;
    if (ema && (tf === '1h' || tf === '4h' || tf === '1d')) {
      if (lastClose > ema.ema21 && lastClose > ema.ema50 && res.direction === 'NEUTRAL') res.direction = 'LONG';
      else if (lastClose < ema.ema21 && lastClose < ema.ema50 && res.direction === 'NEUTRAL') res.direction = 'SHORT';
    }
    const structure = cs.length >= 15 ? detectMarketStructure(cs) : 'neutral';
    if (structure === 'bullish' && res.direction === 'NEUTRAL') res.direction = 'LONG';
    if (structure === 'bearish' && res.direction === 'NEUTRAL') res.direction = 'SHORT';
    mtfResults[tf] = { direction: res.direction, score: res.score };
    const w = MTF_WEIGHTS[tf] ?? 0.2;
    if (res.direction === 'LONG') longWeight += w;
    else if (res.direction === 'SHORT') shortWeight += w;
  }

  const mtfDir: 'LONG' | 'SHORT' | 'NEUTRAL' = longWeight > shortWeight + 0.15 ? 'LONG' : shortWeight > longWeight + 0.15 ? 'SHORT' : 'NEUTRAL';
  const mtfScore = Math.max(longWeight, shortWeight) * 15;
  const mtfAlignCount = Object.values(mtfResults).filter((r) => r.direction === mtfDir).length;

  const htf1d = candles1d.length >= 15 ? detectMarketStructure(candles1d) : 'neutral';
  const htf4h = candles4h.length >= 15 ? detectMarketStructure(candles4h) : 'neutral';
  const htfBull = htf1d === 'bullish' || htf4h === 'bullish';
  const htfBear = htf1d === 'bearish' || htf4h === 'bearish';
  const againstHTF = (mtfDir === 'LONG' && htfBear) || (mtfDir === 'SHORT' && htfBull);

  const rsi = candles5m.length ? candleAnalyzer.getRSI(candles5m.map((c) => c.close)) : null;
  let patterns = detectPatterns(candles5m, candleAnalyzer);
  // Freqtrade-strategies: BinHV45, ClucMay72018, HLHB, VolatilitySystem, BinHV27 (ADX/emarsi)
  if (candleAnalyzer.detectBinHV45LowerBB(candles5m as any)) patterns = [...patterns, 'binhv45_lower_bb_reversal'];
  if (candleAnalyzer.detectClucLowVolumeDip(candles5m as any)) patterns = [...patterns, 'cluc_low_volume_dip'];
  const hlhbDir = candleAnalyzer.detectHLHBCross(candles5m as any);
  if (hlhbDir) patterns = [...patterns, hlhbDir === 'LONG' ? 'hlhb_ema_rsi_cross' : 'hlhb_ema_rsi_cross_bear'];
  const volBreakout = candleAnalyzer.detectVolatilityBreakout(candles5m);
  if (volBreakout) patterns = [...patterns, volBreakout === 'LONG' ? 'volatility_breakout' : 'volatility_breakout_bear'];
  const adx = candleAnalyzer.getADX(candles5m);
  if (adx != null && adx > 25) patterns = [...patterns, 'adx_trend'];
  const emarsi = candleAnalyzer.getEMARSI(candles5m.map((c) => c.close));
  if (emarsi != null && emarsi <= 20) patterns = [...patterns, 'emarsi_oversold'];
  const supertrendDir = candleAnalyzer.getSupertrend(candles5m);
  if (supertrendDir) patterns = [...patterns, supertrendDir === 'up' ? 'supertrend_up' : 'supertrend_down'];
  const rsiDiv = candleAnalyzer.detectRSIDivergence(candles5m, 14, 30);
  if (rsiDiv) patterns = [...patterns, rsiDiv === 'bullish' ? 'rsi_bullish_divergence' : 'rsi_bearish_divergence'];
  const lastC5 = candles5m[candles5m.length - 1];
  const highVolatility = lastC5 && lastC5.close > 0
    ? (lastC5.high - lastC5.low) / lastC5.close > 0.03
    : false;
  const bbWidthData = candleAnalyzer.getBollingerBandsWidth(candles5m.map((c) => c.close));
  const bbSqueezeDetected = bbWidthData != null && bbWidthData.avgWidth > 0 && bbWidthData.width < bbWidthData.avgWidth * 0.8;
  const candlesSignal = {
    direction: mtfDir !== 'NEUTRAL' ? mtfDir : (Object.values(mtfResults)[0]?.direction as 'LONG' | 'SHORT') ?? 'NEUTRAL',
    score: mtfScore,
    volumeConfirm: candles5m.length >= 20 &&
      (candles5m[candles5m.length - 1]?.volume ?? 0) > candles5m.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20 * VOLUME_BREAKOUT_MULTIPLIER,
    bbSqueeze: bbSqueezeDetected,
    patterns,
    rsi,
    emaTrend: null as 'bullish' | 'bearish' | null,
    highVolatility,
    freqtrade: { adx, emarsi, supertrendDir, hlhbDir, volBreakout }
  };
  const atr = candleAnalyzer.getATR(candles5m);
  const avgAtr = candleAnalyzer.getATRAvg(candles5m);
  const volatilityMultiplier = volatilitySizeMultiplier(atr ?? null, avgAtr ?? null);
  const currVol = candles5m.length ? (candles5m[candles5m.length - 1]?.volume ?? 0) : 0;
  const avgVol20 = candles5m.length >= 20 ? candles5m.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20 : 0;
  const falseBreakoutHint = patterns.some((p) => p.includes('engulfing') || p.includes('breakout'))
    ? isPotentialFalseBreakout(currVol, avgVol20, true)
    : false;

  // Cluster analysis (Volume Profile, POC, HVN/LVN)
  let clusterData: { poc: number; hvnZones: [number, number][]; lvnZones: [number, number][]; totalDelta: number } | null = null;
  if (tradesMapped.length >= 20 && entryPrice > 0) {
    const priceStep = entryPrice * 0.001;
    const vp = buildVolumeProfile(tradesMapped, priceStep, entryPrice);
    const totalDelta = vp.clusters.reduce((s, c) => s + c.delta, 0);
    clusterData = { poc: vp.poc, hvnZones: vp.hvnZones, lvnZones: vp.lvnZones, totalDelta };
  }

  // Consolidation / Range detector for breakout strategy
  const consolidation = detectConsolidation(candles5m);

  // Layer 2: Fundamental Filter (generate-complete-guide, Burniske) — блок при слабом рынке
  if (!faFilter.isValid(obSignal.spreadPct)) {
    if (!opts?.silent) logger.info('runAnalysis', 'FA Failed: spread/liquidity', { symbol: sym, spreadPct: obSignal.spreadPct });
    const emptyBreakdown = buildAnalysisBreakdown(obSignal, tapeSignal, candlesSignal, { direction: null, confidence: 0, reason: 'FA Failed: spread/liquidity' });
    const emptySignal = signalGenerator.generateSignal({
      symbol: sym.replace('-', '/'),
      exchange: 'OKX',
      direction: 'LONG',
      entryPrice,
      patterns: ['none'],
      confidence: 0,
      timeframe,
      mode
    });
    return { signal: emptySignal, analysis: {}, breakdown: emptyBreakdown, faBlocked: true };
  }

  const tapeForSignal = tapeWindowDir !== 'NEUTRAL'
    ? { ...tapeSignal, direction: tapeWindowDir as 'LONG' | 'SHORT' }
    : tapeSignal;

  // Determine trading mode for adaptive weights
  const detectedTradingMode: import('../services/marketAnalysis').TradingMode =
    (bbSqueezeDetected && consolidation.isConsolidating) ? 'breakout'
      : (timeframe === '1m' || timeframe === '5m') ? 'scalping'
        : 'standard';

  const signalResult = computeSignal(
    {
      candles: { direction: candlesSignal.direction, score: candlesSignal.score },
      orderBook: obSignal,
      tape: tapeForSignal
    },
    {
      spreadPct: obSignal.spreadPct,
      volumeConfirm: candlesSignal.volumeConfirm,
      bbSqueeze: candlesSignal.bbSqueeze,
      tapeDelta: tapeSignal.delta,
      tapeRecentDelta: tapeSignal.recentDelta,
      obDomScore: obSignal.domScore,
      cvdDivergence: tapeSignal.cvdDivergence,
      highVolatility: candlesSignal.highVolatility,
      falseBreakoutHint,
      tradingMode: detectedTradingMode
    }
  );
  const { direction: confluentDir, confidence: confluentConf, confluence } = signalResult;

  let direction: 'LONG' | 'SHORT' = 'LONG';
  let confidence = 0.65;

  if (confluence && confluentDir) {
    direction = confluentDir;
    confidence = confluentConf;
    const baseConfidence = confluentConf; // Запоминаем базовый confidence для лимита бонусов
    const MAX_TOTAL_BONUS = 0.20; // Лимит суммарного бонуса: +20% максимум
    let totalBonus = 0;

    // Multi-TF alignment bonus — 6 TFs (1d, 4h, 1h, 15m, 5m, 1m) в одном направлении
    if (mtfAlignCount >= 5) totalBonus += 0.10;
    else if (mtfAlignCount >= 4) totalBonus += 0.06;
    else if (mtfAlignCount >= 3) totalBonus += 0.02;
    if (mtfAlignCount < 3 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.max(0.55, confidence - 0.08);
    }
    if (mtfAlignCount < 4 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.min(confidence, 0.88);
    }
    // Усиленный штраф против HTF — часто приводит к убыткам
    if (againstHTF) confidence = Math.max(0.50, Math.min(confidence - 0.15, 0.70));
    // Freqtrade: бонус при совпадении HLHB/VolatilityBreakout/Supertrend
    if (hlhbDir === direction) totalBonus += 0.04;
    if (volBreakout === direction) totalBonus += 0.03;
    if (supertrendDir === (direction === 'LONG' ? 'up' : 'down')) totalBonus += 0.02;
    if (adx != null && adx > 30) totalBonus += 0.02;
    // Cluster delta alignment bonus — POC/delta from Volume Profile
    if (clusterData) {
      const clusterAlign = (direction === 'LONG' && clusterData.totalDelta > 0) ||
        (direction === 'SHORT' && clusterData.totalDelta < 0);
      if (clusterAlign) totalBonus += 0.03;
    }
    // Absorption detection bonus — крупный игрок поглощает
    if (absorptionResult.detected && absorptionResult.direction === direction) {
      totalBonus += 0.05;
    }
    // Iceberg detection bonus — скрытый крупный ордер
    if (icebergResult.detected && icebergResult.direction === direction) {
      totalBonus += 0.04;
    }

    // Применяем бонусы с лимитом MAX_TOTAL_BONUS
    const cappedBonus = Math.min(totalBonus, MAX_TOTAL_BONUS);
    confidence = Math.min(0.95, confidence + cappedBonus);

    // Breakout confirmation: require 2/3 conditions in breakout mode
    if (detectedTradingMode === 'breakout') {
      const breakoutVolumeOk = currVol > avgVol20 * 1.5;
      const breakoutDomOk = Math.abs(obSignal.domScore) > 0.15;
      const breakoutDeltaOk = Math.abs(tapeSignal.delta) > 0.20;
      const breakoutConfirmations = [breakoutVolumeOk, breakoutDomOk, breakoutDeltaOk].filter(Boolean).length;
      if (breakoutConfirmations >= 2) {
        confidence = Math.min(0.95, confidence + 0.05);
      } else {
        confidence = Math.max(0.52, confidence - 0.08);
      }
    }

    // === BTC Correlation Filter ===
    // Используем уже загруженные данные BTC (если анализируем BTC — данные уже есть в mtfCandles)
    // Для альткоинов используем кэшированный тренд BTC (без дополнительных API запросов)
    // BTC тренд кэшируется на 60 секунд в btcCorrelation.ts
    if (!sym.toUpperCase().startsWith('BTC')) {
      try {
        // Пытаемся получить из кэша (без API запросов)
        const cachedBtcTrend = analyzeBtcTrend([], []);
        if (cachedBtcTrend.change1h !== 0 || cachedBtcTrend.change4h !== 0) {
          const btcResult = applyBtcCorrelation(sym, direction, confidence, cachedBtcTrend);
          confidence = btcResult.confidence;
        }
      } catch {
        // BTC data unavailable — skip
      }
    }

    // === Session-Aware Filter ===
    const sessionInfo = getCurrentSession();
    confidence = applySessionFilter(confidence, sessionInfo);
  }

  let fallbackReason: string | undefined;
  if (!confluence || !confluentDir) {
    const dirs = [obSignal.direction, tapeSignal.direction, candlesSignal.direction];
    let longCount = dirs.filter((d) => d === 'LONG').length;
    let shortCount = dirs.filter((d) => d === 'SHORT').length;
    // Freqtrade: HLHB и VolatilityBreakout добавляют вес направлению
    if (hlhbDir === 'LONG') longCount += 0.5; else if (hlhbDir === 'SHORT') shortCount += 0.5;
    if (volBreakout === 'LONG') longCount += 0.5; else if (volBreakout === 'SHORT') shortCount += 0.5;
    const hasConflict = (longCount > 0 && shortCount > 0);
    if (hasConflict) {
      direction = shortCount >= longCount ? 'SHORT' : 'LONG';
      const conflictStrength = Math.min(longCount, shortCount) / Math.max(longCount, shortCount);
      if (conflictStrength > 0.8) {
        confidence = 0.45;
        fallbackReason = `Сильный конфликт компонентов — направления почти равны, сигнал ненадёжен. Пропуск.`;
      } else {
        confidence = 0.50;
        fallbackReason = `Конфликт компонентов — направление по большинству (${direction}), conf ≤ 50%. Не рекомендуется к авто-входу.`;
      }
    } else if (shortCount > longCount) {
      direction = 'SHORT';
      confidence = Math.min(0.75, 0.6 + shortCount * 0.04);
      fallbackReason = `Fallback: направление по голосам компонентов (SHORT), без полной конfluence.`;
    } else {
      direction = 'LONG';
      confidence = Math.min(0.75, 0.6 + Math.max(longCount, 1) * 0.04);
      fallbackReason = `Fallback: направление по голосам компонентов (LONG), без полной конfluence.`;
    }
  }

  const breakdownInput = { ...signalResult, direction, confidence, reason: fallbackReason ?? signalResult.reason };
  const breakdown = buildAnalysisBreakdown(obSignal, tapeSignal, candlesSignal, breakdownInput);
  (breakdown as any).multiTF = { ...mtfResults, alignCount: mtfAlignCount };
  (breakdown as any).tapeWindows = tapeWindowResults;
  (breakdown as any).volatilityMultiplier = volatilityMultiplier; // Sinclair: уменьшить размер при высокой волатильности
  (breakdown as any).atrPct = atr != null && entryPrice > 0 ? atr / entryPrice : undefined; // для фильтра мин. волатильности в авто-цикле
  if (clusterData) {
    (breakdown as any).cluster = clusterData;
  }
  if (absorptionResult.detected) {
    (breakdown as any).absorption = absorptionResult;
  }
  if (icebergResult.detected) {
    (breakdown as any).iceberg = icebergResult;
  }
  if (consolidation.isConsolidating) {
    (breakdown as any).consolidation = consolidation;
  }
  (breakdown as any).tradingMode = detectedTradingMode;
  // BTC correlation and session info in breakdown (for UI display)
  const sessionInfo = getCurrentSession();
  (breakdown as any).session = { name: sessionInfo.session, description: sessionInfo.description, liquidityMultiplier: sessionInfo.liquidityMultiplier };

  const macd = candles5m.length ? candleAnalyzer.getMACD(candles5m.map((c) => c.close)) : null;
  const bb = candles5m.length ? candleAnalyzer.getBollingerBands(candles5m.map((c) => c.close)) : null;

  // Schwager: направление цены для detectFailedSignalHint (последние 5 свечей 5m)
  const priceDirection: 'up' | 'down' =
    candles5m.length >= 5
      ? candles5m[candles5m.length - 1].close >= candles5m[candles5m.length - 5].close
        ? 'up'
        : 'down'
      : 'up';

  // Фильтр SHORT после резкого падения (5m + 15m): не шортить вдогонку, риск отскока
  if (direction === 'SHORT' && entryPrice > 0) {
    if (candles5m.length >= SHARP_DROP_CANDLES) {
      const idx5 = candles5m.length - SHARP_DROP_CANDLES;
      const pastClose5 = candles5m[idx5]?.close;
      if (pastClose5 != null && pastClose5 > 0) {
        const dropPct5 = ((pastClose5 - entryPrice) / pastClose5) * 100;
        if (dropPct5 >= SHARP_DROP_PCT) {
          confidence = Math.max(0.45, confidence - SHARP_DROP_CONFIDENCE_PENALTY);
          if (!opts?.silent) logger.info('runAnalysis', 'confidence reduced: sharp drop before short (5m)', { symbol: sym, dropPct: dropPct5.toFixed(2), candles: SHARP_DROP_CANDLES });
        }
      }
    }
    if (candles15m.length >= SHARP_DROP_15M_CANDLES) {
      const idx15 = candles15m.length - SHARP_DROP_15M_CANDLES;
      const pastClose15 = candles15m[idx15]?.close;
      if (pastClose15 != null && pastClose15 > 0) {
        const dropPct15 = ((pastClose15 - entryPrice) / pastClose15) * 100;
        if (dropPct15 >= SHARP_DROP_15M_PCT) {
          confidence = Math.max(0.45, confidence - SHARP_DROP_15M_CONFIDENCE_PENALTY);
          if (!opts?.silent) logger.info('runAnalysis', 'confidence reduced: sharp drop before short (15m)', { symbol: sym, dropPct: dropPct15.toFixed(2), candles: SHARP_DROP_15M_CANDLES });
        }
      }
    }
  }

  // SHORT при восходящем движении (последние 5 свечей 5m вверх): не шортить против ралли
  if (direction === 'SHORT' && priceDirection === 'up') {
    confidence = Math.max(0.45, confidence - SHORT_AGAINST_UP_MOVE_PENALTY);
    if (!opts?.silent) logger.info('runAnalysis', 'confidence reduced: short against up move (5m)', { symbol: sym });
  }

  // Блокировка авто-входа при против HTF и низком confidence после штрафа
  (breakdown as any).blockEntryWhenAgainstHTF = againstHTF && confidence < AGAINST_HTF_MIN_CONFIDENCE;

  let signal = signalGenerator.generateSignal({
    symbol: sym.replace('-', '/'),
    exchange: 'OKX',
    direction,
    entryPrice,
    patterns: patterns.length ? patterns : ['none'],
    rsi: rsi ?? undefined,
    confidence,
    timeframe,
    mode,
    atr: atr ?? undefined,
    priceDirection,
    falseBreakoutRisk: falseBreakoutHint
  });
  const atrNorm = (atr != null && avgAtr != null && avgAtr > 0)
    ? Math.min(1, (atr / avgAtr) / 2)
    : undefined;
  const spreadNorm = obSignal.spreadPct != null
    ? Math.max(0, 1 - Math.min(1, obSignal.spreadPct / 0.5))
    : undefined;
  const mlFeatures = {
    confidence: signal.confidence ?? 0,
    direction: direction === 'LONG' ? 1 : 0,
    riskReward: signal.risk_reward ?? 1,
    triggersCount: (signal.triggers ?? []).length,
    rsiBucket: rsi != null ? (rsi < 35 ? 1 : rsi > 65 ? -1 : 0) : undefined,
    volumeConfirm: candlesSignal.volumeConfirm ? 1 : 0,
    atrNorm,
    spreadNorm
  };
  /** Каждый сигнал анализируется через внутреннюю ML-модель (confidence, R:R, ATR, спред и т.д.). В авто-цикле дополнительно используется внешний ИИ (OpenAI/Claude), если включён. */
  const aiWinProbability = mlPredict(mlFeatures);
  signal = {
    ...signal,
    confidence: Math.round(adjustConfidence(signal.confidence ?? 0, mlFeatures) * 100) / 100,
    aiWinProbability: Math.round(aiWinProbability * 1000) / 1000
  };
  (breakdown as any).aiWinProbability = aiWinProbability;
  if (!opts?.silent) {
    addSignal(signal);
    getBroadcastSignal()?.(signal, breakdown, opts?.userId);
  }
  return { signal, analysis: { patterns, rsi, macd: macd ?? undefined, bb: bb ?? undefined }, breakdown };
}

/** Проверка данных OKX перед анализом */
router.get('/analysis-preview/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const timeframe = (req.query.timeframe as string) || '5m';
    const sym = symbol;
    const [candles, orderBook, trades] = await Promise.all([
      aggregator.getOHLCV(sym, timeframe, 200),
      aggregator.getOrderBook(sym, 400),
      aggregator.getTrades(sym, 100)
    ]);
    const bestBid = orderBook.bids?.[0]?.[0];
    const bestAsk = orderBook.asks?.[0]?.[0];
    res.json({
      ok: true,
      symbol: sym,
      exchange: 'OKX',
      data: {
        candles: { count: candles.length, latest: candles[candles.length - 1] },
        orderBook: { bidsCount: orderBook.bids?.length ?? 0, asksCount: orderBook.asks?.length ?? 0, spread: bestBid && bestAsk ? ((bestAsk - bestBid) / ((bestBid + bestAsk) / 2) * 100).toFixed(4) + '%' : null },
        trades: { count: trades.length, sample: trades.slice(0, 3) }
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

router.post('/analyze/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const timeframe = (req.body?.timeframe as string) || '5m';
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const userId = token ? findSessionUserId(token) ?? undefined : undefined;
    const result = await runAnalysis(symbol, timeframe, 'default', { userId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const MAX_SYMBOLS = 6; // Меньше символов — быстрее цикл, меньше 429/таймаутов
/** Пороги авто-цикла берутся из config (MIN_CONFIDENCE, MIN_RR_RATIO в .env) */
const AUTO_SCORE_WEIGHTS = { confidence: 0.4, riskReward: 0.35, confluence: 0.1, aiProb: 0.15 }; // выше вес R:R — предпочитаем сделки с большим потенциалом

/** Преобразовать символ из скринера (BTC/USDT:USDT) в формат runAnalysis (BTC-USDT) */
function scannerSymbolToMarket(s: string): string {
  const base = s.split('/')[0]?.toUpperCase() || s;
  return base.includes('-') ? base : `${base}-USDT`;
}

/**
 * Полностью автоматический цикл: анализ всех пар, выбор лучшего сигнала.
 * Если useScanner === true — сначала получаем топ монет из скринера (волатильность, объём, BB squeeze).
 * TP/SL, leverage, mode — определяются по анализу (ATR, волатильность, confluence).
 */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 мин — при превышении новый цикл может стартовать (долгий цикл не блокирует очередь)
const QUEUED_LOG_COOLDOWN_MS = 180 * 1000; // не спамить лог «queued» чаще раза в 3 мин по ключу
const ANALYSIS_SYMBOL_TIMEOUT_MS = 90_000; // 90s на символ — защита от зависания при долгом ответе API/прокси
const BTC_FETCH_TIMEOUT_MS = 30_000; // 30s на загрузку свечей BTC
const SCANNER_TIMEOUT_MS = 25_000; // 25s на сканер — быстрее fallback на дефолтные символы при задержках
/** Фильтр SHORT после резкого падения (5m): число свечей и порог падения (%) — не шортить вдогонку */
const SHARP_DROP_CANDLES = 8;
const SHARP_DROP_PCT = 1.5;
const SHARP_DROP_CONFIDENCE_PENALTY = 0.10;
/** То же по 15m для максимального эффекта (старший ТФ подтверждает падение) */
const SHARP_DROP_15M_CANDLES = 4;
const SHARP_DROP_15M_PCT = 2;
const SHARP_DROP_15M_CONFIDENCE_PENALTY = 0.05;
/** SHORT при восходящем движении (последние 5 свечей 5m вверх): не шортить против текущего ралли */
const SHORT_AGAINST_UP_MOVE_PENALTY = 0.10;
/** Блокировка входа против HTF: мин. confidence после штрафа, иначе не передавать в авто-цикл */
const AGAINST_HTF_MIN_CONFIDENCE = 0.72;
/** AI gate bypass: мин. effectiveAiProb при strong technical, и мин. external AI score (0–1) */
const TECH_OVERRIDE_MIN_AI_PROB = 0.25;
const TECH_OVERRIDE_MIN_EXTERNAL_AI = 0.55;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timeout after ${ms / 1000}s`)), ms)
    )
  ]);
}
const userCycleLocks = new Map<string, { promise: Promise<void>; startedAt: number }>();
const pendingRuns = new Map<string, { symbols: string[]; timeframe: string; useScanner: boolean; userId?: string; execOpts?: Parameters<typeof runAutoTradingBestCycle>[4] }>();
const lastQueuedLogAt = new Map<string, number>();
const analysisSemaphore = new Semaphore(5);
const analysisCache = new TtlCache<Awaited<ReturnType<typeof runAnalysis>>>(30_000); // 30s cache — уменьшает нагрузку при частых циклах

async function runAutoTradingBestCycle(
  symbols: string[],
  timeframe = '5m',
  useScanner = false,
  userId?: string,
  execOpts?: { executeOrders: boolean; useTestnet: boolean; maxPositions: number; sizePercent: number; sizeMode?: 'percent' | 'risk'; riskPct?: number; leverage: number; tpMultiplier?: number; minAiProb?: number; density?: DensityOptions }
): Promise<void> {
  const lockKey = userId ?? '__global__';
  const existing = userCycleLocks.get(lockKey);
  if (existing) {
    const age = Date.now() - existing.startedAt;
    if (age > LOCK_TIMEOUT_MS) {
      userCycleLocks.delete(lockKey);
      logger.warn('runAutoTradingBestCycle', `Lock timeout for ${lockKey} (${Math.round(age / 1000)}s), cleared`);
    } else {
      pendingRuns.set(lockKey, { symbols, timeframe, useScanner, userId, execOpts });
      const now = Date.now();
      if (now - (lastQueuedLogAt.get(lockKey) ?? 0) >= QUEUED_LOG_COOLDOWN_MS) {
        lastQueuedLogAt.set(lockKey, now);
        logger.info('runAutoTradingBestCycle', 'Cycle queued (another run in progress)', { lockKey, ageSec: Math.round((Date.now() - existing.startedAt) / 1000) });
      }
      return;
    }
  }

  let releaseLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve; });
  const cycleStartedAt = Date.now();
  userCycleLocks.set(lockKey, { promise: lockPromise, startedAt: cycleStartedAt });

  try {
    await runAutoTradingBestCycleInner(symbols, timeframe, useScanner, userId, execOpts);
  } finally {
    const cycleDuration = Date.now() - cycleStartedAt;
    if (cycleDuration > 30_000) {
      logger.warn('runAutoTradingBestCycle', `Cycle for ${lockKey} took ${Math.round(cycleDuration / 1000)}s — consider increasing interval or reducing symbols`);
    }
    userCycleLocks.delete(lockKey);
    releaseLock();
    const pending = pendingRuns.get(lockKey);
    pendingRuns.delete(lockKey);
    if (pending) {
      logger.info('runAutoTradingBestCycle', `Running queued cycle for ${lockKey}`);
      runAutoTradingBestCycle(pending.symbols, pending.timeframe, pending.useScanner, pending.userId, pending.execOpts).catch((e) =>
        logger.error('runAutoTradingBestCycle', (e as Error).message)
      );
    }
  }
}

async function runAutoTradingBestCycleInner(
  symbols: string[],
  timeframe = '5m',
  useScanner = false,
  userId?: string,
  execOpts?: { executeOrders: boolean; useTestnet: boolean; maxPositions: number; sizePercent: number; sizeMode?: 'percent' | 'risk'; riskPct?: number; leverage: number; tpMultiplier?: number; minAiProb?: number; density?: DensityOptions }
): Promise<void> {
  logger.info('runAutoTradingBestCycle', 'Cycle started', { useScanner, symbolsCount: symbols.length, userId: userId ?? 'global' });
  let syms = symbols.slice(0, MAX_SYMBOLS);
  if (useScanner) {
    try {
      const { CoinScanner } = await import('../services/coinScanner');
      const scanner = new CoinScanner();
      const defaultSymbols = CoinScanner.getDefaultSymbols();
      const topCoins = await withTimeout(
        scanner.getTopCandidates(defaultSymbols, MAX_SYMBOLS, {
          minVolume24h: 300_000,
          minVolatility24h: 3.5,
          checkBBSqueeze: true,
          checkMomentum: true
        }),
        SCANNER_TIMEOUT_MS,
        'Scanner getTopCandidates'
      );
      const fromScanner = topCoins.map((c) => scannerSymbolToMarket(c.symbol)).filter(Boolean);
      if (fromScanner.length > 0) {
        syms = fromScanner;
        logger.info('runAutoTradingBestCycle', 'Scanner top symbols for analysis', { symbols: syms, topScores: topCoins.slice(0, 10).map((c) => ({ symbol: c.symbol, score: c.score })) });
      } else logger.warn('runAutoTradingBestCycle', 'Scanner returned no coins, using fallback symbols');
    } catch (e) {
      logger.warn('runAutoTradingBestCycle', (e as Error).message, { useScanner: true });
      // syms остаётся symbols.slice(0, MAX_SYMBOLS) — цикл продолжается с fallback
    }
  }
  if (syms.length === 0) syms = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
  logger.info('runAutoTradingBestCycle', 'Symbols for cycle', { count: syms.length, symbols: syms.slice(0, 10) });

  subscribeSymbols(syms.slice(0, 20)).catch(() => {});
  subscribeMarketSymbols(syms.slice(0, 6)).catch(() => {}); // свечи + тикер WS (до 48 каналов)

  const executeOrders = execOpts?.executeOrders ?? autoAnalyzeExecuteOrders;
  const useTestnet = execOpts?.useTestnet ?? autoAnalyzeUseTestnet;
  const maxPositions = execOpts?.maxPositions ?? autoAnalyzeMaxPositions;
  const sizePercent = execOpts?.sizePercent ?? autoAnalyzeSizePercent;
  const leverage = execOpts?.leverage ?? autoAnalyzeLeverage;
  const tpMultiplier = execOpts?.tpMultiplier ?? autoAnalyzeTpMultiplier;
  const minAiProb = Math.max(0, Math.min(1, execOpts?.minAiProb ?? 0));
  const sizeMode = execOpts?.sizeMode ?? 'percent';
  const riskPct = execOpts?.riskPct ?? 0.02;

  // Загружаем BTC тренд один раз за цикл (для BTC корреляции в runAnalysis)
  try {
    const [btcCandles1h, btcCandles4h] = await withTimeout(
      Promise.all([
        aggregator.getOHLCV('BTC-USDT', '1h', 25),
        aggregator.getOHLCV('BTC-USDT', '4h', 5)
      ]),
      BTC_FETCH_TIMEOUT_MS,
      'BTC candles'
    );
    analyzeBtcTrend(btcCandles1h, btcCandles4h); // Результат кэшируется на 60 секунд
  } catch (e) {
    if ((e as Error).message?.includes('timeout')) logger.warn('runAutoTradingBestCycle', (e as Error).message);
    /* BTC data unavailable — skip correlation */
  }

  const mlSamples = mlGetStats().samples;
  const results: Array<{ signal: Awaited<ReturnType<typeof runAnalysis>>['signal']; breakdown: any; score: number }> = [];
  const rejected: Array<{ sym: string; conf: number; rr: number; minVolOk: boolean; effectiveAiProb?: number }> = [];
  logger.info('runAutoTradingBestCycle', 'Starting analysis', { symbols: syms.length });
  await Promise.all(
    syms.map(async (sym) => {
      try {
        const cacheKey = `${sym}:${timeframe}:${userId ?? ''}`;
        const cached = analysisCache.get(cacheKey);
        let r: Awaited<ReturnType<typeof runAnalysis>>;
        if (cached) {
          r = cached;
        } else {
          await analysisSemaphore.acquire();
          let released = false;
          const doRelease = () => {
            if (!released) {
              released = true;
              analysisSemaphore.release();
            }
          };
          try {
            r = await withTimeout(
              runAnalysis(sym, timeframe, 'futures25x', { silent: true, userId }),
              ANALYSIS_SYMBOL_TIMEOUT_MS,
              `analysis ${sym}`
            );
          } finally {
            doRelease();
          }
          analysisCache.set(cacheKey, r);
        }
        const sig = r.signal;
        const conf = sig.confidence ?? 0;
        const rr = sig.risk_reward ?? 1;
        const alignCount = (r.breakdown as any)?.multiTF?.alignCount ?? 0;
        const confluenceBonus = Math.min(1.2, 0.9 + alignCount * 0.06);
        const aiProb = sig.aiWinProbability ?? 0.5;
        const effectiveAiProb = effectiveProbability(aiProb, mlSamples);
        const atrPct = (r.breakdown as any)?.atrPct as number | undefined;
        const minVolOk = atrPct == null || atrPct >= 0.001; // мин. волатильность 0.1% ATR
        const techOverride = conf >= 0.80 && rr >= 2.0;
        const aiGateOk = minAiProb <= 0 || mlSamples < MIN_SAMPLES_FOR_AI_GATE || effectiveAiProb >= minAiProb || techOverride;
        if (conf >= config.minConfidence && rr >= config.minRiskReward && minVolOk && aiGateOk) {
          const score =
            conf * AUTO_SCORE_WEIGHTS.confidence +
            Math.min(rr / 2.5, 1) * AUTO_SCORE_WEIGHTS.riskReward +
            confluenceBonus * AUTO_SCORE_WEIGHTS.confluence +
            aiProb * AUTO_SCORE_WEIGHTS.aiProb;
          results.push({ signal: sig, breakdown: r.breakdown, score });
        } else if (conf >= 0.5) {
          rejected.push({ sym, conf, rr, minVolOk, effectiveAiProb });
        }
      } catch (e) {
        logger.warn('runAutoTradingBestCycle', (e as Error).message, { symbol: sym });
      }
    })
  );
  logger.info('runAutoTradingBestCycle', 'Analysis complete', { results: results.length, rejected: rejected.length });
  if (results.length === 0) {
    const top = rejected.sort((a, b) => b.conf - a.conf).slice(0, 5);
    const aiHint = minAiProb > 0 && mlSamples >= MIN_SAMPLES_FOR_AI_GATE ? `, aiProb>=${(minAiProb * 100).toFixed(0)}%` : '';
    logger.info('runAutoTradingBestCycle', `No signals passed filter (conf>=${config.minConfidence * 100}%, rr>=${config.minRiskReward}${aiHint}). Top rejected: ${top.map((t) => `${t.sym} conf=${(t.conf * 100).toFixed(0)}% rr=${t.rr.toFixed(2)}${t.effectiveAiProb != null ? ` ai=${(t.effectiveAiProb * 100).toFixed(1)}%` : ''}`).join('; ')}`, { analyzed: syms.length });
    return;
  }
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  addSignal(best.signal);
  (best.breakdown as any).autoSettings = { leverage, sizePercent, minConfidence: Math.round(config.minConfidence * 100), minRiskReward: config.minRiskReward };
  getBroadcastSignal()?.(best.signal, best.breakdown, userId);
  logger.info('runAutoTradingBestCycle', `Best: ${best.signal.symbol} ${best.signal.direction} conf=${((best.signal.confidence ?? 0) * 100).toFixed(0)}% score=${best.score.toFixed(3)}`);

  const userCreds = userId ? getBitgetCredentials(userId) : null;
  const hasUserCreds = userCreds && (userCreds.apiKey ?? '').trim() && (userCreds.secret ?? '').trim();
  const canExecute = config.autoTradingExecutionEnabled && executeOrders && (config.bitget.hasCredentials || hasUserCreds);

  const setLastExecution = (
    err?: string,
    orderId?: string,
    skipReason?: string,
    aiInfo?: { aiProb: number; effectiveAiProb: number; externalAiScore?: number; externalAiUsed?: boolean }
  ) => {
    if (userId) {
      const entry: LastExecutionEntry = {
        lastError: err,
        lastSkipReason: skipReason,
        lastOrderId: orderId,
        useTestnet,
        at: Date.now()
      };
      if (aiInfo) {
        entry.lastAiProb = aiInfo.aiProb;
        entry.lastEffectiveAiProb = aiInfo.effectiveAiProb;
        if (aiInfo.externalAiScore != null) entry.lastExternalAiScore = aiInfo.externalAiScore;
        if (aiInfo.externalAiUsed != null) entry.lastExternalAiUsed = aiInfo.externalAiUsed;
      }
      lastExecutionByUser.set(userId, entry);
    }
  };

  const aiInfoForExecution = (extScore?: number | null, extUsed?: boolean) => ({
    aiProb,
    effectiveAiProb,
    externalAiScore: extScore ?? undefined,
    externalAiUsed: extUsed ?? false
  });

  if (!canExecute) {
    let reason = 'Исполнение отключено';
    if (!config.autoTradingExecutionEnabled) reason = 'Исполнение отключено на сервере (AUTO_TRADING_EXECUTION_ENABLED=0 в .env)';
    else if (!executeOrders) reason = 'Исполнение ордеров выключено (executeOrders=false). Перезапустите авто-торговлю с включённым исполнением.';
    else if (!config.bitget.hasCredentials && !hasUserCreds) reason = 'Нет ключей Bitget (добавьте в профиле или в .env BITGET_API_KEY/BITGET_SECRET)';
    logger.info('runAutoTradingBestCycle', `Execution skipped: ${reason}`, {
      userId,
      useTestnet,
      autoTradingExecutionEnabled: config.autoTradingExecutionEnabled,
      executeOrders,
      hasBitgetEnvCreds: config.bitget.hasCredentials,
      hasUserCreds: !!hasUserCreds
    });
    setLastExecution(reason);
    return;
  }

  /** Блокировка входа против HTF при низком confidence после штрафа */
  if ((best.breakdown as any)?.blockEntryWhenAgainstHTF) {
    const skipReason = 'Сигнал против старшего тренда (HTF), confidence ниже порога. Ордер не открыт.';
    logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol });
    setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(undefined, false));
    return;
  }

  /** Risk/Reward: не открывать при слабом R:R (чаще убытки). 100% в плюс невозможно — отсекаем худшие по R:R. */
  const rr = best.signal.risk_reward ?? 0;
  const aiProb = best.signal.aiWinProbability ?? 0;
  const effectiveAiProb = effectiveProbability(aiProb, mlSamples);
  let externalAiScore: number | null = null;
  let externalAiUsed = false;

  if (rr < config.minRiskReward) {
    const skipReason = `R:R ${rr.toFixed(2)} ниже минимума ${config.minRiskReward}. Ордер не открыт.`;
    logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol, rr });
    setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(undefined, false));
    return;
  }

  /** AI-анализ перед открытием: консервативная оценка при малом числе примеров; порог не блокирует при холодной модели. */
  const techOverride = rr >= 2.0 && (best.signal.confidence ?? 0) >= 0.80;
  if (minAiProb > 0 && !techOverride) {
    if (mlSamples < MIN_SAMPLES_FOR_AI_GATE) {
      logger.info('runAutoTradingBestCycle', `AI gate skipped: model cold (samples ${mlSamples} < ${MIN_SAMPLES_FOR_AI_GATE}). Порог minAiProb не применяется до накопления примеров.`, { symbol: best.signal.symbol, samples: mlSamples });
    } else if (effectiveAiProb < minAiProb) {
      const skipReason = `AI: вероятность выигрыша ${(effectiveAiProb * 100).toFixed(1)}% ниже порога ${(minAiProb * 100).toFixed(0)}%. Ордер не открыт.`;
      logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol, effectiveAiProb, minAiProb });
      setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(undefined, false));
      return;
    }
  } else if (techOverride && effectiveAiProb < minAiProb) {
    logger.info('runAutoTradingBestCycle', 'AI gate bypassed: strong technical (conf>=80%, rr>=2)', { symbol: best.signal.symbol, conf: (best.signal.confidence ?? 0) * 100, rr, effectiveAiProb: effectiveAiProb * 100 });
  }

  /** Внешний платный ИИ (OpenAI/Claude/GLM): дополнительная оценка. При blockOnLowScore=false не блокирует ордера. */
  const extAi = getExternalAiConfig();
  if (extAi.enabled && externalAiHasKey(extAi)) {
    externalAiUsed = true;
    logger.info('runAutoTradingBestCycle', 'External AI evaluation started', { symbol: best.signal.symbol });
    try {
      const evalResult = await externalAiEvaluate(best.signal);
      if (evalResult != null) externalAiScore = evalResult.score;
      if (extAi.blockOnLowScore && evalResult != null && evalResult.score < extAi.minScore) {
        const provLabel = evalResult.providers?.length ? evalResult.providers.join(' + ') : extAi.provider;
        const skipReason = `Внешний ИИ (${provLabel}): оценка ${(evalResult.score * 100).toFixed(0)}% ниже порога ${(extAi.minScore * 100).toFixed(0)}%. Ордер не открыт.`;
        logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol, score: evalResult.score, minScore: extAi.minScore });
        setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
        return;
      }
    } catch (e) {
      logger.warn('runAutoTradingBestCycle', 'External AI evaluation failed', { error: (e as Error).message });
    }
  }

  /** При обходе AI gate (strong technical) требуем мин. effectiveAiProb или мин. оценку внешнего ИИ */
  if (techOverride && effectiveAiProb < TECH_OVERRIDE_MIN_AI_PROB && (externalAiScore == null || externalAiScore < TECH_OVERRIDE_MIN_EXTERNAL_AI)) {
    const skipReason = `AI: при strong technical требуется effectiveAiProb >= ${(TECH_OVERRIDE_MIN_AI_PROB * 100).toFixed(0)}% или внешний ИИ >= ${(TECH_OVERRIDE_MIN_EXTERNAL_AI * 100).toFixed(0)}%. Ордер не открыт.`;
    logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol, effectiveAiProb: effectiveAiProb * 100, externalAiScore: externalAiScore != null ? externalAiScore * 100 : null });
    setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
    return;
  }

  /** OKX Funding Rate: не открывать LONG при высоком плюсе, SHORT при высоком минусе (MaksBaks Урок 5) */
  try {
    const fundingMonitor = new FundingRateMonitor();
    const funding = await fundingMonitor.getFundingRate(best.signal.symbol ?? '');
    if (funding) {
      const isLong = (best.signal.direction ?? 'LONG') === 'LONG';
      if (isLong && funding.shouldAvoidLong) {
        const skipReason = `Funding rate ${(funding.rate * 10000).toFixed(2)} bp — неблагоприятно для LONG. Ордер не открыт.`;
        logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol });
        setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
        return;
      }
      if (!isLong && funding.shouldAvoidShort) {
        const skipReason = `Funding rate ${(funding.rate * 10000).toFixed(2)} bp — неблагоприятно для SHORT. Ордер не открыт.`;
        logger.info('runAutoTradingBestCycle', skipReason, { symbol: best.signal.symbol });
        setLastExecution(undefined, undefined, skipReason, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
        return;
      }
    }
  } catch (e) {
    logger.warn('runAutoTradingBestCycle', 'Funding rate check failed', { error: (e as Error).message });
  }

  logger.info('runAutoTradingBestCycle', 'All checks passed, executing order...', {
    symbol: best.signal.symbol,
    direction: best.signal.direction,
    confidence: ((best.signal.confidence ?? 0) * 100).toFixed(0) + '%',
    externalAiScore: externalAiScore != null ? (externalAiScore * 100).toFixed(0) + '%' : 'N/A',
    useTestnet,
    sizePercent,
    leverage
  });

  subscribeSymbols([best.signal.symbol]).catch(() => {});
  subscribeMarketSymbols([best.signal.symbol]).catch(() => {});
  const volMult = (best.breakdown as any)?.volatilityMultiplier as number | undefined;
  executeSignal(best.signal, {
    sizePercent,
    sizeMode,
    riskPct,
    leverage,
    maxPositions,
    useTestnet,
    tpMultiplier,
    volatilityMultiplier: volMult,
    getOrderBook: (sym, limit) => aggregator.getOrderBook(sym, limit ?? 50),
    density: execOpts?.density
  }, hasUserCreds ? userCreds : undefined).then((result) => {
    if (result.ok) {
      logger.info('runAutoTradingBestCycle', `Bitget order placed: ${result.orderId} (${useTestnet ? 'testnet' : 'real'})`);
      setLastExecution(undefined, result.orderId, undefined, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
      if (userId && result.orderId) {
        try {
          initDb();
          insertOrder({
            id: `bitget-${result.orderId}-${Date.now()}`,
            clientId: userId,
            pair: best.signal.symbol,
            direction: best.signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
            size: result.positionSize ?? 0,
            leverage,
            openPrice: best.signal.entry_price ?? 0,
            stopLoss: best.signal.stop_loss ? Number(best.signal.stop_loss) : undefined,
            takeProfit: best.signal.take_profit != null
            ? (Array.isArray(best.signal.take_profit)
              ? (best.signal.take_profit as number[]).map(Number)
              : [Number(best.signal.take_profit)])
            : undefined,
            openTime: new Date().toISOString(),
            status: 'open',
            autoOpened: true,
            confidenceAtOpen: best.signal.confidence ? Number(best.signal.confidence) * 100 : undefined
          });
        } catch (e) {
          logger.warn('runAutoTradingBestCycle', 'insertOrder failed', { error: (e as Error).message });
        }
        if (userId !== ADMIN_POOL_CLIENT_ID) {
          import('../services/copyTradingService').then(({ copyOrderToSubscribers }) => {
            copyOrderToSubscribers(userId, best.signal, { sizePercent, leverage, maxPositions, useTestnet, tpMultiplier });
          }).catch((e) => logger.warn('runAutoTradingBestCycle', 'copyOrderToSubscribers failed', { error: (e as Error).message }));
        }
      }
    } else {
      const err = result.error ?? 'Unknown error';
      const isBalanceSkip = /Баланс ОКХ \(Real\) слишком мал|Недостаточно маржи|пополните счёт до \$\d+\+|No balance available/i.test(err);
      logger.warn('runAutoTradingBestCycle', `Bitget execution skipped: ${err}`);
      if (userId) {
        const cur = lastExecutionByUser.get(userId);
        setLastExecution(isBalanceSkip ? undefined : err, cur?.lastOrderId, isBalanceSkip ? err : undefined, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
      }
    }
  }).catch((e) => {
    const msg = (e as Error).message;
    logger.error('runAutoTradingBestCycle', 'Bitget execute failed', { error: msg });
    setLastExecution(msg, undefined, undefined, aiInfoForExecution(externalAiScore ?? undefined, externalAiUsed));
  });
}

/** Ручной режим: анализ по парам, при executeOrders — исполнение на OKX по тем же правилам, что и в Авто */
async function runManualCycle(
  syms: string[],
  timeframe: string,
  mode: string,
  userId: string,
  opts: {
    executeOrders: boolean;
    useTestnet: boolean;
    maxPositions: number;
    sizePercent: number;
    sizeMode: 'percent' | 'risk';
    riskPct: number;
    leverage: number;
    tpMultiplier: number;
    minAiProb: number;
    minConfidence?: number;
  }
): Promise<void> {
  const minConf = Math.max(0.5, Math.min(0.95, opts.minConfidence ?? 0.72));
  if (opts.executeOrders && !config.autoTradingExecutionEnabled) return;
  const creds = opts.executeOrders ? getBitgetCredentials(userId) : null;
  const hasCreds = creds && (creds.apiKey ?? '').trim() && (creds.secret ?? '').trim();
  if (opts.executeOrders && !hasCreds && !config.bitget.hasCredentials) return;

  const minAiProb = Math.max(0, Math.min(1, opts.minAiProb ?? 0));

  for (const sym of syms) {
    try {
      const r = await runAnalysis(sym, timeframe, mode, { userId });
      const sig = r?.signal;
      if (!sig || (sig.confidence ?? 0) < minConf || (sig.risk_reward ?? 1) < 1.2) continue;
      if (!opts.executeOrders || !creds) continue;

      const aiProb = sig.aiWinProbability ?? 0.5;
      const mlSamples = mlGetStats().samples;
      const effectiveAiProb = effectiveProbability(aiProb, mlSamples);
      let externalAiScore: number | null = null;
      let externalAiUsed = false;

      const aiInfo = () => ({ aiProb, effectiveAiProb, externalAiScore: externalAiScore ?? undefined, externalAiUsed });

      if (minAiProb > 0 && mlSamples >= MIN_SAMPLES_FOR_AI_GATE && effectiveAiProb < minAiProb) {
        const skipReason = `AI: вероятность ${(effectiveAiProb * 100).toFixed(1)}% ниже порога ${(minAiProb * 100).toFixed(0)}%. Ордер не открыт.`;
        logger.info('runManualCycle', skipReason, { symbol: sym, effectiveAiProb, minAiProb });
        setLastExecutionForUser(userId, undefined, undefined, skipReason, aiInfo());
        break;
      }

      const extAi = getExternalAiConfig();
      if (extAi.enabled && externalAiHasKey(extAi)) {
        externalAiUsed = true;
        try {
          const evalResult = await externalAiEvaluate(sig);
          if (evalResult != null) externalAiScore = evalResult.score;
          if (evalResult != null && evalResult.score < extAi.minScore) {
            const provLabel = evalResult.providers?.length ? evalResult.providers.join(' + ') : extAi.provider;
            const skipReason = `Внешний ИИ (${provLabel}): оценка ${(evalResult.score * 100).toFixed(0)}% ниже порога ${(extAi.minScore * 100).toFixed(0)}%. Ордер не открыт.`;
            logger.info('runManualCycle', skipReason, { symbol: sym, score: evalResult.score, minScore: extAi.minScore });
            setLastExecutionForUser(userId, undefined, undefined, skipReason, aiInfo());
            break;
          }
        } catch (e) {
          logger.warn('runManualCycle', 'External AI evaluation failed', { error: (e as Error).message });
        }
      }

      await executeSignal(
        sig,
        {
          sizePercent: opts.sizePercent,
          leverage: opts.leverage,
          maxPositions: opts.maxPositions,
          useTestnet: opts.useTestnet,
          tpMultiplier: opts.tpMultiplier,
          sizeMode: opts.sizeMode,
          riskPct: opts.riskPct
        },
        { apiKey: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase ?? '' }
      ).then((res) => {
        if (res.ok) logger.info('runManualCycle', 'Order executed', { symbol: sym, orderId: res.orderId });
        setLastExecutionForUser(userId, res.ok ? undefined : (res.error ?? 'Unknown'), res.orderId, undefined, aiInfo());
      }).catch((e) => {
        setLastExecutionForUser(userId, (e as Error).message, undefined, undefined, aiInfo());
      });
      break; // один ордер за цикл в ручном режиме
    } catch (e) {
      logger.error('auto-analyze', (e as Error).message, { sym });
    }
  }
}

export function startAutoAnalyzeForUser(userId: string, body: Record<string, unknown>): { status: string; symbols: string[]; timeframe: string; intervalMs: number; mode: string; fullAuto: boolean; useScanner?: boolean; executeOrders?: boolean; useTestnet?: boolean } {
  const existing = autoAnalyzeByUser.get(userId);
  if (existing?.timer) {
    clearInterval(existing.timer);
    autoAnalyzeByUser.delete(userId);
  }

  const symbolsRaw = body?.symbols ?? body?.symbol;
  const symbols: string[] = Array.isArray(symbolsRaw)
    ? symbolsRaw.slice(0, MAX_SYMBOLS).map((s: string) => String(s || '').replace(/_/g, '-')).filter(Boolean)
    : [String(symbolsRaw || 'BTC-USDT').replace(/_/g, '-')];
  let syms = [...new Set(symbols)].slice(0, MAX_SYMBOLS);
  if (syms.length === 0) syms = ['BTC-USDT'];
  const timeframe = (body?.timeframe as string) || '5m';
  const mode = (body?.mode as string) || 'default';
  const intervalMs = Math.max(30000, Math.min(300000, parseInt(String(body?.intervalMs)) || 60000));
  const fullAuto = Boolean(body?.fullAuto);
  const useScanner = Boolean(body?.useScanner);
  const executeOrders = Boolean(body?.executeOrders);
  /** По умолчанию авто только на реальном счёте; демо — только при явном useTestnet: true (Демо режим) */
  const useTestnet = body?.useTestnet === true;
  const maxPositions = Math.max(1, Math.min(20, parseInt(String(body?.maxPositions)) || 5));
  const sizePercent = Math.max(1, Math.min(50, parseInt(String(body?.sizePercent)) || 25));
  const leverage = Math.max(1, Math.min(125, parseInt(String(body?.leverage)) || 25));
  const tpMultiplier = Math.max(0.5, Math.min(1, parseFloat(String(body?.tpMultiplier)) || 0.85));
  const minAiProb = Math.max(0, Math.min(1, parseFloat(String(body?.minAiProb)) || 0));
  const sizeMode = body?.sizeMode === 'risk' ? 'risk' : 'percent';
  const riskPct = Math.max(0.01, Math.min(0.03, parseFloat(String(body?.riskPct)) || 0.02));
  const minConfidence = body?.minConfidence != null ? Math.max(0.5, Math.min(0.95, Number(body.minConfidence))) : undefined;
  const densityBody = body?.density as Record<string, number> | undefined;
  const densityOpts: DensityOptions | undefined = densityBody
    ? {
        maxSpreadPct: densityBody.maxSpreadPct,
        minDepthUsd: densityBody.minDepthUsd,
        maxPriceDeviationPct: densityBody.maxPriceDeviationPct,
        maxSizeVsLiquidityPct: densityBody.maxSizeVsLiquidityPct
      }
    : undefined;

  autoAnalyzeExecuteOrders = executeOrders;
  autoAnalyzeUseTestnet = useTestnet;
  autoAnalyzeMaxPositions = maxPositions;
  autoAnalyzeSizePercent = sizePercent;
  autoAnalyzeLeverage = leverage;
  autoAnalyzeTpMultiplier = tpMultiplier;
  autoAnalyzeMinAiProb = minAiProb;

  const bodyToPersist: Record<string, unknown> = {
    symbols: syms,
    timeframe,
    mode,
    intervalMs,
    fullAuto,
    useScanner,
    executeOrders,
    useTestnet,
    maxPositions,
    sizePercent,
    leverage,
    tpMultiplier,
    minAiProb,
    sizeMode,
    riskPct,
    ...(minConfidence != null ? { minConfidence } : {}),
    ...(densityOpts ? { density: densityOpts } : {})
  };
  try {
    const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
    let sessions: Array<{ userId: string; body: Record<string, unknown> }> = [];
    if (raw) {
      try {
        sessions = JSON.parse(raw);
      } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
    }
    sessions = sessions.filter((s) => s.userId !== userId);
    sessions.push({ userId, body: bodyToPersist });
    setSetting(AUTO_ANALYZE_STATE_KEY, JSON.stringify(sessions));
  } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }

  const runAll = () => {
    const state = autoAnalyzeByUser.get(userId);
    if (state) state.lastCycleAt = Date.now();
    if (fullAuto) {
      runAutoTradingBestCycle(syms, timeframe, useScanner, userId, {
        executeOrders: fullAuto && executeOrders,
        useTestnet,
        maxPositions,
        sizePercent,
        sizeMode,
        riskPct,
        leverage,
        tpMultiplier,
        minAiProb,
        density: densityOpts
      }).catch((e) => logger.error('auto-analyze', (e as Error).message));
    } else {
      runManualCycle(syms, timeframe, mode, userId, {
        executeOrders,
        useTestnet,
        maxPositions,
        sizePercent,
        sizeMode,
        riskPct,
        leverage,
        tpMultiplier,
        minAiProb,
        minConfidence
      }).catch((e) => logger.error('auto-analyze', (e as Error).message));
    }
  };
  const now = Date.now();
  const timer = setInterval(runAll, intervalMs);
  autoAnalyzeByUser.set(userId, {
    timer,
    intervalMs,
    lastCycleAt: now,
    executeOrders,
    useTestnet,
    maxPositions,
    sizePercent,
    sizeMode,
    riskPct,
    leverage,
    tpMultiplier,
    minAiProb,
    fullAuto
  });
  runAll();
  return {
    status: 'started',
    symbols: syms,
    timeframe,
    intervalMs,
    mode,
    fullAuto,
    useScanner: fullAuto ? useScanner : undefined,
    executeOrders: fullAuto ? executeOrders : undefined,
    useTestnet: fullAuto ? useTestnet : undefined
  };
}

const autoAnalyzeStartLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });
router.post('/auto-analyze/start', autoAnalyzeStartLimit, requireAuth, validateBody(autoAnalyzeStartSchema), (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const body = { ...req.body, ...(req as any).validatedBody };
    const result = startAutoAnalyzeForUser(userId, body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export function stopAutoAnalyze(userId?: string): void {
  if (userId) {
    const state = autoAnalyzeByUser.get(userId);
    if (state?.timer) {
      clearInterval(state.timer);
      autoAnalyzeByUser.delete(userId);
    }
    try {
      const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
      if (raw) {
        const sessions = (JSON.parse(raw) as Array<{ userId: string; body: Record<string, unknown> }>).filter((s) => s.userId !== userId);
        setSetting(AUTO_ANALYZE_STATE_KEY, JSON.stringify(sessions));
      }
    } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
  } else {
    autoAnalyzeByUser.forEach((state) => clearInterval(state.timer));
    autoAnalyzeByUser.clear();
    try {
      setSetting(AUTO_ANALYZE_STATE_KEY, '[]');
    } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
  }
}

router.post('/auto-analyze/stop', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  stopAutoAnalyze(userId);
  res.json({ status: 'stopped' });
});

/** Восстановить авто-торговлю после перезапуска сервера (из сохранённого состояния в БД) */
export function restoreAutoTradingState(): void {
  try {
    const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
    if (!raw) {
      logger.info('auto-analyze', 'No saved auto-trading state found — start auto-trading from UI');
      return;
    }
    const sessions = JSON.parse(raw) as Array<{ userId: string; body: Record<string, unknown> }>;
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    for (const { userId, body } of sessions) {
      if (userId && body && typeof body === 'object') {
        const execOrders = Boolean(body.executeOrders);
        const testnet = body.useTestnet === true;
        const fullAuto = Boolean(body.fullAuto);
        logger.info('auto-analyze', 'Restoring auto-trading after restart', {
          userId,
          executeOrders: execOrders,
          useTestnet: testnet,
          fullAuto,
          symbols: body.symbols,
          intervalMs: body.intervalMs
        });
        if (!execOrders) {
          logger.warn('auto-analyze', `User ${userId}: executeOrders=false in saved state — orders will NOT be placed. Re-start auto-trading with executeOrders=true to enable.`);
        }
        startAutoAnalyzeForUser(userId, body);
      }
    }
  } catch (e) {
    logger.warn('auto-analyze', 'Restore failed: ' + (e as Error).message);
  }
}

export function getAutoAnalyzeStatus(userId?: string): { running: boolean; lastCycleAt?: number; intervalMs?: number } {
  if (userId) {
    const state = autoAnalyzeByUser.get(userId);
    if (state?.timer) return { running: true, lastCycleAt: state.lastCycleAt, intervalMs: state.intervalMs };
    return { running: false };
  }
  return { running: autoAnalyzeByUser.size > 0 };
}

export function getLastExecution(userId: string): Record<string, unknown> {
  const last = lastExecutionByUser.get(userId);
  if (!last) return {};
  return {
    lastError: last.lastError,
    lastSkipReason: last.lastSkipReason,
    lastOrderId: last.lastOrderId,
    useTestnet: last.useTestnet,
    at: last.at,
    lastAiProb: last.lastAiProb,
    lastEffectiveAiProb: last.lastEffectiveAiProb,
    lastExternalAiScore: last.lastExternalAiScore,
    lastExternalAiUsed: last.lastExternalAiUsed
  };
}

router.get('/auto-analyze/status', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  res.json(getAutoAnalyzeStatus(userId));
});

/** Результат последнего исполнения (ордер или причина пропуска) для отображения на странице авто-торговли */
router.get('/auto-analyze/last-execution', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const last = lastExecutionByUser.get(userId);
  if (!last) return res.json({});
  return res.json({
    lastError: last.lastError,
    lastSkipReason: last.lastSkipReason,
    lastOrderId: last.lastOrderId,
    useTestnet: last.useTestnet,
    at: last.at,
    lastAiProb: last.lastAiProb,
    lastEffectiveAiProb: last.lastEffectiveAiProb,
    lastExternalAiScore: last.lastExternalAiScore,
    lastExternalAiUsed: last.lastExternalAiUsed
  });
});

/** Тестовый сигнал для проверки потока (демо). Не исполняется на OKX. */
router.post('/test-signal', requireAuth, (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const symbol = (req.body?.symbol as string) || 'BTC-USDT';
    const direction = (req.body?.direction as 'LONG' | 'SHORT') || 'LONG';
    const entryPrice = Number(req.body?.entryPrice) || 97000;
    const slPct = 0.01;
    const tpPct = 0.02;
    const stopLoss = direction === 'LONG' ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
    const takeProfit1 = direction === 'LONG' ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct);
    const signal: import('../types/signal').TradingSignal = {
      id: `sig_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: symbol.replace('_', '-'),
      exchange: 'OKX',
      direction,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: [takeProfit1, takeProfit1 * (direction === 'LONG' ? 1.02 : 0.98)],
      risk_reward: 2,
      confidence: 0.92,
      timeframe: '5m',
      triggers: ['test_signal'],
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      trailing_stop_config: {
        initial_stop: stopLoss,
        trail_step_pct: 0.003,
        activation_profit_pct: 0.01
      }
    };
    addSignal(signal);
    getBroadcastSignal()?.(signal, { autoSettings: { test: true } }, userId);
    res.json({ ok: true, signal });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PNL калькулятор — расчёт прибыли/убытка, ROE, объёма позиции, ликвидации (freqtrade formula + buffer) */
router.post('/pnl-calc', (req, res) => {
  try {
    const { direction, entryPrice, exitPrice, margin, leverage, usdRubRate } = req.body || {};
    const dir = (direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';
    const entry = Number(entryPrice) || 0;
    const exit = Number(exitPrice) || 0;
    const marg = Number(margin) || 0;
    const lev = Math.max(1, Math.min(125, Number(leverage) || 1));
    const rubRate = Number(usdRubRate) || 100;

    if (entry <= 0 || marg <= 0) {
      return res.status(400).json({ error: 'entryPrice и margin должны быть > 0' });
    }

    const positionVolume = marg * lev;
    let pnlUsd: number;
    if (dir === 'LONG') {
      pnlUsd = positionVolume * (exit - entry) / entry;
    } else {
      pnlUsd = positionVolume * (entry - exit) / entry;
    }
    const roe = marg > 0 ? (pnlUsd / marg) * 100 : 0;
    const liquidationPrice = calcLiquidationPrice(entry, lev, dir);

    const liqSimple = calcLiquidationPriceSimple(entry, lev, dir);
    res.json({
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlRub: Math.round(pnlUsd * rubRate * 100) / 100,
      roe: Math.round(roe * 100) / 100,
      positionVolume: Math.round(positionVolume * 100) / 100,
      liquidationPrice: Math.round(liquidationPrice * 100) / 100,
      liquidationPriceSimple: Math.round(liqSimple * 100) / 100,
      status: pnlUsd >= 0 ? 'PROFIT' : 'LOSS',
      direction: dir,
      currency: 'USD'
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Анализ сигналов за период (например «за ночь») — статистика и рекомендации для корректного открытия */
router.get('/signals-night', (req, res) => {
  try {
    const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours)) || 12));
    const limit = Math.min(500, parseInt(String(req.query.limit)) || 200);
    const signals = getSignalsSince(hours, limit);

    const longSignals = signals.filter((s) => s.direction === 'LONG');
    const shortSignals = signals.filter((s) => s.direction === 'SHORT');
    const avgConfidence = signals.length
      ? signals.reduce((a, s) => a + (s.confidence ?? 0), 0) / signals.length
      : 0;
    const bySymbol: Record<string, { long: number; short: number; avgConf: number }> = {};
    for (const s of signals) {
      const sym = s.symbol || 'unknown';
      if (!bySymbol[sym]) bySymbol[sym] = { long: 0, short: 0, avgConf: 0 };
      if (s.direction === 'LONG') bySymbol[sym].long++;
      else bySymbol[sym].short++;
      bySymbol[sym].avgConf = (bySymbol[sym].avgConf * (bySymbol[sym].long + bySymbol[sym].short - 1) + (s.confidence ?? 0)) / (bySymbol[sym].long + bySymbol[sym].short);
    }

    const highConf = signals.filter((s) => (s.confidence ?? 0) >= 0.82).length;
    const lowConf = signals.filter((s) => (s.confidence ?? 0) < 0.6).length;

    const suggestions: string[] = [];
    if (signals.length > 0) {
      if (avgConfidence < 0.72) suggestions.push('Повысить минимальный порог confidence для авто-входа (рекомендуется ≥ 82%).');
      if (lowConf > 0) suggestions.push('Часть сигналов имела низкую уверенность — не открывать сделки при confidence < 60%.');
      if (highConf < signals.length * 0.5) suggestions.push('Мало сигналов с высокой уверенностью — дождаться конfluence 3/3 или 4+ таймфреймов.');
      if (longSignals.length > 0 && shortSignals.length > 0) suggestions.push('И LONG, и SHORT за период — учитывать HTF и не входить против старшего тренда.');
    }

    res.json({
      periodHours: hours,
      total: signals.length,
      long: longSignals.length,
      short: shortSignals.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      highConfidenceCount: highConf,
      lowConfidenceCount: lowConf,
      bySymbol,
      signals: signals.slice(0, 50),
      suggestions
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Анализ закрытых сделок за ночь: обновление ML и рекомендации по корректному открытию */
router.post('/analyze-trades', (req, res) => {
  try {
    const body = req.body || {};
    const trades = Array.isArray(body.trades) ? body.trades : [];
    let wins = 0;
    let losses = 0;
    const byDirection: { LONG: { win: number; loss: number }; SHORT: { win: number; loss: number } } = {
      LONG: { win: 0, loss: 0 },
      SHORT: { win: 0, loss: 0 }
    };

    for (const t of trades) {
      const pnl = Number(t.pnl) ?? 0;
      const win = pnl > 0;
      if (win) wins++;
      else losses++;

      const direction = (t.direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';
      if (win) byDirection[direction].win++;
      else byDirection[direction].loss++;

      const features = {
        confidence: Number(t.confidence) ?? 0.7,
        direction: direction === 'LONG' ? 1 : 0,
        riskReward: Number(t.riskReward) ?? 2,
        triggersCount: Array.isArray(t.triggers) ? t.triggers.length : 0,
        rsiBucket: t.rsi != null ? (Number(t.rsi) < 30 ? 1 : Number(t.rsi) > 70 ? -1 : 0) : undefined,
        volumeConfirm: t.volumeConfirm === true ? 1 : t.volumeConfirm === false ? 0 : undefined
      };
      mlUpdate(features, win);
    }

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const longWinRate = byDirection.LONG.win + byDirection.LONG.loss > 0
      ? (byDirection.LONG.win / (byDirection.LONG.win + byDirection.LONG.loss)) * 100
      : null;
    const shortWinRate = byDirection.SHORT.win + byDirection.SHORT.loss > 0
      ? (byDirection.SHORT.win / (byDirection.SHORT.win + byDirection.SHORT.loss)) * 100
      : null;

    const suggestions: string[] = [];
    if (total > 0) {
      if (winRate < 50) suggestions.push('Общий Win Rate < 50% — повысить min confidence до 85% или реже входить при конфликте компонентов.');
      if (longWinRate != null && longWinRate < 45) suggestions.push('LONG сделки показывают низкий Win Rate — усилить фильтр по HTF и объёму перед входом в LONG.');
      if (shortWinRate != null && shortWinRate > 55) suggestions.push('SHORT сделки работают лучше — при равном confluence можно предпочитать SHORT.');
      if (total >= 5) suggestions.push('Модель ML обновлена по исходам — следующие сигналы будут скорректированы с учётом истории.');
    }

    logger.info('analyze-trades', `Processed ${total} trades, wins=${wins}, winRate=${winRate.toFixed(0)}%`);

    res.json({
      ok: true,
      processed: total,
      wins,
      losses,
      winRatePct: Math.round(winRate * 10) / 10,
      byDirection: { LONG: byDirection.LONG, SHORT: byDirection.SHORT, longWinRatePct: longWinRate != null ? Math.round(longWinRate * 10) / 10 : null, shortWinRatePct: shortWinRate != null ? Math.round(shortWinRate * 10) / 10 : null },
      suggestions
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
