# n8n — готовый workflow для clabx.ru

## Файл

**`n8n-clabx-auto-ready.json`** — полный workflow «Crypto Trading Full — авто-трейд clabx.ru».

- Webhook: `POST /webhook/auto-start` (вызов с сайта по кнопке «Запустить цикл через n8n»).
- Уже подставлено: **X-API-Key** для сайта = `a8f3k2m9xQpL1nR7vY4wZ0cB6hJ5tU` (как в TRADING_SIGNAL_API_KEY на сервере).

## Что вставить в n8n после импорта

В workflow есть три плейсхолдера — замените их в нодах на свои значения:

| Нода | Что заменить | Где взять |
|------|----------------|-----------|
| **News API** | `ВСТАВЬТЕ_NEWSAPI_KEY` | [newsapi.org](https://newsapi.org) — бесплатный ключ |
| **AI оценка (Anthropic)** | `ВСТАВЬТЕ_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) — API key |
| **Telegram уведомление** | в URL: `ВСТАВЬТЕ_TELEGRAM_BOT_TOKEN` | Токен бота от [@BotFather](https://t.me/BotFather) |

В n8n: откройте каждую ноду → найдите текст `ВСТАВЬТЕ_...` → вставьте свой ключ → сохраните workflow.

## Импорт

1. n8n → **Workflows** → **Import from File** (или вставка JSON).
2. Выберите `n8n-clabx-auto-ready.json`.
3. Замените три плейсхолдера (см. таблицу выше).
4. Включите workflow (Active: On).
5. Webhook будет доступен по адресу: `http://ВАШ_N8N_IP:5678/webhook/auto-start` (на VPS 188.127.230.83: `http://188.127.230.83/webhook/auto-start`).

## Цепочка

Кнопка на clabx.ru/auto → backend вызывает n8n webhook → топ-10 монет Binance → анализ 1m/5m/1h + стакан → агрегат + новости → AI (Claude) → ответ на сайт + Telegram + ответ в браузер.
