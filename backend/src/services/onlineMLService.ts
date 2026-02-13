/**
 * Онлайн машинное обучение на основе исходов сделок.
 * SGD Logistic Regression — обновление модели после каждой закрытой сделки.
 * Улучшения: bias, волатильность (ATR), ликвидность (спред), консервативная оценка при малом N.
 * Важно: 100% выигрышей гарантировать невозможно — модель лишь максимизирует шанс прибыли и снижает долю убыточных сделок.
 */

import { logger } from '../lib/logger';

/** Минимум примеров, после которого AI-фильтр (minAiProb) учитывается. До этого порог не блокирует. env: ML_MIN_SAMPLES_GATE */
export const MIN_SAMPLES_FOR_AI_GATE = typeof process !== 'undefined' && process.env?.ML_MIN_SAMPLES_GATE
  ? Math.max(5, Math.min(50, Number(process.env.ML_MIN_SAMPLES_GATE) || 15))
  : 15;
/** Примеров, после которых предсказание считается «уверенным» (без сдвига к 0.5). */
export const SAMPLES_FOR_FULL_TRUST = 50;

const FEATURE_DIM = 9; // bias + confidence, direction, rr, triggers, rsi, volume, atrNorm, spreadNorm
const LEARNING_RATE = 0.1;
const L2_REG = 0.01;

/** Веса модели (bias = weights[0], остальные — признаки) */
let weights: number[] = new Array(FEATURE_DIM).fill(0);
let sampleCount = 0;

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
export function update(features: MLFeatures, win: boolean): void {
  const x = extractFeatures(features);
  const y = win ? 1 : 0;
  const pred = predict(features);
  const error = y - pred;

  for (let i = 0; i < FEATURE_DIM; i++) {
    const grad = -error * x[i] + L2_REG * weights[i];
    weights[i] -= LEARNING_RATE * grad;
  }
  sampleCount++;
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
