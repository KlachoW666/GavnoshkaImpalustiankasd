/**
 * Centralized configuration for CryptoSignal Pro backend.
 * All env vars and constants in one place.
 */

function envStr(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key]?.toLowerCase();
  if (v === undefined || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes';
}

export const config = {
  port: envNum('PORT', 3000),
  nodeEnv: envStr('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',

  okx: {
    apiKey: envStr('OKX_API_KEY'),
    secret: envStr('OKX_SECRET'),
    passphrase: envStr('OKX_PASSPHRASE'),
    timeout: Math.max(15000, envNum('OKX_TIMEOUT', 45000)),
    get hasCredentials(): boolean {
      return Boolean(this.apiKey && this.secret);
    },
    get sandbox(): boolean {
      return envBool('OKX_SANDBOX', false);
    }
  },

  /** Bitget — биржа для автоторговли (ключи пользователя или из .env). */
  bitget: {
    apiKey: envStr('BITGET_API_KEY'),
    secret: envStr('BITGET_SECRET'),
    passphrase: envStr('BITGET_PASSPHRASE'),
    timeout: Math.max(15000, envNum('BITGET_TIMEOUT', 30000)),
    /** Макс. запросов в секунду к Bitget REST (очередь, не отмена). */
    rateLimitPerSecond: Math.max(1, Math.min(20, envNum('BITGET_RATE_LIMIT_PER_SECOND', 6))),
    get hasCredentials(): boolean {
      return Boolean(this.apiKey && this.secret);
    },
    get sandbox(): boolean {
      return envBool('BITGET_SANDBOX', false);
    }
  },

  /** Включить исполнение ордеров через Bitget при авто-трейдинге. Без флага — только сигналы. */
  get autoTradingExecutionEnabled(): boolean {
    return envBool('AUTO_TRADING_EXECUTION_ENABLED', false);
  },

  /** Прокси для запросов к OKX (обход Cloudflare). PROXY_LIST — список через запятую в .env */
  proxyList: (() => {
    const raw = envStr('PROXY_LIST');
    if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
  })(),
  get proxy(): string {
    const list = this.proxyList;
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : '';
  },

  /** OKX REST/WS limits — глубокий анализ */
  limits: {
    orderBook: 400,
    trades: 500,
    candles: 1000,
    candlesMax: 1000
  },

  /** Massive.com (Polygon) — рыночные данные (свечи, снапшот, S3 flat files). Все ключи только из .env. */
  massive: {
    /** REST API (вкладка "Accessing the API") — для /v2/aggs, /v3/snapshot */
    apiKey: envStr('MASSIVE_API_KEY'),
    baseUrl: envStr('MASSIVE_API_BASE_URL', 'https://api.massive.com'),
    /** S3 flat files (вкладка "Accessing Flat Files (S3)") — для доступа к файлам */
    accessKeyId: envStr('MASSIVE_ACCESS_KEY_ID'),
    secretAccessKey: envStr('MASSIVE_SECRET_ACCESS_KEY'),
    s3Endpoint: envStr('MASSIVE_S3_ENDPOINT', 'https://files.massive.com'),
    s3Bucket: envStr('MASSIVE_S3_BUCKET', 'flatfiles'),
    /** Запросов в секунду (по умолчанию 4 = обновление каждые 0.25 с). */
    rateLimitPerSecond: Math.max(1, Math.min(20, envNum('MASSIVE_RATE_LIMIT_PER_SECOND', 4))),
    get enabled(): boolean {
      return Boolean(this.apiKey);
    },
    get s3Enabled(): boolean {
      return Boolean(this.accessKeyId && this.secretAccessKey && this.s3Endpoint && this.s3Bucket);
    }
  },

  /** Использовать Massive для рыночных данных (свечи, стакан) вместо Bitget. Требует MASSIVE_API_KEY. */
  get useMassiveForMarketData(): boolean {
    return envBool('USE_MASSIVE_FOR_MARKET_DATA', false) && Boolean(config.massive.apiKey);
  },

  /** Внешний ИИ (OpenAI / Claude) для оценки сигнала перед открытием позиции. Ключи — в .env. */
  openai: {
    apiKey: envStr('OPENAI_API_KEY')
  },
  anthropic: {
    apiKey: envStr('ANTHROPIC_API_KEY')
  },

  /** Timeframes and 48h bar counts */
  timeframes: {
    '1m': 2880,
    '5m': 576,
    '15m': 192,
    '1h': 48,
    '4h': 12,
    '1d': 2
  } as Record<string, number>,

  /** TTL кэша рыночных данных (мс). При Massive 0.25 с: ORDERBOOK/DENSITY=250, стакан/объём/график/перекупленность обновляются каждые 0.25 с. */
  marketDataCacheTtl: {
    orderbook: envNum('MARKET_CACHE_TTL_ORDERBOOK_MS', 250),
    density: envNum('MARKET_CACHE_TTL_DENSITY_MS', 250),
    'candles_1m': envNum('MARKET_CACHE_TTL_CANDLES_1M_MS', 30_000),
    'candles_5m': envNum('MARKET_CACHE_TTL_CANDLES_5M_MS', 90_000),
    'candles_15m': envNum('MARKET_CACHE_TTL_CANDLES_15M_MS', 120_000),
    'candles_1h': envNum('MARKET_CACHE_TTL_CANDLES_1H_MS', 180_000),
    'candles_4h': envNum('MARKET_CACHE_TTL_CANDLES_4H_MS', 300_000),
    'candles_1d': envNum('MARKET_CACHE_TTL_CANDLES_1D_MS', 600_000)
  },

  /** Пороги плотности рынка при открытии позиции */
  density: {
    maxSpreadPct: envNum('DENSITY_MAX_SPREAD_PCT', 0.1),
    minDepthUsd: envNum('DENSITY_MIN_DEPTH_USD', 1000),
    maxPriceDeviationPct: envNum('DENSITY_MAX_PRICE_DEVIATION_PCT', 0.5),
    maxSizeVsLiquidityPct: envNum('DENSITY_MAX_SIZE_VS_LIQUIDITY_PCT', 20)
  }
};

export default config;
