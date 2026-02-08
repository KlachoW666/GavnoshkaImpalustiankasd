import { OHLCVCandle, CandlePattern } from '../types/candle';
import { RSI, MACD, BollingerBands, SMA, EMA, ATR } from 'technicalindicators';

/**
 * Candle Analyzer - анализ свечных паттернов и индикаторов (раздел 5 ТЗ)
 */
export class CandleAnalyzer {
  /**
   * Определение паттерна поглощения
   */
  detectEngulfing(candles: OHLCVCandle[]): CandlePattern {
    if (candles.length < 2) return 'none';
    const [prev, curr] = candles.slice(-2);
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const prevIsRed = prev.close < prev.open;
    const currIsGreen = curr.close > curr.open;

    // Бычье поглощение
    if (prevIsRed && currIsGreen && curr.open <= prev.close && curr.close >= prev.open && currBody > prevBody) {
      return 'bullish_engulfing';
    }
    // Медвежье поглощение
    const currIsRed = curr.close < curr.open;
    const prevIsGreen = prev.close > prev.open;
    if (prevIsGreen && currIsRed && curr.open >= prev.close && curr.close <= prev.open && currBody > prevBody) {
      return 'bearish_engulfing';
    }
    return 'none';
  }

  /**
   * Пин-бар (Hammer) — бычий разворот после падения
   */
  detectHammer(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && lowerShadow > body * 2 && upperShadow < range * 0.1;
  }

  /**
   * Inverted Hammer — бычий разворот, длинная верхняя тень
   */
  detectInvertedHammer(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && upperShadow > body * 2 && lowerShadow < range * 0.1;
  }

  /**
   * Shooting Star — медвежий разворот после роста
   */
  detectShootingStar(candle: OHLCVCandle): boolean {
    return this.detectInvertedHammer(candle);
  }

  /**
   * Hanging Man — медвежий разворот (как Hammer, но после роста)
   */
  detectHangingMan(candle: OHLCVCandle): boolean {
    return this.detectHammer(candle);
  }

  /**
   * Доджи
   */
  detectDoji(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return range > 0 && body / range < 0.05;
  }

  /**
   * Dragonfly Doji — длинная нижняя тень, бычий
   */
  detectDragonflyDoji(candle: OHLCVCandle): boolean {
    if (!this.detectDoji(candle)) return false;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return lowerShadow > upperShadow * 2;
  }

  /**
   * Gravestone Doji — длинная верхняя тень, медвежий
   */
  detectGravestoneDoji(candle: OHLCVCandle): boolean {
    if (!this.detectDoji(candle)) return false;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return upperShadow > lowerShadow * 2;
  }

  /**
   * Spinning Top — нерешительность
   */
  detectSpinningTop(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && body / range < 0.3 && lowerShadow > body && upperShadow > body;
  }

  /**
   * Tweezer Tops — два свечи с одинаковыми максимумами, медвежий
   */
  detectTweezerTops(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [a, b] = candles.slice(-2);
    const tolerance = (a.high - a.low + b.high - b.low) * 0.02;
    return Math.abs(a.high - b.high) <= tolerance && a.high > a.open && b.close < b.open;
  }

  /**
   * Tweezer Bottoms — два свечи с одинаковыми минимумами, бычий
   */
  detectTweezerBottoms(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [a, b] = candles.slice(-2);
    const tolerance = (a.high - a.low + b.high - b.low) * 0.02;
    return Math.abs(a.low - b.low) <= tolerance && a.close < a.open && b.close > b.open;
  }

  /**
   * Piercing Line — бычий разворот [Bar Confirm]
   * Длинная красная, затем зелёная: открытие ниже минимума первой, закрытие выше середины тела первой
   */
  detectPiercingLine(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [prev, curr] = candles.slice(-2);
    const prevIsRed = prev.close < prev.open;
    const currIsGreen = curr.close > curr.open;
    if (!prevIsRed || !currIsGreen) return false;
    const prevMid = (prev.open + prev.close) / 2;
    return curr.open < prev.low && curr.close > prevMid && curr.close < prev.open;
  }

  /**
   * Dark Cloud Cover — медвежий разворот [Bar Confirm]
   * Длинная зелёная, затем красная: открытие выше максимума первой, закрытие ниже середины тела первой
   */
  detectDarkCloudCover(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [prev, curr] = candles.slice(-2);
    const prevIsGreen = prev.close > prev.open;
    const currIsRed = curr.close < curr.open;
    if (!prevIsGreen || !currIsRed) return false;
    const prevMid = (prev.open + prev.close) / 2;
    return curr.open > prev.high && curr.close < prevMid && curr.close > prev.open;
  }

  /**
   * Morning Star — бычий разворот: красная, маленькая (звезда), зелёная
   */
  detectMorningStar(candles: OHLCVCandle[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    const aRed = a.close < a.open;
    const cGreen = c.close > c.open;
    const bSmall = Math.abs(b.close - b.open) / (b.high - b.low || 0.001) < 0.3;
    const cClosesIntoA = c.close > (a.open + a.close) / 2;
    return aRed && bSmall && cGreen && cClosesIntoA;
  }

  /**
   * Evening Star — медвежий разворот: зелёная, маленькая (звезда), красная
   */
  detectEveningStar(candles: OHLCVCandle[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    const aGreen = a.close > a.open;
    const cRed = c.close < c.open;
    const bSmall = Math.abs(b.close - b.open) / (b.high - b.low || 0.001) < 0.3;
    const cClosesIntoA = c.close < (a.open + a.close) / 2;
    return aGreen && bSmall && cRed && cClosesIntoA;
  }

  /**
   * Harami — маленькая свеча внутри предыдущей
   */
  detectHarami(candles: OHLCVCandle[]): CandlePattern {
    if (candles.length < 2) return 'none';
    const [prev, curr] = candles.slice(-2);
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const currHigh = Math.max(curr.open, curr.close);
    const currLow = Math.min(curr.open, curr.close);
    const prevHigh = Math.max(prev.open, prev.close);
    const prevLow = Math.min(prev.open, prev.close);
    if (currBody >= prevBody * 0.9) return 'none';
    if (currHigh < prevHigh && currLow > prevLow) {
      return curr.close > curr.open ? 'bullish_harami' : 'bearish_harami';
    }
    return 'none';
  }

  /**
   * Bull Marubozu — PDF: сильный бычий импульс, тело без теней
   */
  detectBullMarubozu(candle: OHLCVCandle): boolean {
    const body = candle.close - candle.open;
    if (body <= 0) return false;
    const range = candle.high - candle.low;
    if (range <= 0) return false;
    const lowerShadow = candle.open - candle.low;
    const upperShadow = candle.high - candle.close;
    return body / range > 0.9 && lowerShadow < range * 0.05 && upperShadow < range * 0.05;
  }

  /**
   * Bear Marubozu — PDF: сильный медвежий импульс
   */
  detectBearMarubozu(candle: OHLCVCandle): boolean {
    const body = candle.open - candle.close;
    if (body <= 0) return false;
    const range = candle.high - candle.low;
    if (range <= 0) return false;
    const lowerShadow = candle.close - candle.low;
    const upperShadow = candle.high - candle.open;
    return body / range > 0.9 && lowerShadow < range * 0.05 && upperShadow < range * 0.05;
  }

  /**
   * Three Black Crows — три медвежьих свечи подряд
   */
  detectThreeBlackCrows(candles: { open: number; high: number; low: number; close: number }[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    return a.close < a.open && b.close < b.open && c.close < c.open &&
      b.low < a.low && c.low < b.low && a.open > b.open && b.open > c.open;
  }

  /**
   * RSI
   */
  getRSI(closes: number[], period = 14): number | null {
    if (closes.length < period + 1) return null;
    const values = RSI.calculate({ values: closes, period });
    return values[values.length - 1];
  }

  /**
   * MACD
   */
  getMACD(closes: number[]) {
    if (closes.length < 34) return null;
    const result = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    return result[result.length - 1];
  }

  /**
   * Bollinger Bands
   */
  getBollingerBands(closes: number[], period = 20, stdDev = 2) {
    if (closes.length < period) return null;
    const bb = BollingerBands.calculate({ values: closes, period, stdDev });
    return bb[bb.length - 1];
  }

  /** BB Width и средняя ширина — для детекции squeeze (сужение = подготовка к пробою) */
  getBollingerBandsWidth(closes: number[], period = 20, stdDev = 2): { width: number; avgWidth: number } | null {
    if (closes.length < period + 20) return null;
    const bb = BollingerBands.calculate({ values: closes, period, stdDev });
    const last = bb[bb.length - 1] as { upper?: number; lower?: number; middle?: number };
    const upper = last?.upper ?? 0;
    const lower = last?.lower ?? 0;
    const middle = last?.middle ?? (upper + lower) / 2;
    if (middle <= 0) return null;
    const width = (upper - lower) / middle;
    const slice = bb.slice(-20);
    const widths = slice.map((b: { upper?: number; lower?: number; middle?: number }) => {
      const u = b.upper ?? 0;
      const l = b.lower ?? 0;
      const m = b.middle ?? (u + l) / 2;
      return m > 0 ? (u - l) / m : 0;
    });
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    return { width, avgWidth };
  }

  /** PDF: EMA(9) > EMA(21) > EMA(50) = сильный восходящий тренд */
  getEMA(closes: number[]): { ema9: number; ema21: number; ema50: number } | null {
    if (closes.length < 50) return null;
    const ema9 = EMA.calculate({ values: closes, period: 9 });
    const ema21 = EMA.calculate({ values: closes, period: 21 });
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    return {
      ema9: ema9[ema9.length - 1],
      ema21: ema21[ema21.length - 1],
      ema50: ema50[ema50.length - 1]
    };
  }

  /** PDF: ATR для SL/TP — TR = max(High-Low, |High-Close_prev|, |Low-Close_prev|), period 14 */
  getATR(candles: { high: number; low: number; close: number }[], period = 14): number | null {
    if (candles.length < period + 1) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period });
    return atr[atr.length - 1];
  }

  /** MACD crossover: bullish = histogram cross up, bearish = cross down */
  getMACDCrossover(closes: number[]): 'bullish' | 'bearish' | null {
    if (closes.length < 35) return null;
    const result = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    if (result.length < 2) return null;
    const prev = result[result.length - 2];
    const curr = result[result.length - 1];
    const prevH = (prev as { MACD?: number; signal?: number; histogram?: number }).histogram ?? (prev as number);
    const currH = (curr as { MACD?: number; signal?: number; histogram?: number }).histogram ?? (curr as number);
    if (typeof prevH !== 'number' || typeof currH !== 'number') return null;
    if (prevH < 0 && currH > 0) return 'bullish';
    if (prevH > 0 && currH < 0) return 'bearish';
    return null;
  }
}
