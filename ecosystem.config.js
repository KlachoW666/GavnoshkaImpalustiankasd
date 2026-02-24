/**
 * PM2 config для деплоя на VPS.
 * Запуск из корня проекта: pm2 start ecosystem.config.js
 * Сайт (backend) + Telegram-бот на одной машине (clabx.ru).
 * Бот читает backend/.env (TELEGRAM_BOT_TOKEN, BOT_WEBHOOK_SECRET, API_BASE_URL).
 * n8n — на отдельном VPS, синхронизация по мере подключения.
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
    }
  ]
};
