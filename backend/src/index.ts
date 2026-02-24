import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Загрузка .env: при запуске из Electron cwd = корень проекта — грузим backend/.env
const cwd = process.cwd();
const rootEnv = path.join(cwd, '.env');
const backendEnv = path.join(cwd, 'backend', '.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });
if (!fs.existsSync(rootEnv) && !fs.existsSync(backendEnv)) dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { validateEnvironment } from './lib/envValidator';

import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import v1Router from './routes/v1';
import { createWebSocketServer, getBroadcastBreakout } from './websocket';
import { eventBus } from './lib/eventBus';
import { startDepositScanner } from './services/depositScanner';
import { startCopyTradingDepositScanner } from './services/depositService';
import { initDb, getDb, isMemoryStore, getSetting, listOrders } from './db';
import { cleanupExpiredSessions } from './db/authDb';
import { preloadAdminTokens } from './services/adminService';
import { restoreAutoTradingState } from './routes/market';
import { loadModel as loadMLModel, warmUpFromDb as mlWarmUp } from './services/onlineMLService';
import { emotionalFilterInstance } from './services/emotionalFilter';
import { seedDefaultAdmin } from './db/seed';
import { notifyBreakoutAlert } from './services/notificationService';
import { startBreakoutMonitor } from './services/breakoutMonitor';
import { startBitgetSyncCron } from './services/bitgetSyncCron';
import { compression } from './middleware/compression';

const app = express();
const server = createServer(app);
createWebSocketServer(server);
startBreakoutMonitor({
  intervalMs: 15_000,
  topN: 5,
  minConfidence: 0.75,
  onAlert: (alert) => {
    eventBus.emitBreakout(alert);
    notifyBreakoutAlert({
      symbol: alert.symbol,
      direction: alert.breakout.direction,
      confidence: alert.breakout.confidence,
      levelPrice: alert.breakout.level?.price,
      entryZone: alert.breakout.entryZone
    });
  }
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:', 'https:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// CORS
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length > 0 ? {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Bot-Token', 'X-CSRF-Token']
} : undefined));
app.use(compression());
app.use(express.json({ limit: '64kb' }));

// Health (before /api mount so it's not swallowed by v1Router)
const healthHandler = (_req: express.Request, res: express.Response) => {
  try {
    const dbMode = isMemoryStore() ? 'memory' : 'sqlite';
    let databaseOk = true;
    try {
      const db = getDb();
      if (db && typeof db.prepare === 'function') db.prepare('SELECT 1').get();
    } catch {
      databaseOk = false;
    }
    res.json({
      status: 'ok',
      service: 'CryptoSignal Pro API',
      exchange: 'OKX',
      database: dbMode,
      databaseOk,
      okxConfigured: config.okx.hasCredentials
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: (e as Error).message });
  }
};
app.get('/api/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// API v1 + backward compatibility
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

startDepositScanner();
startCopyTradingDepositScanner();

app.use(errorHandler);

function getFrontendPath(): string | null {
  const candidates: string[] = [];
  const inElectron = typeof process !== 'undefined' && (process as NodeJS.Process & { versions?: { electron?: string } }).versions?.electron;
  if (inElectron) {
    const cwd = process.cwd();
    candidates.push(path.resolve(cwd, 'frontend', 'dist'));
    try {
      const { app: electronApp } = require('electron');
      candidates.push(path.join(electronApp.getAppPath(), 'frontend', 'dist'));
    } catch (err) { logger.warn('Server', (err as Error).message); }
  }
  candidates.push(path.resolve(__dirname, '../../frontend/dist'));
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
      return path.resolve(dir);
    }
  }
  return null;
}

const frontendPath = getFrontendPath();
if (frontendPath) {
  logger.info('Server', `Frontend: ${frontendPath}`);
  // Хэшированные ассеты Vite (JS/CSS в /assets/) кэшируем на 1 год (immutable)
  app.use('/assets', express.static(path.join(frontendPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
    index: false,
    etag: true,
    lastModified: true,
  }));
  // index.html и остальные файлы — без кэша (контент меняется при деплое)
  app.use(express.static(frontendPath, {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  app.get('*', (_, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  const triedPaths = [
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(__dirname, '../../frontend/dist')
  ];
  logger.info('Server', `Frontend not found. Tried: ${triedPaths.join('; ')}`);
  app.get('*', (_, res) => {
    res.status(200).contentType('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head>
      <body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#eee;">
        <h1>Фронтенд не найден</h1>
        <p>Папка frontend/dist не найдена. Выполните в корне проекта: <code>npm run build</code></p>
        <p>Проверенные пути:</p><ul>${triedPaths.map((p) => `<li>${p}</li>`).join('')}</ul>
      </body></html>`);
  });
}

export async function startServer(port: number = config.port): Promise<void> {
  // Validate environment variables (fail fast in production)
  validateEnvironment();

  initDb();
  seedDefaultAdmin();
  preloadAdminTokens();
  const efConfig = getSetting('emotional_filter_config');
  if (efConfig) {
    try {
      const c = JSON.parse(efConfig) as { cooldownMinutes?: number; maxLossStreak?: number; maxDailyDrawdownPct?: number };
      emotionalFilterInstance.setConfig(c);
    } catch (err) { logger.warn('Server', (err as Error).message); }
  }
  logger.info('Server', isMemoryStore() ? 'Database: in-memory (native SQLite unavailable)' : 'Database: SQLite initialized');
  loadMLModel();
  mlWarmUp((opts) => listOrders(opts) as any);
  logger.info('Server', config.autoTradingExecutionEnabled
    ? 'Auto-trading execution: ENABLED (AUTO_TRADING_EXECUTION_ENABLED=1)'
    : 'Auto-trading execution: DISABLED. Добавьте AUTO_TRADING_EXECUTION_ENABLED=1 в .env для открытия ордеров.');
  restoreAutoTradingState();

  // Session cleanup cron — every 30 minutes, remove expired sessions
  const sessionCleanupTimer = setInterval(() => {
    try {
      const deleted = cleanupExpiredSessions();
      if (deleted > 0) logger.info('Server', `Cleaned up ${deleted} expired sessions`);
    } catch (err) { logger.warn('Server', `Session cleanup error: ${(err as Error).message}`); }
  }, 30 * 60 * 1000);
  sessionCleanupTimer.unref();

  const host = process.env.HOST || '0.0.0.0';
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      logger.info('Server', `API: http://${host}:${port}`);
      logger.info('Server', `WebSocket: ws://${host}:${port}/ws`);
      startBitgetSyncCron();
      resolve();
    });
  });
}

// Предотвращение падения процесса из‑за необработанных rejections (авто-торговля, внешний ИИ и т.д.)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Server', `Unhandled rejection: ${reason}`);
});

// Run standalone if executed directly (npm run start)
if (require.main === module) {
  startServer();
}
