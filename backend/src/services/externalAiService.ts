/**
 * Внешний платный ИИ (OpenAI / Claude / GLM) — оценка сигнала перед открытием позиции.
 * Модели могут работать вместе: useAllProviders=true вызывает все доступные и усредняет оценку.
 * Настройки и API-ключи задаются в админ-панели.
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { getSetting, setSetting } from '../db';
import { logger } from '../lib/logger';
import { encrypt, decrypt } from '../lib/encrypt';
import type { TradingSignal } from '../types/signal';
import { fetchNewsContext } from './cryptopanicService';

function getExternalAiProxy(): string {
  return getProxy(config.proxyList) || config.proxy || '';
}

const SETTINGS_KEY_EXTERNAL_AI = 'external_ai_config';
const SETTINGS_KEY_OPENAI_API_KEY = 'external_ai_openai_api_key';
const SETTINGS_KEY_ANTHROPIC_API_KEY = 'external_ai_anthropic_api_key';
const SETTINGS_KEY_GLM_API_KEY = 'external_ai_glm_api_key';
const SETTINGS_KEY_CRYPTOPANIC_API_KEY = 'external_ai_cryptopanic_api_key';

export type ExternalAiProvider = 'openai' | 'claude' | 'glm';

export interface ExternalAiConfig {
  enabled: boolean;
  /** Выбор провайдера при useAllProviders=false */
  provider: ExternalAiProvider;
  /** true = вызывать все провайдеры с ключами и усреднять оценку */
  useAllProviders: boolean;
  minScore: number;
  /** Модель OpenAI (gpt-5, gpt-4o, gpt-4o-mini и т.д.) */
  openaiModel: string;
  /** Модель Claude (claude-3-5-sonnet, claude-3-5-haiku и т.д.) */
  claudeModel: string;
  /** Модель Zhipu GLM (glm-5, glm-4 и т.д.) */
  glmModel: string;
}

const DEFAULT_CONFIG: ExternalAiConfig = {
  enabled: false,
  provider: 'openai',
  useAllProviders: false,
  minScore: 0.6,
  openaiModel: 'gpt-5.2',
  claudeModel: 'claude-3-5-haiku-20241022',
  glmModel: 'glm-5'
};

/** Устаревшие/недоступные Claude model IDs — заменяем на актуальный */
const DEPRECATED_CLAUDE_MODELS = [
  'claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-latest'
];

function parseConfig(raw: string | null): ExternalAiConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<ExternalAiConfig>;
    let claudeModel = String(parsed.claudeModel || DEFAULT_CONFIG.claudeModel).trim() || DEFAULT_CONFIG.claudeModel;
    if (DEPRECATED_CLAUDE_MODELS.includes(claudeModel)) {
      claudeModel = DEFAULT_CONFIG.claudeModel;
    }
    return {
      enabled: Boolean(parsed.enabled),
      provider: parsed.provider === 'claude' ? 'claude' : parsed.provider === 'glm' ? 'glm' : 'openai',
      useAllProviders: Boolean(parsed.useAllProviders),
      minScore: Math.max(0, Math.min(1, Number(parsed.minScore) ?? DEFAULT_CONFIG.minScore)),
      openaiModel: String(parsed.openaiModel || DEFAULT_CONFIG.openaiModel).trim() || DEFAULT_CONFIG.openaiModel,
      claudeModel,
      glmModel: String(parsed.glmModel || DEFAULT_CONFIG.glmModel).trim() || DEFAULT_CONFIG.glmModel
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
    minScore: patch.minScore != null ? Math.max(0, Math.min(1, patch.minScore)) : current.minScore,
    openaiModel: patch.openaiModel != null ? String(patch.openaiModel).trim() || current.openaiModel : current.openaiModel,
    claudeModel: patch.claudeModel != null ? String(patch.claudeModel).trim() || current.claudeModel : current.claudeModel,
    glmModel: patch.glmModel != null ? String(patch.glmModel).trim() || current.glmModel : current.glmModel
  };
  setSetting(SETTINGS_KEY_EXTERNAL_AI, JSON.stringify(next));
  return next;
}

export function getOpenAiKey(): string {
  const stored = getSetting(SETTINGS_KEY_OPENAI_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec.trim();
  }
  return (config.openai?.apiKey ?? '').trim();
}

export function getAnthropicKey(): string {
  const stored = getSetting(SETTINGS_KEY_ANTHROPIC_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec.trim();
  }
  return (config.anthropic?.apiKey ?? '').trim();
}

function getGlmKey(): string {
  const stored = getSetting(SETTINGS_KEY_GLM_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec.trim();
  }
  return '';
}

export function setOpenAiKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_OPENAI_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_OPENAI_API_KEY, encrypt(v));
}

export function setAnthropicKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_ANTHROPIC_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_ANTHROPIC_API_KEY, encrypt(v));
}

export function setGlmKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_GLM_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_GLM_API_KEY, encrypt(v));
}

export function getCryptoPanicKey(): string {
  const stored = getSetting(SETTINGS_KEY_CRYPTOPANIC_API_KEY);
  if (stored) {
    const dec = decrypt(stored);
    if (dec) return dec.trim();
  }
  return '';
}

export function setCryptoPanicKey(value: string | null): void {
  const v = (value ?? '').trim();
  if (!v) {
    setSetting(SETTINGS_KEY_CRYPTOPANIC_API_KEY, '');
    return;
  }
  setSetting(SETTINGS_KEY_CRYPTOPANIC_API_KEY, encrypt(v));
}

export function hasCryptoPanicKey(): boolean {
  return Boolean(getCryptoPanicKey());
}

export function hasApiKey(provider: ExternalAiProvider): boolean {
  if (provider === 'openai') return Boolean(getOpenAiKey());
  if (provider === 'claude') return Boolean(getAnthropicKey());
  if (provider === 'glm') return Boolean(getGlmKey());
  return false;
}

export function hasOpenAiKey(): boolean {
  return Boolean(getOpenAiKey());
}

export function hasAnthropicKey(): boolean {
  return Boolean(getAnthropicKey());
}

export function hasGlmKey(): boolean {
  return Boolean(getGlmKey());
}

/** Есть ли хотя бы один провайдер с ключом (для useAllProviders или выбранного provider). */
export function hasAnyApiKey(cfg: ExternalAiConfig): boolean {
  if (cfg.useAllProviders) {
    return hasOpenAiKey() || hasAnthropicKey() || hasGlmKey();
  }
  return hasApiKey(cfg.provider);
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

async function callOpenAI(prompt: string, model: string): Promise<number | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey) return null;
  const proxyUrl = getExternalAiProxy();
  const dispatcher = proxyUrl && proxyUrl.startsWith('http') ? new ProxyAgent(proxyUrl) : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await undiciFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-5.2',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 20,
        temperature: 0.3
      }),
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      const isRegionBlocked = res.status === 403 && /unsupported_country_region_territory|country.*not supported/i.test(err);
      const isInvalidKey = res.status === 401 && /incorrect.*api.*key|invalid.*api.*key|authentication/i.test(err);
      if (isRegionBlocked) {
        logger.warn('externalAi', 'OpenAI: регион не поддерживается. Используйте Claude/GLM или прокси в разрешённом регионе.', { body: err.slice(0, 120) });
      } else if (isInvalidKey) {
        logger.warn('externalAi', 'OpenAI 401: неверный API-ключ. Проверьте ключ в админке.', { keyPrefix: apiKey.slice(0, 12) + '…' });
      } else {
        logger.warn('externalAi', 'OpenAI error', { status: res.status, body: err.slice(0, 200) });
      }
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

async function callClaude(prompt: string, model: string): Promise<number | null> {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;
  const proxyUrl = getExternalAiProxy();
  const dispatcher = proxyUrl && proxyUrl.startsWith('http') ? new ProxyAgent(proxyUrl) : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await undiciFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
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

/** Zhipu GLM (OpenAI-совместимый API). */
async function callGLM(prompt: string, model: string): Promise<number | null> {
  const apiKey = getGlmKey();
  if (!apiKey) return null;
  const proxyUrl = getExternalAiProxy();
  const dispatcher = proxyUrl && proxyUrl.startsWith('http') ? new ProxyAgent(proxyUrl) : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await undiciFetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'glm-5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.3
      }),
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      logger.warn('externalAi', 'GLM error', { status: res.status, body: err.slice(0, 200) });
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
    logger.warn('externalAi', 'GLM request failed', { error: (e as Error).message });
    return null;
  }
}

/**
 * Оценка сигнала внешним ИИ. При useAllProviders вызывает все доступные модели и усредняет.
 * Если задан CryptoPanic API-ключ — подтягиваются новости и передаются в контекст.
 */
export async function evaluateSignal(
  signal: TradingSignal,
  context?: string
): Promise<{ score: number; providers: string[] } | null> {
  const cfg = getExternalAiConfig();
  if (!cfg.enabled) return null;

  let fullContext = context ?? '';
  if (hasCryptoPanicKey()) {
    try {
      const cpKey = getCryptoPanicKey();
      const newsContext = await fetchNewsContext(cpKey, signal.symbol ?? '', 5);
      if (newsContext) {
        fullContext = fullContext ? `${fullContext}. ${newsContext}` : newsContext;
      }
    } catch (e) {
      logger.warn('externalAi', 'CryptoPanic fetch failed', { error: (e as Error).message });
    }
  }

  const prompt = buildPrompt(signal, fullContext || undefined);
  const providers: string[] = [];
  const scores: number[] = [];

  if (cfg.useAllProviders) {
    const [openaiScore, claudeScore, glmScore] = await Promise.all([
      hasOpenAiKey() ? callOpenAI(prompt, cfg.openaiModel) : Promise.resolve(null),
      hasAnthropicKey() ? callClaude(prompt, cfg.claudeModel) : Promise.resolve(null),
      hasGlmKey() ? callGLM(prompt, cfg.glmModel) : Promise.resolve(null)
    ]);
    if (openaiScore != null) { scores.push(openaiScore); providers.push(`OpenAI(${cfg.openaiModel})`); }
    if (claudeScore != null) { scores.push(claudeScore); providers.push(`Claude(${cfg.claudeModel})`); }
    if (glmScore != null) { scores.push(glmScore); providers.push(`GLM(${cfg.glmModel})`); }
  } else {
    let score: number | null = null;
    if (cfg.provider === 'openai') score = await callOpenAI(prompt, cfg.openaiModel);
    else if (cfg.provider === 'claude') score = await callClaude(prompt, cfg.claudeModel);
    else if (cfg.provider === 'glm') score = await callGLM(prompt, cfg.glmModel);
    if (score != null) {
      scores.push(score);
      providers.push(cfg.provider);
    }
  }

  if (scores.length === 0) {
    if (hasAnyApiKey(cfg)) {
      logger.info('externalAi', 'All providers failed or returned no score', { symbol: signal.symbol });
    } else {
      logger.info('externalAi', 'External AI enabled but no API key', { provider: cfg.provider, useAllProviders: cfg.useAllProviders });
    }
    return null;
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  logger.info('externalAi', 'Score received', { providers, score: avg.toFixed(3), symbol: signal.symbol });
  return { score: avg, providers };
}
