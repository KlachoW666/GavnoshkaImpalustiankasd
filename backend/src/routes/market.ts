import { Router } from 'express';
import { DataAggregator } from '../services/dataAggregator';
import { getBroadcastSignal } from '../websocket';
import { CandleAnalyzer } from '../services/candleAnalyzer';
import { SignalGenerator } from '../services/signalGenerator';
import { addSignal } from './signals';
import { CandlePattern } from '../types/candle';
import {
  analyzeOrderBook,
  analyzeTape,
  analyzeCandles,
  computeSignal,
  buildAnalysisBreakdown
} from '../services/marketAnalysis';
import { config } from '../config';
import { normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';
import { VOLUME_BREAKOUT_MULTIPLIER } from '../lib/tradingPrinciples';
import { FundamentalFilter } from '../services/fundamentalFilter';

const router = Router();
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

function detectThreeWhiteSoldiers(candles: { open: number; high: number; close: number }[]): boolean {
  if (candles.length < 3) return false;
  const [a, b, c] = candles.slice(-3);
  return a.close > a.open && b.close > b.open && c.close > c.open &&
    b.high > a.high && c.high > b.high && a.close < b.open && b.close < c.open;
}

let autoAnalyzeTimer: NodeJS.Timeout | null = null;

function candlesFor48h(timeframe: string): number {
  const needed = config.timeframes[timeframe] ?? 192;
  return Math.min(Math.max(needed, 100), config.limits.candles);
}

/** Лимиты свечей для глубокого Multi-TF анализа (HTF-first) */
const MTF_LIMITS: Record<string, number> = { '1m': 500, '5m': 600, '15m': 400, '1h': 250, '4h': 150, '1d': 150 };

/** Веса: HTF (1d, 4h) определяют тренд, MTF (1h) — подтверждение, LTF (15m, 5m, 1m) — вход */
const MTF_WEIGHTS: Record<string, number> = { '1d': 0.25, '4h': 0.20, '1h': 0.20, '15m': 0.15, '5m': 0.10, '1m': 0.10 };

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

export async function runAnalysis(symbol: string, timeframe = '5m', mode = 'default', opts?: { silent?: boolean }) {
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

  const obValid = (orderBook.bids?.length ?? 0) >= 5 && (orderBook.asks?.length ?? 0) >= 5;
  const tradesValid = (trades?.length ?? 0) >= 5;
  if (!obValid || !tradesValid) {
    logger.warn('runAnalysis', 'Weak OKX data', { symbol: sym, ob: `${orderBook.bids?.length ?? 0}/${orderBook.asks?.length ?? 0}`, trades: trades?.length ?? 0 });
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
  const patterns = detectPatterns(candles5m, candleAnalyzer);
  const lastC5 = candles5m[candles5m.length - 1];
  const highVolatility = lastC5 && lastC5.close > 0
    ? (lastC5.high - lastC5.low) / lastC5.close > 0.03
    : false;
  const candlesSignal = {
    direction: mtfDir !== 'NEUTRAL' ? mtfDir : (Object.values(mtfResults)[0]?.direction as 'LONG' | 'SHORT') ?? 'NEUTRAL',
    score: mtfScore,
    volumeConfirm: candles5m.length >= 20 &&
      (candles5m[candles5m.length - 1]?.volume ?? 0) > candles5m.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20 * VOLUME_BREAKOUT_MULTIPLIER,
    bbSqueeze: false,
    patterns,
    rsi,
    emaTrend: null as 'bullish' | 'bearish' | null,
    highVolatility
  };
  const atr = candleAnalyzer.getATR(candles5m);

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
      highVolatility: candlesSignal.highVolatility
    }
  );
  const { direction: confluentDir, confidence: confluentConf, confluence } = signalResult;

  let direction: 'LONG' | 'SHORT' = 'LONG';
  let confidence = 0.65;

  if (confluence && confluentDir) {
    direction = confluentDir;
    confidence = confluentConf;

    // Multi-TF alignment bonus — 6 TFs (1d, 4h, 1h, 15m, 5m, 1m) в одном направлении
    // Корректировка: требуем 4+ TFs для высокого confidence, строже за 2–3
    if (mtfAlignCount >= 5) confidence = Math.min(0.96, confidence + 0.10);
    else if (mtfAlignCount >= 4) confidence = Math.min(0.95, confidence + 0.06);
    else if (mtfAlignCount >= 3) confidence = Math.min(0.90, confidence + 0.02);
    if (mtfAlignCount < 3 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.max(0.55, confidence - 0.08);
    }
    if (mtfAlignCount < 4 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.min(confidence, 0.88);
    }
    // Усиленный штраф против HTF — часто приводит к убыткам
    if (againstHTF) confidence = Math.max(0.50, Math.min(confidence - 0.15, 0.70));
  }

  if (!confluence || !confluentDir) {
    const dirs = [obSignal.direction, tapeSignal.direction, candlesSignal.direction];
    const longCount = dirs.filter((d) => d === 'LONG').length;
    const shortCount = dirs.filter((d) => d === 'SHORT').length;
    const hasConflict = (longCount > 0 && shortCount > 0);
    if (hasConflict) {
      direction = longCount > shortCount ? 'LONG' : 'SHORT';
      confidence = 0.62;
    } else if (shortCount > longCount) {
      direction = 'SHORT';
      confidence = Math.min(0.75, 0.6 + shortCount * 0.04);
    } else {
      direction = 'LONG';
      confidence = Math.min(0.75, 0.6 + Math.max(longCount, 1) * 0.04);
    }
  }

  const breakdownInput = { ...signalResult, direction, confidence };
  const breakdown = buildAnalysisBreakdown(obSignal, tapeSignal, candlesSignal, breakdownInput);
  (breakdown as any).multiTF = { ...mtfResults, alignCount: mtfAlignCount };
  (breakdown as any).tapeWindows = tapeWindowResults;

  const macd = candles5m.length ? candleAnalyzer.getMACD(candles5m.map((c) => c.close)) : null;
  const bb = candles5m.length ? candleAnalyzer.getBollingerBands(candles5m.map((c) => c.close)) : null;

  // Schwager: направление цены для detectFailedSignalHint (последние 5 свечей 5m)
  const priceDirection: 'up' | 'down' =
    candles5m.length >= 5
      ? candles5m[candles5m.length - 1].close >= candles5m[candles5m.length - 5].close
        ? 'up'
        : 'down'
      : 'up';

  const signal = signalGenerator.generateSignal({
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
    priceDirection
  });
  if (!opts?.silent) {
    addSignal(signal);
    getBroadcastSignal()?.(signal, breakdown);
  }
  return { signal, analysis: { patterns, rsi, macd: macd ?? undefined, bb: bb ?? undefined }, breakdown };
}

/** Проверка данных OKX перед анализом */
router.get('/analysis-preview/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || 'BTC-USDT').replace(/_/g, '-');
    const timeframe = (req.query.timeframe as string) || '5m';
    const sym = symbol.replace(/_/g, '-');
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
    const symbol = (req.params.symbol || 'BTC-USDT').replace(/_/g, '-');
    const timeframe = (req.body?.timeframe as string) || '5m';
    const result = await runAnalysis(symbol, timeframe);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const MAX_SYMBOLS = 5;
const AUTO_MIN_CONFIDENCE = 0.62;
const AUTO_SCORE_WEIGHTS = { confidence: 0.5, riskReward: 0.35, confluence: 0.15 };

/**
 * Полностью автоматический цикл: анализ всех пар, выбор лучшего сигнала.
 * TP/SL, leverage, mode — определяются по анализу (ATR, волатильность, confluence).
 */
async function runAutoTradingBestCycle(symbols: string[], timeframe = '5m'): Promise<void> {
  const results: Array<{ signal: Awaited<ReturnType<typeof runAnalysis>>['signal']; breakdown: any; score: number }> = [];
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await runAnalysis(sym, timeframe, 'futures25x', { silent: true });
        const sig = r.signal;
        const conf = sig.confidence ?? 0;
        const rr = sig.risk_reward ?? 1;
        const alignCount = (r.breakdown as any)?.multiTF?.alignCount ?? 0;
        const confluenceBonus = Math.min(1.2, 0.9 + alignCount * 0.06);
        if (conf >= AUTO_MIN_CONFIDENCE) {
          const score =
            conf * AUTO_SCORE_WEIGHTS.confidence +
            Math.min(rr / 3, 1) * AUTO_SCORE_WEIGHTS.riskReward +
            confluenceBonus * AUTO_SCORE_WEIGHTS.confluence;
          results.push({ signal: sig, breakdown: r.breakdown, score });
        }
      } catch (e) {
        logger.warn('runAutoTradingBestCycle', (e as Error).message, { symbol: sym });
      }
    })
  );
  if (results.length === 0) return;
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  addSignal(best.signal);
  (best.breakdown as any).autoSettings = { leverage: 15, sizePercent: 5, minConfidence: 65 };
  getBroadcastSignal()?.(best.signal, best.breakdown);
  logger.info('runAutoTradingBestCycle', `Best: ${best.signal.symbol} ${best.signal.direction} conf=${((best.signal.confidence ?? 0) * 100).toFixed(0)}% score=${best.score.toFixed(3)}`);
}

router.post('/auto-analyze/start', (req, res) => {
  if (autoAnalyzeTimer) {
    res.json({ status: 'already_running' });
    return;
  }
  const symbolsRaw = req.body?.symbols ?? req.body?.symbol;
  const symbols: string[] = Array.isArray(symbolsRaw)
    ? symbolsRaw.slice(0, MAX_SYMBOLS).map((s: string) => String(s || '').replace(/_/g, '-')).filter(Boolean)
    : [String(symbolsRaw || 'BTC-USDT').replace(/_/g, '-')];
  const syms = [...new Set(symbols)].slice(0, MAX_SYMBOLS);
  if (syms.length === 0) syms.push('BTC-USDT');
  const timeframe = (req.body?.timeframe as string) || '5m';
  const mode = (req.body?.mode as string) || 'default';
  const intervalMs = Math.max(30000, Math.min(300000, parseInt(String(req.body?.intervalMs)) || 60000));
  const fullAuto = Boolean(req.body?.fullAuto);

  const runAll = () => {
    if (fullAuto) {
      runAutoTradingBestCycle(syms, timeframe).catch((e) => logger.error('auto-analyze', (e as Error).message));
    } else {
      for (const sym of syms) {
        runAnalysis(sym, timeframe, mode).catch((e) => logger.error('auto-analyze', (e as Error).message));
      }
    }
  };
  runAll();
  autoAnalyzeTimer = setInterval(runAll, intervalMs);
  res.json({ status: 'started', symbols: syms, timeframe, intervalMs, mode, fullAuto });
});

router.post('/auto-analyze/stop', (_req, res) => {
  if (autoAnalyzeTimer) {
    clearInterval(autoAnalyzeTimer);
    autoAnalyzeTimer = null;
  }
  res.json({ status: 'stopped' });
});

/** PNL калькулятор — расчёт прибыли/убытка, ROE, объёма позиции, ликвидации */
router.post('/pnl-calc', (req, res) => {
  try {
    const { direction, entryPrice, exitPrice, margin, leverage, usdRubRate } = req.body || {};
    const dir = (direction || 'LONG').toUpperCase();
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
    const liquidationPrice = dir === 'LONG'
      ? entry * (1 - 1 / lev)
      : entry * (1 + 1 / lev);

    res.json({
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlRub: Math.round(pnlUsd * rubRate * 100) / 100,
      roe: Math.round(roe * 100) / 100,
      positionVolume: Math.round(positionVolume * 100) / 100,
      liquidationPrice: Math.round(liquidationPrice * 100) / 100,
      status: pnlUsd >= 0 ? 'PROFIT' : 'LOSS',
      direction: dir,
      currency: 'USD'
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
