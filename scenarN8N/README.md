# Сценарии n8n для BotNot

## Workflow: Сайт — анализ по скринеру, 1m/5m/1h, OPEN/WAIT + LONG/SHORT

Файл **`site-analysis-open-wait.json`** — полная автоматизация для **сайта**: по запросу (например ETH) делает анализ на основе скринера монет, сравнивает 1m/5m/1h (свечи+объём), группирует данные и даёт предложение: открывать сделку или ждать; если открывать — LONG или SHORT. Сайт на основе введённых пользователем рисков может предлагать «открывать сделку» или «подождать лучших условий».

### Что делает

1. **Триггер**: Webhook POST от сайта с телом `{ "symbol": "ETH", "riskPct": 0.02, "minConfidence": 0.65 }`.
2. **Символ**: если передан `symbol` — используется он; если нет — вызывается **скринер** (`GET /api/scanner/top`), берётся топ монета.
3. **Анализ 1m, 5m, 1h**: три запроса к бэкенду `POST /api/market/analyze/{symbol}` (свечи+объём) для таймфреймов 1m, 5m, 1h.
4. **NewsApi**: параллельно запрашиваются новости по символу (контекст для пользователя).
5. **Группировка и решение**: объединение результатов по таймфреймам, голосование LONG/SHORT (минимум 2 из 3 ТФ), сравнение с `minConfidence` и `riskPct` → **recommendation** (OPEN/WAIT), **direction** (LONG/SHORT или null), **suggestionForUser** (open/wait).
6. **Ответ сайту**: JSON с полями `recommendation`, `direction`, `suggestionForUser`, `summary`, `analyses`, `entry`, `stopLoss`, `takeProfit`, `newsSnippet` и др. Сайт на основе этих данных и введённых пользователем рисков предлагает: открывать сделку или подождать лучших условий.

### Настройки (вшиты в узел «Config»)

| Параметр | Значение по умолчанию |
|----------|------------------------|
| **backendUrl** | `http://localhost:3000` |
| **telegramBotToken** | `8558861792:AAECPXLWeRUlgeQcQzo3fLrvkzAbdNyF0dg` |
| **newsApiKey** | `adba7eb9ba2a48ec96afcc63282d2dc0` |

Бэкенд в `.env`: **BINANCE_API_KEY**, **BINANCE_API_SECRET**, **ANTHROPIC_API_KEY** (как в проекте).

### Импорт и использование

1. **Import** в n8n файл **`site-analysis-open-wait.json`**.
2. Задайте **backendUrl** в узле **Config** (если не localhost).
3. После активации workflow получите **Webhook URL** (например `https://your-n8n.com/webhook/analysis`).
4. Сайт отправляет **POST** на этот URL с телом:
   - `symbol` (опционально) — тикер, например `ETH`; если не передан — используется топ из скринера.
   - `riskPct` (опционально) — доля риска, например `0.02`.
   - `minConfidence` (опционально) — минимальная уверенность для OPEN, например `0.65`.
5. В ответ приходит JSON с **recommendation** (OPEN/WAIT), **direction** (LONG/SHORT), **suggestionForUser** (open/wait), **summary**, **analyses**, **entry**, **stopLoss**, **takeProfit**, **newsSnippet**. Сайт использует это и настройки рисков пользователя, чтобы показать: «открывать сделку» или «подождать лучших условий».

---

## Workflow: Анализ ETH/крипты по запросу в Telegram (1m, 5m, 1h)

Файл **`eth-analysis-telegram-bot.json`** — готовая конфигурация для импорта в n8n.

### Что делает

1. **Триггер**: сообщение в Telegram (любой текст или команда вида `/analyze ETH`).
2. **Извлечение символа**: из текста берётся тикер (ETH, BTC, SOL и др.) и приводится к формату `SYMBOL-USDT`.
3. **Анализ по трём таймфреймам**: три параллельных запроса к вашему бэкенду:
   - `POST /api/market/analyze/{symbol}` с `{"timeframe": "1m"}`
   - то же для `5m` и `1h`
4. **Сводка**: объединение результатов 1m, 5m, 1h и формирование рекомендации по фьючерсам (направление, вход, стоп, тейк-профиты).
5. **Ответ в Telegram**: отправка сводки и рекомендации в тот же чат.

### Настройки (уже вшиты в узел «Config»)

| Параметр | Значение по умолчанию |
|----------|------------------------|
| **backendUrl** | `http://localhost:3000` |
| **telegramBotToken** | `8558861792:AAECPXLWeRUlgeQcQzo3fLrvkzAbdNyF0dg` |
| **newsApiKey** | `adba7eb9ba2a48ec96afcc63282d2dc0` |

При необходимости измените их в узле **Config** после импорта.

### Бэкенд (.env)

На бэкенде должны быть заданы (в `backend/.env`):

- **Binance**: `BINANCE_API_KEY`, `BINANCE_API_SECRET` (для рыночных данных и анализа).
- **Внешний ИИ (оценка сигналов)**: `ANTHROPIC_API_KEY`.

Пример из вашего проекта:

```env
BINANCE_API_KEY=wltDICdHNbkbpm3mkKD9ZKPTPQn9DGYREgWPCSWMYDoAFzoisNjpZlZnxDoQdfO4
BINANCE_API_SECRET=hTCisb23WDohLRTSEANvip60UdUasvQeQE5YpTBe9FaMdWNwO0DeZnHRYnKqw2OL
ANTHROPIC_API_KEY=sk-ant-api03-...
```

NewsApi ключ уже вшит в n8n (узел Config); при желании его можно использовать в отдельных шагах для новостного контекста.

### Импорт в n8n

1. Откройте n8n.
2. **Workflows** → **Import from File** (или меню **⋯** → **Import**).
3. Выберите файл **`eth-analysis-telegram-bot.json`**.
4. Создайте учётные данные для Telegram:
   - Узел **«Сообщение в Telegram»** запросит credential **«Telegram Bot BotNot»**.
   - Создайте credential типа **Telegram API** и укажите **Bot Token**:  
     `8558861792:AAECPXLWeRUlgeQcQzo3fLrvkzAbdNyF0dg`.
5. Если бэкенд не на `localhost:3000`, измените **backendUrl** в узле **Config** на ваш URL (например `https://your-api.com`).
6. Активируйте workflow (переключатель **Active**).

### Как пользоваться

- Напишите боту в Telegram:
  - **ETH** или **BTC** — анализ по этому символу (1m, 5m, 1h).
  - **/analyze SOL** — анализ SOL.
- Поддерживаются тикеры: ETH, BTC, SOL, BNB, XRP, DOGE, AVAX, MATIC, LINK, DOT, ADA, APT, ARB, OP, SUI, SEI, TIA, INJ, PEPE, WIF и другие (до 6 символов).

### Важно

- Перед использованием убедитесь, что **бэкенд запущен** (например, `npm run dev` в папке `backend/`).
- Файл содержит токены и ключи — не публикуйте его в открытых репозиториях.
