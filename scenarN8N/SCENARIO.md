# Полный сценарий интеграции CLABX с n8n

Документ описывает архитектуру сайта CLABX (Crypto Signal Pro), все API и события, а также готовые сценарии для n8n.

---

## 1. Обзор платформы CLABX

**CLABX** — веб-платформа для крипто-трейдинга с сигналами, авто-трейдингом, копи-трейдингом и админ-панелью.

### 1.1 Основные возможности

| Область | Описание |
|--------|----------|
| **Авторизация** | Регистрация, логин, сессии (Bearer), активация по ключу, Telegram-регистрация, сброс пароля |
| **Сигналы** | Генерация торговых сигналов (LONG/SHORT), история, обновление трейлинг-стопа |
| **Рынок** | Свечи, тикеры, стакан, анализ символа, авто-анализ, тестовый сигнал |
| **Авто-трейдинг** | Запуск/остановка цикла анализа, позиции Bitget, уведомления о сделках |
| **Копи-трейдинг** | Подписка на провайдеров, баланс, пополнения/выводы, адреса депозитов |
| **Кошелёк** | Баланс, депозит-адрес, вывод, позиции, триггер-ордера |
| **Админ** | Пользователи, группы, ключи активации, планы подписок, новости, прокси, финансы, транзакции, депозиты/выводы |
| **Уведомления** | Отправка в Telegram (bot + chatId + message) через API |
| **Бот/внешний мир** | Регистрация по ключу, отзыв ключа, планы, токены регистрации, сброс пароля |

### 1.2 Технологии

- **Backend:** Express.js, SQLite (или in-memory), WebSocket (`/ws`)
- **Frontend:** React, Vite, React Router, TanStack Query
- **API:** REST под `/api` и `/api/v1`, версионирование v1

---

## 2. Базовый URL и аутентификация

- **Базовый URL API:** `https://ВАШ_ДОМЕН/api` или `https://ВАШ_ДОМЕН/api/v1`
- **Health:** `GET /api/health` или `GET /api/v1/health` — без авторизации.
- **Пользовательский API:** заголовок `Authorization: Bearer <token>` (токен после логина).
- **Админ API:** заголовок `X-Admin-Token: <admin_token>` (токен после логина в админку).
- **WebSocket:** `wss://ВАШ_ДОМЕН/ws` — после подключения можно отправить `{ "type": "auth", "token": "<user_token>" }`.

---

## 3. Карта API (полная)

### 3.1 Здоровье и общая информация

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| GET | `/api/health` | Статус сервиса, БД, биржа | Нет |
| GET | `/api/v1/health` | То же | Нет |

**Пример ответа /api/health:**
```json
{
  "status": "ok",
  "service": "CryptoSignal Pro API",
  "exchange": "OKX",
  "database": "sqlite",
  "databaseOk": true,
  "okxConfigured": true
}
```

---

### 3.2 Авторизация (`/api/auth`)

| Метод | Путь | Описание | Тело/Параметры |
|-------|------|----------|----------------|
| POST | `/api/auth/register` | Регистрация | `username`, `password` |
| POST | `/api/auth/login` | Вход | `username`, `password` → возвращает `token` |
| POST | `/api/auth/logout` | Выход | — |
| GET | `/api/auth/me` | Текущий пользователь | Bearer |
| GET | `/api/auth/me/stats` | Статистика пользователя | Bearer |
| GET | `/api/auth/me/analytics` | Аналитика | Bearer |
| GET | `/api/auth/me/alerts` | Алерты | Bearer |
| PUT | `/api/auth/me/okx-connection` | Настройка OKX | Bearer, body |
| PUT | `/api/auth/me/bitget-connection` | Настройка Bitget | Bearer, body |
| GET/PUT | `/api/auth/me/massive-api` | Massive API | Bearer |
| PATCH | `/api/auth/me` | Обновление профиля | Bearer |
| POST | `/api/auth/register-by-telegram` | Регистрация через Telegram | `telegramId`, `username`, и др. |
| POST | `/api/auth/reset-password` | Запрос сброса пароля | body |
| POST | `/api/auth/activate` | Активация по ключу | Bearer, `activationKey` |

---

### 3.3 Сигналы (`/api/signals`)

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| GET | `/api/signals` | Список сигналов | Нет (query: `limit`, макс 100) |
| GET | `/api/signals/:id` | Один сигнал | Нет |
| POST | `/api/signals/:id/update-trailing-stop` | Обновить трейлинг-стоп | body |

**Формат сигнала (упрощённо):** `id`, `symbol`, `direction` (LONG/SHORT), `entry_price`, `stop_loss`, `take_profit`, `confidence`, `risk_reward`, `timestamp`, `exchange`, `timeframe`, `triggers`, `aiWinProbability` и др.

---

### 3.4 Рынок и анализ (`/api/market`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/market/candles/:symbol` | Свечи (query: timeframe, limit) |
| GET | `/api/market/exchanges` | Список бирж |
| GET | `/api/market/data-source` | Источник данных |
| GET | `/api/market/ticker/:symbol` | Тикер |
| GET | `/api/market/price/:symbol` | Цена |
| GET | `/api/market/trades/:symbol` | Сделки |
| GET | `/api/market/orderbook/:symbol` | Стакан (query: limit) |
| GET | `/api/market/tickers` | Все тикеры |
| GET | `/api/market/funding` | Фандинг |
| GET | `/api/market/analysis-preview/:symbol` | Превью анализа |
| POST | `/api/market/analyze/:symbol` | Запуск анализа символа |
| POST | `/api/market/auto-analyze/start` | Запуск авто-анализа (requireAuth) |
| POST | `/api/market/auto-analyze/stop` | Остановка авто-анализа |
| GET | `/api/market/auto-analyze/status` | Статус авто-анализа |
| GET | `/api/market/auto-analyze/last-execution` | Последнее выполнение |
| POST | `/api/market/test-signal` | Создать тестовый сигнал (requireAuth) |
| POST | `/api/market/pnl-calc` | Калькулятор PnL |
| GET | `/api/market/signals-night` | Сигналы за ночь (query: hours, limit) |
| POST | `/api/market/analyze-trades` | Анализ сделок |

---

### 3.5 Ордера (`/api/orders`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/orders` | Создать ордер (optionalAuth) |
| PATCH | `/api/orders/:id` | Обновить ордер |
| GET | `/api/orders` | Список ордеров (query: status, limit) |

---

### 3.6 Торговля / авто-трейдинг (`/api/trading`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/trading/state` | Состояние торговли |
| POST | `/api/trading/outcome` | Исход сделки |
| POST | `/api/trading/set-balance` | Установить баланс |
| POST | `/api/trading/reset` | Сброс |
| GET | `/api/trading/notifications` | Уведомления |
| GET | `/api/trading/positions` | Позиции (Bitget и др.) |
| GET | `/api/trading/execution-config` | Конфиг исполнения |
| POST | `/api/trading/notifications` | Настройка уведомлений |

---

### 3.7 Копи-трейдинг (`/api/copy-trading`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/copy-trading/subscribe` | Подписаться на провайдера |
| POST | `/api/copy-trading/unsubscribe` | Отписаться |
| GET | `/api/copy-trading/subscriptions` | Мои подписки |
| GET | `/api/copy-trading/providers` | Провайдеры |
| GET | `/api/copy-trading/check` | Проверка подписки |

---

### 3.8 Copy Trading Extended API (`/api/copy-trading-api`)

| Метод | Путь | Описание | Авторизация |
|-------|------|----------|-------------|
| GET | `/api/copy-trading-api/balance` | Баланс копи-трейдинга | Bearer |
| GET | `/api/copy-trading-api/deposit-addresses` | Адреса пополнения | Нет |
| POST | `/api/copy-trading-api/deposit` | Заявка на пополнение | Bearer, body |
| GET | `/api/copy-trading-api/deposits` | Мои депозиты | Bearer |
| POST | `/api/copy-trading-api/withdraw` | Заявка на вывод | Bearer |
| GET | `/api/copy-trading-api/withdrawals` | Мои выводы | Bearer |
| GET | `/api/copy-trading-api/transactions` | Транзакции | Bearer |
| GET | `/api/copy-trading-api/providers` | Провайдеры со статистикой | Нет |
| GET | `/api/copy-trading-api/providers/:id/stats` | Статистика провайдера | Нет |
| GET | `/api/copy-trading-api/admin/pending` | Ожидающие заявки | Admin |
| GET | `/api/copy-trading-api/admin/deposits/pending` | Ожидающие депозиты | Admin |
| POST | `/api/copy-trading-api/admin/deposits/:txId/approve` | Одобрить депозит | Admin |
| POST | `/api/copy-trading-api/admin/deposits/:txId/reject` | Отклонить депозит | Admin |
| POST | `/api/copy-trading-api/admin/deposits/check` | Проверить депозит | Admin |
| POST | `/api/copy-trading-api/admin/withdrawals/:txId/approve` | Одобрить вывод | Admin |
| POST | `/api/copy-trading-api/admin/withdrawals/:txId/reject` | Отклонить вывод | Admin |
| POST | `/api/copy-trading-api/admin/process/:txId` | Обработать транзакцию | Admin |
| POST | `/api/copy-trading-api/admin/providers` | Добавить провайдера | Admin |
| DELETE | `/api/copy-trading-api/admin/providers/:providerId` | Удалить провайдера | Admin |
| PUT | `/api/copy-trading-api/admin/providers/:providerId` | Обновить провайдера | Admin |
| PATCH | `/api/copy-trading-api/admin/providers/:providerId/stats` | Обновить статистику | Admin |
| GET | `/api/copy-trading-api/admin/deposit-addresses` | Адреса депозитов (админ) | Admin |
| POST | `/api/copy-trading-api/admin/deposit-addresses` | Добавить адрес | Admin |
| PUT | `/api/copy-trading-api/admin/deposit-addresses/:id` | Обновить адрес | Admin |
| DELETE | `/api/copy-trading-api/admin/deposit-addresses/:id` | Удалить адрес | Admin |

---

### 3.9 Кошелёк (`/api/wallet`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/wallet/balance` | Баланс (requireAuth) |
| GET | `/api/wallet/deposit-address` | Адрес депозита |
| POST | `/api/wallet/withdraw` | Вывод |
| GET | `/api/wallet/positions` | Позиции |
| POST | `/api/wallet/open-position` | Открыть позицию |
| GET | `/api/wallet/trigger-orders` | Триггер-ордера |
| POST | `/api/wallet/trigger-order` | Создать триггер-ордер |
| DELETE | `/api/wallet/trigger-orders/:id` | Удалить триггер-ордер |
| POST | `/api/wallet/close-position` | Закрыть позицию |

---

### 3.10 Статистика (`/api/stats`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/stats` | Агрегированная статистика (ордера, пользователи, объём, display) |

**Пример ответа:** `orders` (total, wins, losses, totalPnl, winRate, openCount), `usersCount`, `onlineUsersCount`, `volumeEarned`, `status`, `databaseMode`, `displayEnabled`, `display`.

---

### 3.11 Уведомления (`/api/notify`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/notify/telegram` | Отправить сообщение в Telegram |

**Тело:** `botToken`, `chatId`, `message` (обязательные). Сообщение отправляется с `parse_mode: HTML`.

---

### 3.12 Новости (`/api/news`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/news` | Список опубликованных новостей (query: limit) |

---

### 3.13 Режим пользователя (`/api/user/mode`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/user/mode` | Режим (onboarding и др.) |
| POST | `/api/user/mode` | Установить режим |

---

### 3.14 Сканер, ML, бэктест, соединения, бот

- **Scanner:** `POST /api/scanner/scan`, `GET /api/scanner/top`, `GET /api/scanner/levels/:symbol`, `GET /api/scanner/breakout/:symbol`, `POST /api/scanner/full-analysis`, `GET /api/scanner/mtf/:symbol`, `GET /api/scanner/funding/:symbol`, `GET /api/scanner/volume-profile/:symbol`
- **ML:** `POST /api/ml/trade-outcome`, `POST /api/ml/predict`, `GET /api/ml/stats`
- **Backtest:** `POST /api/backtest/run`
- **Connections:** `POST /api/connections/check`, `GET /api/connections/test-public`
- **Bot:** `POST /api/bot/register-key`, `POST /api/bot/revoke-key`, `GET /api/bot/plans`, `POST /api/bot/create-register-token`, `POST /api/bot/request-password-reset`
- **Social:** `GET /api/social/leaderboard`, `GET /api/social/user/:userId`

---

### 3.15 Админ (`/api/admin`)

Все эндпоинты требуют заголовок `X-Admin-Token`.

- **Сессия:** `POST /api/admin/login` → токен админа.
- **Дашборд:** `GET /api/admin/dashboard`, `GET /api/admin/system/status`, `GET /api/admin/trading/status`, `POST /api/admin/trading/start`, `POST /api/admin/trading/stop`, `POST /api/admin/trading/emergency`.
- **Авто-анализ:** `GET /api/admin/auto-analyze/status`, `GET /api/admin/auto-analyze/last-execution`, `POST /api/admin/auto-analyze/stop`.
- **Эмоциональный фильтр:** `GET /api/admin/emotional-filter`, `PUT /api/admin/emotional-filter`.
- **Ордера:** `POST /api/admin/orders/clear`, `GET /api/admin/trades/history`.
- **Сигналы:** `GET /api/admin/signals/history`.
- **Аналитика:** `GET /api/admin/analytics`, `GET /api/admin/analytics/export`.
- **Логи:** `GET /api/admin/logs`.
- **Пользователи:** `GET /api/admin/users`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/extend-subscription`, `POST /api/admin/users/:id/revoke-subscription`, `POST /api/admin/users/:id/balance`, `PATCH /api/admin/users/:id`, `PUT /api/admin/users/:id`, `POST /api/admin/users/:id/ban`, `POST /api/admin/users/:id/unban`, `DELETE /api/admin/users/:id`, `GET /api/admin/users/export`.
- **Группы:** `GET /api/admin/groups`, `PUT /api/admin/groups/:id`, `POST /api/admin/groups`, `DELETE /api/admin/groups/:id`.
- **Ключи активации:** `GET /api/admin/activation-keys`, `POST /api/admin/activation-keys/generate`, `POST /api/admin/activation-keys/:id/revoke`.
- **Планы подписок:** CRUD для `/api/admin/subscription-plans`.
- **Прокси:** `GET /api/admin/proxies`, `POST /api/admin/proxies`, `DELETE /api/admin/proxies/:id`, `POST /api/admin/proxies/check`.
- **Режим обслуживания:** `GET /api/admin/maintenance`, `POST /api/admin/maintenance`.
- **Конфиг отображения статистики:** `GET /api/admin/stats-display-config`, `PUT /api/admin/stats-display-config`.
- **Новости:** `GET /api/admin/news`, `POST /api/admin/news`, `PUT /api/admin/news/:id`, `DELETE /api/admin/news/:id`.
- **Внешний ИИ:** `GET /api/admin/external-ai`, `PUT /api/admin/external-ai`.
- **Кошелёк:** `GET /api/admin/wallet`, `POST /api/admin/wallet/config`, `POST /api/admin/wallet/custom-address`, `POST /api/admin/wallet/withdrawals/:id/approve`, `POST /api/admin/wallet/withdrawals/:id/reject`.
- **Транзакции:** `GET /api/admin/transactions`.
- **Финансы:** `GET /api/admin/finance/summary`, `GET /api/admin/finance/chart`.
- **Экспорт:** `GET /api/admin/transactions/export`.
- **Депозиты/выводы:** `GET /api/admin/deposits`, `GET /api/admin/withdrawals`.

---

## 4. WebSocket

- **URL:** `wss://ВАШ_ДОМЕН/ws`
- **Авторизация:** после подключения отправить JSON: `{ "type": "auth", "token": "<user_bearer_token>" }`.
- **Входящие от сервера:**
  - `{ "type": "signal", "data": { "signal": { ... }, "breakdown": { ... } } }` — новый торговый сигнал.
  - `{ "type": "BREAKOUT_ALERT", "data": { ... } }` — алерт о пробое.

n8n может работать с API по HTTP; для событий в реальном времени нужен либо опрос API (например, GET /api/signals по расписанию), либо внешний сервис, который слушает WebSocket и дергает webhook n8n.

---

## 5. Сценарии для n8n

### 5.1 Опрос сигналов и уведомление в Telegram

- **Триггер:** Schedule (каждые 5–15 минут).
- **Действия:** HTTP Request → `GET {{BASE_URL}}/api/signals?limit=5`. Обработать JSON, отфильтровать по времени (например, последние 15 мин), сформировать текст.
- **Уведомление:** либо HTTP Request → `POST {{BASE_URL}}/api/notify/telegram` с `botToken`, `chatId`, `message`, либо узел Telegram n8n.

Файл: `workflow-01-signals-to-telegram.json`.

---

### 5.2 Мониторинг здоровья API

- **Триггер:** Schedule (каждые 1–5 минут).
- **Действие:** HTTP Request → `GET {{BASE_URL}}/api/health`.
- **Условие:** если `status !== 'ok'` или `databaseOk === false`.
- **Уведомление:** Telegram/Discord/Email (через ваш API или узлы n8n).

Файл: `workflow-02-health-monitor.json`.

---

### 5.3 Отправка произвольного сообщения в Telegram через API сайта

- **Триггер:** Webhook (n8n) или ручной запуск.
- **Вход:** `botToken`, `chatId`, `message` (из тела запроса или константы).
- **Действие:** HTTP Request → `POST {{BASE_URL}}/api/notify/telegram` с JSON body.

Файл: `workflow-03-notify-telegram.json`.

---

### 5.4 Ежедневный отчёт для админа (статистика + новости)

- **Триггер:** Schedule (раз в день).
- **Действия:**
  - GET `/api/stats` — общая статистика.
  - GET `/api/news?limit=5` — последние новости.
  - (Опционально) GET `/api/admin/dashboard` с `X-Admin-Token` для расширенной сводки.
- **Обработка:** собрать текст отчёта.
- **Уведомление:** Telegram/Email.

Файл: `workflow-04-admin-daily-stats.json`.

---

### 5.5 Webhook: приём внешнего сигнала и уведомление

- **Триггер:** Webhook n8n (POST от внешней системы).
- **Вход:** тело с полями сигнала (symbol, direction, confidence и т.д.).
- **Действия:** валидация → форматирование сообщения → `POST /api/notify/telegram` или узел Telegram.

Файл: `workflow-05-webhook-signal-receiver.json`.

---

## 6. Переменные окружения для n8n

Рекомендуется задать в n8n (или в узлах):

- `CLABX_BASE_URL` — базовый URL сайта (например, `https://your-domain.com`).
- `CLABX_ADMIN_TOKEN` — токен админа (только для сценариев с админ-API).
- `TELEGRAM_BOT_TOKEN` — токен бота (если не передаётся в теле запроса).
- `TELEGRAM_CHAT_ID` — чат для уведомлений.

В импортированных workflow используйте плейсхолдеры вида `{{$env.CLABX_BASE_URL}}` или настройте Credentials в n8n.

---

## 7. Импорт workflow в n8n

1. Откройте n8n → Workflows.
2. Меню (три точки) → **Import from File**.
3. Выберите нужный JSON из папки `scenarN8N`.
4. Замените в узлах HTTP Request базовый URL и при необходимости заголовки (Admin-Token, Bearer).
5. Настройте учётные данные Telegram (если используете встроенный узел Telegram) или оставьте вызов `POST /api/notify/telegram` с подстановкой `botToken` и `chatId`.

---

## 8. Ограничения и лимиты

- **Auth:** rate limit на `/api/auth/*` (например, 20–30 запросов за 15 минут).
- **Signals:** rate limit на `/api/signals` (например, 120 запросов в минуту).
- **Admin:** все админ-эндпоинты требуют валидный `X-Admin-Token`.

Учитывайте лимиты при частом опросе из n8n (достаточно интервала 1–5 минут для здоровья, 5–15 минут для сигналов).

---

*Документ актуален для текущей структуры API проекта CLABX. При изменении роутов или формата ответов обновите сценарии и данный файл.*
