/**
 * PM2 config для деплоя на VPS.
 * Запуск из корня проекта: pm2 start ecosystem.config.js
 * Сайт (backend) + Telegram-бот + n8n на одной машине.
 * Бот читает backend/.env (TELEGRAM_BOT_TOKEN, BOT_WEBHOOK_SECRET, API_BASE_URL).
 * n8n: clabx.ru/n8n/ (через Nginx), локально http://localhost:5678. Webhook: clabx.ru/n8n/webhook/analysis
 */
module.exports = {
  apps: [
    {
      name: 'cryptosignal',
      script: 'backend/dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'telegram-bot',
      script: 'telegram-bot/dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '150M',
      env: {
        API_BASE_URL: 'http://localhost:3000'
      },
      env_production: {
        API_BASE_URL: 'http://localhost:3000'
      }
    },
    {
      name: 'n8n',
      script: 'npx',
      args: ['n8n'],
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        N8N_HOST: '0.0.0.0',
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',
        N8N_PATH: '/n8n',
        N8N_EDITOR_BASE_URL: 'https://clabx.ru/n8n',
        WEBHOOK_URL: 'https://clabx.ru/n8n/'
      },
      env_production: {
        N8N_HOST: '0.0.0.0',
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',
        N8N_PATH: '/n8n',
        N8N_EDITOR_BASE_URL: 'https://clabx.ru/n8n',
        WEBHOOK_URL: 'https://clabx.ru/n8n/'
      }
    }
  ]
};
