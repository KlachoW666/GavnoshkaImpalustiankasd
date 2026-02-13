/**
 * Внешний платный ИИ (OpenAI / Claude) — оценка сигнала перед открытием позиции.
 * Все настройки, включая API-ключи, задаются в админ-панели и хранятся в БД (ключи — зашифрованы).
 * 100% вероятности не гарантируется; сервис лишь добавляет дополнительный фильтр.
 */

import { config } from '../config';
import { getSetting, setSetting } from '../db';
import { logger } from '../lib/logger';
import { encrypt, decrypt } from '../lib/encrypt';
import type { TradingSignal } from '../types/signal';

const SETTINGS_KEY_EXTERNAL_AI = 'external_ai_config';
const SETTINGS_KEY_OPENAI_API_KEY = 'external_ai_openai_api_key';
const SETTINGS_KEY_ANTHROPIC_API_KEY = 'external_ai_anthropic_api_key';

export type ExternalAiProvider = 'openai' | 'claude';

export interface ExternalAiConfig {
  enabled: boolean;
  provider: ExternalAiProvider;
  /** Минимальная оценка 0–1: ордер не откроется, если ИИ вернёт ниже. */
  minScore: number;
}

const DEFAULT_CONFIG: ExternalAiConfig = {
  enabled: false,
  provider: 'openai',
  minScore: 0.6
};

function parseConfig(raw: string | null): ExternalAiConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<ExternalAiConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      provider: parsed.provider === 'claude' ? 'claude' : 'openai',
      minScore: Math.max(0, Math.min(1, Number(parsed.minScore) ?? DEFAULT_CONFIG.minScore))
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function getExternalAiConfig(): ExternalAiConfig {
  const raw = getSetting(SETTINGS_KEY_EXTERNAL_AI);
  return parseConfig(raw);
}

export function setExternalAiConfig(patch: Partial<ExternalAiConfig>): ExternalAiConfig {
  const current = getExternalAiConfig();
  const next: ExternalAiConfig = {
    ...current,
    ...patch,
    minScore: patch.minScore != null ? Math.max(0, Math.min(1, patch.minScore)) : current.minScore
  };
  setSetting(SETTINGS_KEY_EXTERNAL_AI, JSON.stringify(next));
  return next;
}

/** Получить ключ OpenAI: сначала из БД (админка), затем из .env. */
export function getOpenAiKey(): string {
  const stored = getSetting(SETTINGS_KEY_OPENAI_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec;
  }
  return config.openai?.apiKey ?? '';
}

/** Получить ключ Anthropic: сначала из БД, затем из .env. */
export function getAnthropicKey(): string {
  const stored = getSetting(SETTINGS_KEY_ANTHROPIC_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec;
  }
  return config.anthropic?.apiKey ?? '';
}

/** Сохранить ключ OpenAI в БД (зашифровано). Передать пустую строку или null — удалить. */
export function setOpenAiKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_OPENAI_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_OPENAI_API_KEY, encrypt(v));
}

/** Сохранить ключ Anthropic в БД. Пустая строка или null — удалить. */
export function setAnthropicKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_ANTHROPIC_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_ANTHROPIC_API_KEY, encrypt(v));
}

/** Есть ли ключ для выбранного провайдера (из БД или .env). */
export function hasApiKey(provider: ExternalAiProvider): boolean {
  if (provider === 'openai') return Boolean(getOpenAiKey());
  if (provider === 'claude') return Boolean(getAnthropicKey());
  return false;
}

/** Есть ли ключ OpenAI (из БД или .env) — для отображения в админке. */
export function hasOpenAiKey(): boolean {
  return Boolean(getOpenAiKey());
}

/** Есть ли ключ Anthropic — для админки. */
export function hasAnthropicKey(): boolean {
  return Boolean(getAnthropicKey());
}

const REQUEST_TIMEOUT_MS = 15000;

function buildPrompt(signal: TradingSignal, context?: string): string {
  const conf = (signal.confidence ?? 0) * 100;
  const rr = signal.risk_reward ?? 0;
  const dir = signal.direction ?? 'LONG';
  const sym = signal.symbol ?? '';
  return `Ты — аналитик крипторынка. Оцени вероятность того, что сделка по сигналу будет в плюсе (от 0.0 до 1.0).
Сигнал: ${dir} ${sym}, уверенность ${conf.toFixed(0)}%, risk/reward ${rr.toFixed(2)}.${context ? ` Контекст: ${context}` : ''}
Ответь ОДНИМ числом от 0.0 до 1.0 (например 0.72), без текста.`;
}

/** Вызов OpenAI Chat Completions. */
async function callOpenAI(prompt: string): Promise<number | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.3
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      logger.warn('externalAi', 'OpenAI error', { status: res.status, body: err.slice(0, 200) });
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const num = parseFloat(content.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(1, num));
  } catch (e) {
    clearTimeout(timeout);
    logger.warn('externalAi', 'OpenAI request failed', { error: (e as Error).message });
    return null;
  }
}

/** Вызов Anthropic Messages API. */
async function callClaude(prompt: string): Promise<number | null> {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      logger.warn('externalAi', 'Claude error', { status: res.status, body: err.slice(0, 200) });
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;
    const num = parseFloat(text.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(1, num));
  } catch (e) {
    clearTimeout(timeout);
    logger.warn('externalAi', 'Claude request failed', { error: (e as Error).message });
    return null;
  }
}

/**
 * Оценка сигнала внешним ИИ. Возвращает 0–1 или null при ошибке/таймауте (в этом случае ордер не блокируется по внешнему ИИ).
 */
export async function evaluateSignal(
  signal: TradingSignal,
  context?: string
): Promise<{ score: number } | null> {
  const cfg = getExternalAiConfig();
  if (!cfg.enabled) return null;
  if (!hasApiKey(cfg.provider)) {
    logger.info('externalAi', 'External AI enabled but no API key', { provider: cfg.provider });
    return null;
  }
  const prompt = buildPrompt(signal, context);
  const score = cfg.provider === 'claude' ? await callClaude(prompt) : await callOpenAI(prompt);
  if (score == null) return null;
  logger.info('externalAi', 'Score received', { provider: cfg.provider, score, symbol: signal.symbol });
  return { score };
}
