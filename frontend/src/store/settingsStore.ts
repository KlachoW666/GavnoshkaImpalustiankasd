const STORAGE_KEY = 'clabx-settings';

export interface Settings {
  connections: {
    /** Bitget — биржа для автоторговли (API Key, Secret, Passphrase). */
    bitget: { enabled: boolean; apiKey: string; apiSecret: string; passphrase: string };
    /** Bitget Demo — ключи для тестирования стратегий. */
    bitgetDemo: { enabled: boolean; apiKey: string; apiSecret: string; passphrase: string };
    /** Прокси для биржи: http://user:pass@ip:port */
    proxy?: string;
    /** Massive.com — API key и/или S3 (Access Key ID, Secret, Endpoint, Bucket) */
    massive: {
      enabled: boolean;
      apiKey: string;
      accessKeyId: string;
      secretAccessKey: string;
      s3Endpoint: string;
      bucket: string;
    };
    tradingview: { enabled: boolean };
    scalpboard: { enabled: boolean; apiKey: string };
  };
  analysis: {
    timeframe: string;
    candlePatterns: boolean;
    orderbookAnalysis: boolean;
    volumeAnalysis: boolean;
    minConfidence: number;
    minRR: number;
  };
  notifications: {
    desktop: boolean;
    sound: boolean;
    long: boolean;
    short: boolean;
    minConfidence: number;
    telegram: { enabled: boolean; botToken: string; chatId: string };
  };
  display: {
    theme: 'dark' | 'light';
    language: 'ru' | 'en';
    chartStyle: 'candles' | 'heikin-ashi' | 'line';
    orderbookStyle: 'default' | 'grouped' | 'heatmap';
  };
  risk: {
    maxPositionPercent: number;
    defaultStopLoss: number;
    takeProfitLevels: string;
    trailingStop: boolean;
    trailingStopPercent: number;
  };
}

const defaults: Settings = {
  connections: {
    bitget: { enabled: true, apiKey: '', apiSecret: '', passphrase: '' },
    bitgetDemo: { enabled: false, apiKey: '', apiSecret: '', passphrase: '' },
    proxy: '',
    massive: {
      enabled: false,
      apiKey: '',
      accessKeyId: '',
      secretAccessKey: '',
      s3Endpoint: 'https://files.massive.com',
      bucket: 'flatfiles'
    },
    tradingview: { enabled: true },
    scalpboard: { enabled: false, apiKey: '' }
  },
  analysis: {
    timeframe: '5m',
    candlePatterns: true,
    orderbookAnalysis: true,
    volumeAnalysis: true,
    minConfidence: 70,
    minRR: 2
  },
  notifications: {
    desktop: true,
    sound: true,
    long: true,
    short: true,
    minConfidence: 75,
    telegram: { enabled: false, botToken: '', chatId: '' }
  },
  display: {
    theme: 'dark',
    language: 'ru',
    chartStyle: 'candles',
    orderbookStyle: 'default'
  },
  risk: {
    maxPositionPercent: 10,
    defaultStopLoss: 1.5,
    takeProfitLevels: '1, 2, 3',
    trailingStop: false,
    trailingStopPercent: 1
  }
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...defaults, ...parsed };
      if (parsed?.notifications) {
        merged.notifications = { ...defaults.notifications, ...parsed.notifications, telegram: { ...defaults.notifications.telegram, ...(parsed.notifications.telegram || {}) } };
      }
      if (parsed?.connections) {
        merged.connections = {
          ...defaults.connections,
          ...parsed.connections,
          bitget: { ...defaults.connections.bitget, ...(parsed.connections.bitget ?? parsed.connections.okx) },
          bitgetDemo: { ...defaults.connections.bitgetDemo, ...parsed.connections.bitgetDemo },
          proxy: parsed.connections?.proxy ?? defaults.connections.proxy ?? '',
          massive: {
            ...defaults.connections.massive,
            ...parsed.connections.massive,
            s3Endpoint: parsed.connections?.massive?.s3Endpoint ?? defaults.connections.massive.s3Endpoint,
            bucket: parsed.connections?.massive?.bucket ?? defaults.connections.massive.bucket
          },
          tradingview: { ...defaults.connections.tradingview, ...parsed.connections.tradingview },
          scalpboard: { ...defaults.connections.scalpboard, ...parsed.connections.scalpboard }
        };
      }
      return merged;
    }
  } catch { }
  return { ...defaults };
}

function save(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { }
}

let settings = load();

function applyTheme(theme: Settings['display']['theme']) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
}

// Применяем тему при инициализации
if (typeof window !== 'undefined') {
  applyTheme(settings.display.theme);
}

export function getSettings(): Settings {
  return settings;
}

export function updateSettings(partial: Partial<Settings>) {
  settings = { ...settings, ...partial };
  applyTheme(settings.display.theme);
  save(settings);
  return settings;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  if (key === 'display') {
    applyTheme((value as Settings['display']).theme);
  }
  save(settings);
  return settings;
}
