import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import signalsRouter from './routes/signals';
import marketRouter from './routes/market';
import connectionsRouter from './routes/connections';
import notifyRouter from './routes/notify';
import { createWebSocketServer } from './websocket';

const app = express();
const server = createServer(app);
createWebSocketServer(server);

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.use('/api/signals', signalsRouter);
app.use('/api/market', marketRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/notify', notifyRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CryptoSignal Pro API', exchange: 'OKX' });
});

app.use(errorHandler);

function getFrontendPath(): string {
  const inElectron = typeof process !== 'undefined' && (process as NodeJS.Process & { versions?: { electron?: string } }).versions?.electron;
  if (inElectron) {
    const cwd = process.cwd();
    const fromCwd = path.join(cwd, 'frontend', 'dist');
    if (fs.existsSync(fromCwd)) return fromCwd;
    try {
      const { app } = require('electron');
      const fromApp = path.join(app.getAppPath(), 'frontend', 'dist');
      if (fs.existsSync(fromApp)) return fromApp;
    } catch {}
  }
  return path.join(__dirname, '../../frontend/dist');
}

const frontendPath = path.resolve(getFrontendPath());
if (fs.existsSync(frontendPath)) {
  logger.info('Server', `Frontend: ${frontendPath}`);
  app.use(express.static(frontendPath, { index: false }));
  app.get('*', (_, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  logger.info('Server', `Frontend not found at ${frontendPath}, API-only mode`);
}

export async function startServer(port: number = config.port): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info('Server', `API: http://localhost:${port}`);
      logger.info('Server', `WebSocket: ws://localhost:${port}/ws`);
      resolve();
    });
  });
}

// Run standalone if executed directly (npm run start)
if (require.main === module) {
  startServer();
}
