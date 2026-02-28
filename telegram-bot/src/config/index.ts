import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const loadEnv = () => {
  const cwd = process.cwd();
  const backendEnv = path.join(cwd, '..', 'backend', '.env');
  const localEnv = path.join(cwd, '.env');

  if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv });
  } else if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
  } else {
    dotenv.config();
  }
};

loadEnv();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  BOT_WEBHOOK_SECRET: process.env.BOT_WEBHOOK_SECRET || '',
  API_BASE_URL: (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
};

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан. Добавьте в backend/.env');
  process.exit(1);
}

if (!config.BOT_WEBHOOK_SECRET) {
  console.error('BOT_WEBHOOK_SECRET не задан. Добавьте в backend/.env');
  process.exit(1);
}
