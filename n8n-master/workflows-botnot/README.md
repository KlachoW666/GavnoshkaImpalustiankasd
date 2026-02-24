# Workflows BotNot для n8n

Эта папка содержит workflow, синхронизированный с `scenarN8N/site-analysis-open-wait.json` в корне проекта BotNot.

## site-analysis-open-wait.json

- **Назначение**: анализ по скринеру, 1m/5m/1h, решение OPEN/WAIT + LONG/SHORT для сайта.
- **Webhook**: POST на путь `/webhook/analysis` (или `/webhook-test/analysis` в тестовом режиме).
- **Backend**: в узле Config задан `http://localhost:3000` — при запуске на одной машине бэкенд должен быть на порту 3000.

При изменении workflow в `scenarN8N/site-analysis-open-wait.json` скопируйте обновлённый JSON сюда (или наоборот), чтобы версии совпадали.
