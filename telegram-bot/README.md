# Telegram-бот CLABX

Бот для продажи PREMIUM-подписки через Telegram Stars. Запускается на том же сервере, что и сайт.

## Переменные окружения

Задаются в **`backend/.env`** (бот читает этот файл при запуске из корня проекта):

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен бота от [@BotFather](https://t.me/BotFather) |
| `BOT_WEBHOOK_SECRET` | Секрет для вызова API сайта (тот же, что в backend) |
| `API_BASE_URL` | URL бэкенда (на том же сервере: `http://localhost:3000`) |

## Запуск

### Вместе с сайтом (PM2)

Из корня проекта:

```bash
npm run build          # собирает backend, frontend и бота
pm2 start ecosystem.config.js
```

Будут запущены два процесса: `cryptosignal` (сайт) и `telegram-bot`.

### Отдельно (для разработки)

```bash
cd telegram-bot
npm run build
npm run start
# или с автоперезагрузкой:
npm run dev
```

Убедитесь, что backend уже запущен (бот дергает `/api/bot/plans` и `/api/bot/register-key`).

## Функционал

- `/start` — приветствие и кнопка «Получить PREMIUM-подписку»
- Выбор тарифа из списка с сайта (GET /api/bot/plans)
- Оплата через Telegram Stars (XTR)
- После оплаты: генерация ключа, регистрация на сайте (POST /api/bot/register-key), отправка ключа пользователю
