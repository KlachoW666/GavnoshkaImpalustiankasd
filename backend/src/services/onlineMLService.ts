/**
 * Онлайн машинное обучение на основе исходов сделок.
 * SGD Logistic Regression — обновление модели после каждой закрытой сделки.
 * Улучшения: bias, волатильность (ATR), ликвидность (спред), консервативная оценка при малом N.
 * Персистентность: веса сохраняются в data/ml_model.json, загрузка при старте.
 * Важно: 100% выигрышей гарантировать невозможно — модель лишь максимизирует шанс прибыли и снижает долю убыточных сделок.
 */

import path from 'path';
import fs from 'fs';
import { logger } from '../lib/logger';

/** Минимум примеров, после которого AI-фильтр (minAiProb) учитывается. До этого порог не блокирует. env: ML_MIN_SAMPLES_GATE */
export const MIN_SAMPLES_FOR_AI_GATE = typeof process !== 'undefined' && process.env?.ML_MIN_SAMPLES_GATE
  ? Math.max(5, Math.min(50, Number(process.env.ML_MIN_SAMPLES_GATE) || 10))
  : 10;
/** Примеров, после которых предсказание считается «уверенным» (без сдвига к 0.5). */
export const SAMPLES_FOR_FULL_TRUST = 50;

const FEATURE_DIM = 9; // bias + confidence, direction, rr, triggers, rsi, volume, atrNorm, spreadNorm
const LEARNING_RATE = 0.1;
const L2_REG = 0.01;

const DATA_DIR = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : path.join(process.cwd(), 'data');
const ML_MODEL_PATH = path.join(DATA_DIR, 'ml_model.json');

/** Веса модели (bias = weights[0], остальные — признаки) */
let weights: number[] = new Array(FEATURE_DIM).fill(0);
let sampleCount = 0;
/** ID ордеров, уже переданных в ML (для избежания двойного обучения при warm-up) */
let fedOrderIds = new Set<string>();

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
}

/** Нормализация confidence в 0–1 (если передан в процентах 0–100) */
function normConfidence(c: number): number {
  return c > 1 ? Math.min(1, c / 100) : Math.max(0, Math.min(1, c));
}

/** Вектор признаков: [1, conf, dir, rr, triggers, rsi, volume, atrNorm, spreadNorm] */
function extractFeatures(f: {
  confidence: number;
  direction: number;
  riskReward: number;
  triggersCount: number;
  rsiBucket?: number;
  volumeConfirm?: number;
  atrNorm?: number;
  spreadNorm?: number;
}): number[] {
  return [
    1,
    normConfidence(f.confidence),
    f.direction,
    Math.min(1, f.riskReward / 4),
    Math.min(1, f.triggersCount / 5),
    (f.rsiBucket ?? 0) / 2 + 0.5,
    f.volumeConfirm ?? 0.5,
    Math.max(0, Math.min(1, f.atrNorm ?? 0.5)),
    Math.max(0, Math.min(1, f.spreadNorm ?? 0.5))
  ];
}

export type MLFeatures = {
  confidence: number;
  direction: number;
  riskReward: number;
  triggersCount: number;
  rsiBucket?: number;
  volumeConfirm?: number;
  atrNorm?: number;
  spreadNorm?: number;
};

/**
 * Сохранить модель в data/ml_model.json
 */
function persistModel(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ML_MODEL_PATH, JSON.stringify({
      weights,
      sampleCount,
      fedOrderIds: Array.from(fedOrderIds).slice(-5000),
      updatedAt: new Date().toISOString()
    }), 'utf8');
  } catch (e) {
    logger.warn('onlineML', 'Failed to persist model: ' + (e as Error).message);
  }
}

/**
 * Загрузить модель из data/ml_model.json
 */
export function loadModel(): void {
  try {
    if (!fs.existsSync(ML_MODEL_PATH)) return;
    const raw = fs.readFileSync(ML_MODEL_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.weights) && data.weights.length === FEATURE_DIM) {
      weights = data.weights;
      sampleCount = Number(data.sampleCount) || 0;
      if (Array.isArray(data.fedOrderIds)) fedOrderIds = new Set(data.fedOrderIds);
      logger.info('onlineML', `Model loaded: samples=${sampleCount} from ${ML_MODEL_PATH}`);
    }
  } catch (e) {
    logger.warn('onlineML', 'Failed to load model: ' + (e as Error).message);
  }
}

/**
 * Предсказание вероятности выигрыша (0–1).
 * atrNorm: 0–1, отношение ATR к среднему (норма ≈ 0.5, высокая волатильность ближе к 1).
 * spreadNorm: 0–1, качество ликвидности (1 = узкий спред, 0 = широкий).
 */
export function predict(features: MLFeatures): number {
  const x = extractFeatures(features);
  let z = 0;
  for (let i = 0; i < FEATURE_DIM; i++) {
    z += weights[i] * x[i];
  }
  return sigmoid(z);
}

/**
 * Консервативная оценка для фильтра: при малом числе примеров сдвигаем предсказание к 0.5,
 * чтобы не переоценивать модель. 100% выигрышей гарантировать невозможно.
 */
export function effectiveProbability(prob: number, samples: number): number {
  if (samples >= SAMPLES_FOR_FULL_TRUST) return prob;
  const blend = samples / SAMPLES_FOR_FULL_TRUST;
  return prob * blend + 0.5 * (1 - blend);
}

/**
 * Онлайн обновление модели (SGD) после исхода сделки
 */
export function update(features: MLFeatures, win: boolean, orderId?: string): void {
  const x = extractFeatures(features);
  const y = win ? 1 : 0;
  const pred = predict(features);
  const error = y - pred;

  for (let i = 0; i < FEATURE_DIM; i++) {
    const grad = -error * x[i] + L2_REG * weights[i];
    weights[i] -= LEARNING_RATE * grad;
  }
  sampleCount++;
  if (orderId) fedOrderIds.add(orderId);
  persistModel();
  if (sampleCount % 10 === 0) {
    logger.info('onlineML', `samples=${sampleCount} weights=${weights.map((w) => w.toFixed(3)).join(',')}`);
  }
}

/**
 * Корректировка confidence на основе ML предсказания
 */
export function adjustConfidence(baseConfidence: number, features: MLFeatures): number {
  if (sampleCount < 5) return baseConfidence;
  const mlProb = predict(features);
  const blend = Math.min(0.5, sampleCount / 50) * 0.3;
  return baseConfidence * (1 - blend) + mlProb * blend;
}

export function getStats(): { samples: number; weights: number[] } {
  return { samples: sampleCount, weights: [...weights] };
}

/**
 * Прогрев модели из закрытых ордеров в БД (при старте сервера).
 * Вызывать после loadModel() и initDb().
 */
export function warmUpFromDb(listOrdersFn: (opts: { status: 'closed'; limit: number }) => Array<{
  id: string;
  direction: string;
  confidence_at_open: number | null;
  open_price: number;
  stop_loss: number | null;
  take_profit: string | null;
  pnl: number | null;
}>): void {
  try {
    const closed = listOrdersFn({ status: 'closed', limit: 500 });
    let fed = 0;
    for (const o of closed) {
      if (fedOrderIds.has(o.id)) continue;
      const win = (o.pnl ?? 0) > 0;
      const conf = o.confidence_at_open != null ? o.confidence_at_open : 70;
      const rr = computeRiskReward(o);
      const features: MLFeatures = {
        confidence: conf > 1 ? conf / 100 : conf,
        direction: (o.direction || 'LONG').toUpperCase() === 'LONG' ? 1 : 0,
        riskReward: rr,
        triggersCount: 2,
        rsiBucket: 0,
        volumeConfirm: 0.5
      };
      update(features, win, o.id);
      fed++;
    }
    if (fed > 0) logger.info('onlineML', `Warm-up: fed ${fed} closed orders from DB`);
  } catch (e) {
    logger.warn('onlineML', 'Warm-up failed: ' + (e as Error).message);
  }
}

/**
 * Вычислить risk/reward из ордера (open, stop_loss, take_profit)
 */
function computeRiskReward(order: {
  open_price: number;
  stop_loss: number | null;
  take_profit: string | null;
  direction: string;
}): number {
  const entry = order.open_price;
  const sl = order.stop_loss;
  if (!sl || sl <= 0) return 1.5;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return 1.5;
  let reward = risk * 1.5;
  try {
    const tp = order.take_profit;
    if (tp) {
      const arr = typeof tp === 'string' ? JSON.parse(tp) : tp;
      const nums = Array.isArray(arr) ? arr.map(Number).filter((n: number) => Number.isFinite(n)) : [Number(arr)];
      if (nums.length > 0) {
        const firstTp = nums[0];
        reward = Math.abs(firstTp - entry);
      }
    }
  } catch (err) { logger.warn('MLService', (err as Error).message); }
  return Math.max(0.5, Math.min(4, reward / risk));
}

/**
 * Передать закрытый ордер из OKX (не из нашей БД) в ML для обучения.
 * Используется при синхронизации истории OKX. id должен быть уникальным (напр. okx-ml-{ordId}).
 */
export function feedOkxClosedOrderToML(order: {
  id: string;
  symbol: string;
  side: string;
  pnl: number;
  average?: number;
  price?: number;
}): void {
  if (fedOrderIds.has(order.id)) return;
  const win = order.pnl > 0;
  const direction = (order.side || 'buy').toLowerCase() === 'buy' ? 'LONG' : 'SHORT';
  const features: MLFeatures = {
    confidence: 0.7,
    direction: direction === 'LONG' ? 1 : 0,
    riskReward: 1.5,
    triggersCount: 2,
    rsiBucket: 0,
    volumeConfirm: 0.5
  };
  update(features, win, order.id);
  logger.info('onlineML', 'Fed OKX closed order to ML', { id: order.id, symbol: order.symbol, win, pnl: order.pnl.toFixed(2), samples: sampleCount });
}

/**
 * Передать закрытый ордер из БД в ML для обучения. Вызывать после updateOrderClose.
 * pnlOverride — итоговый PnL (если order.pnl ещё не обновлён в объекте)
 */
export function feedOrderToML(order: {
  id: string;
  direction: string;
  confidence_at_open: number | null;
  open_price: number;
  stop_loss: number | null;
  take_profit: string | null;
  pnl?: number | null;
}, pnlOverride?: number): void {
  if (fedOrderIds.has(order.id)) return;
  const pnl = pnlOverride ?? order.pnl ?? 0;
  const win = pnl > 0;
  const conf = order.confidence_at_open != null ? order.confidence_at_open : 70;
  const rr = computeRiskReward(order);
  const features: MLFeatures = {
    confidence: conf > 1 ? conf / 100 : conf,
    direction: (order.direction || 'LONG').toUpperCase() === 'LONG' ? 1 : 0,
    riskReward: rr,
    triggersCount: 2,
    rsiBucket: 0,
    volumeConfirm: 0.5
  };
  update(features, win, order.id);
  logger.info('onlineML', 'Fed closed order to ML', { id: order.id, win, pnl: pnl.toFixed(2), samples: sampleCount });
}
