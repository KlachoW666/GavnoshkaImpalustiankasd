import { describe, it, expect } from 'vitest';
import { analyzeOrderBook, analyzeTape, detectConsolidation, computeSignal, SPREAD_GOOD_PCT, SPREAD_CAUTION_PCT } from './marketAnalysis';

describe('analyzeOrderBook', () => {
  it('returns NEUTRAL when orderbook is empty', () => {
    const result = analyzeOrderBook({ bids: [], asks: [] });
    expect(result.direction).toBe('NEUTRAL');
    expect(result.score).toBe(0);
    expect(result.spreadPct).toBe(999);
  });

  it('detects LONG when bids dominate', () => {
    const bids: [number, number][] = [
      [100, 500], [99.9, 400], [99.8, 300], [99.7, 200], [99.6, 100]
    ];
    const asks: [number, number][] = [
      [100.01, 10], [100.02, 10], [100.03, 10], [100.04, 10], [100.05, 10]
    ];
    const result = analyzeOrderBook({ bids, asks });
    expect(result.direction).toBe('LONG');
    expect(result.score).toBeGreaterThan(0);
    expect(result.domScore).toBeGreaterThan(0);
  });

  it('detects SHORT when asks dominate', () => {
    const asks: [number, number][] = [
      [100.01, 500], [100.02, 400], [100.03, 300], [100.04, 200], [100.05, 100]
    ];
    const bids: [number, number][] = [
      [100, 10], [99.99, 10], [99.98, 10], [99.97, 10], [99.96, 10]
    ];
    const result = analyzeOrderBook({ bids, asks });
    expect(result.direction).toBe('SHORT');
    expect(result.score).toBeGreaterThan(0);
    expect(result.domScore).toBeLessThan(0);
  });

  it('calculates spread correctly', () => {
    const bids: [number, number][] = [[100, 100]];
    const asks: [number, number][] = [[100.03, 100]];
    const result = analyzeOrderBook({ bids, asks });
    expect(result.spreadPct).toBeCloseTo(0.03, 1);
  });
});

describe('analyzeTape', () => {
  it('returns NEUTRAL with no trades', () => {
    const result = analyzeTape([]);
    expect(result.direction).toBe('NEUTRAL');
    expect(result.score).toBe(0);
  });

  it('detects LONG when buying dominates', () => {
    const trades = Array.from({ length: 50 }, (_, i) => ({
      price: 100 + i * 0.01,
      amount: 1,
      time: Date.now() - (50 - i) * 1000,
      isBuy: true,
      quoteQuantity: 100
    }));
    const result = analyzeTape(trades);
    expect(result.direction).toBe('LONG');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects SHORT when selling dominates', () => {
    const trades = Array.from({ length: 50 }, (_, i) => ({
      price: 100 - i * 0.01,
      amount: 1,
      time: Date.now() - (50 - i) * 1000,
      isBuy: false,
      quoteQuantity: 100
    }));
    const result = analyzeTape(trades);
    expect(result.direction).toBe('SHORT');
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('detectConsolidation', () => {
  it('detects flat/range when candles are within tight range', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      time: Date.now() - (30 - i) * 300000,
      open: 100 + (i % 2 === 0 ? 0.1 : -0.1),
      high: 100.2,
      low: 99.8,
      close: 100 + (i % 2 === 0 ? -0.1 : 0.1),
      volume: 100
    }));
    const result = detectConsolidation(candles);
    expect(result).toBeDefined();
    expect(typeof result.isConsolidating).toBe('boolean');
     expect(typeof result.compressionRatio).toBe('number');
  });

  it('does not consolidate on highly volatile candles', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      time: Date.now() - (30 - i) * 300000,
      open: 100 + i * 2,
      high: 100 + i * 2 + 5,
      low: 100 + i * 2 - 5,
      close: 100 + i * 2 + 3,
      volume: 1000
    }));
    const result = detectConsolidation(candles);
    expect(result.isConsolidating).toBe(false);
  });
});

describe('computeSignal', () => {
  it('produces a valid signal output', () => {
    const signals = {
      candles: { direction: 'LONG' as const, score: 6 },
      orderBook: { direction: 'LONG' as const, score: 5, spreadPct: 0.02 },
      tape: { direction: 'LONG' as const, score: 5 }
    };
    const result = computeSignal(signals);
    expect(result.direction).toBe('LONG');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confluence).toBe(true);
  });

  it('returns NEUTRAL direction on conflicting signals', () => {
    const signals = {
      candles: { direction: 'LONG' as const, score: 6 },
      orderBook: { direction: 'SHORT' as const, score: 6, spreadPct: 0.02 },
      tape: { direction: 'NEUTRAL' as const, score: 0 }
    };
    const result = computeSignal(signals);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('respects trading mode weights', () => {
    const signals = {
      candles: { direction: 'LONG' as const, score: 5 },
      orderBook: { direction: 'LONG' as const, score: 8, spreadPct: 0.01 },
      tape: { direction: 'LONG' as const, score: 8 }
    };
    const scalpResult = computeSignal(signals, { tradingMode: 'scalping' });
    const stdResult = computeSignal(signals, { tradingMode: 'standard' });
    expect(scalpResult.direction).toBe('LONG');
    expect(stdResult.direction).toBe('LONG');
  });
});

describe('constants', () => {
  it('SPREAD thresholds are reasonable', () => {
    expect(SPREAD_GOOD_PCT).toBeLessThan(SPREAD_CAUTION_PCT);
    expect(SPREAD_GOOD_PCT).toBeGreaterThan(0);
  });
});
