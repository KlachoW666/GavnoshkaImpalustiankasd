# Анализ приложения и предложения по улучшению

**Дата:** 2026-02

---

## 1. Архитектура приложения

### 1.1 Основные компоненты

| Компонент | Назначение |
|-----------|------------|
| **market.ts** | Анализ рынка (Multi-TF, orderbook, tape), генерация сигналов, авто-торговля (runAutoTradingBestCycle) |
| **autoTrader.ts** | Исполнение ордеров на OKX: размер позиции, SL/TP, reserve ratio |
| **coinScanner.ts** | Отбор монет: волатильность, объём, BB Squeeze, EMA alignment, Funding Rate |
| **emotionalFilter** | Cooldown после убытков, дневной drawdown, защита от тильта |
| **externalAiService** | OpenAI/Claude/GLM для оценки сигнала, CryptoPanic/GNews для новостей |
| **onlineMLService** | Онлайн ML для вероятности выигрыша (aiWinProbability) |
| **orders (API + DB)** | Хранение ордеров, синхронизация с OKX |

### 1.2 Цепочка перед открытием ордера

1. CoinScanner (опционально) — выбор топ монет
2. runAnalysis — Multi-TF, orderbook, свечи, RSI/ATR
3. Фильтры: confidence ≥ 75%, R:R ≥ 1.2, ATR ≥ 0.2%
4. Скоринг: conf + rr + confluence + aiProb
5. AI-гейт: effectiveProbability ≥ minAiProb (при достаточных ML-примерах)
6. Внешний ИИ: OpenAI/Claude ≥ minScore
7. Funding Rate: избегать LONG при высоком плюсе, SHORT при высоком минусе
8. emotionalFilter: cooldown, daily drawdown
9. executeSignal → OKX

---

## 2. Аналитика — текущее состояние

### 2.1 Что есть

- **Stats API** (`/api/stats`): totalPnl, winRate, wins/losses, openCount
- **Admin Analytics** (`/admin/analytics`): totalTrades, winRate, profitFactor, best/worst trade, таблица сделок
- **TradingAnalytics** (на странице AutoTrading): byDirection, byPair, byConfidenceBand, byHour, rrRatio, expectancy, maxConsecutiveWins/Losses, suggestions
- **Dashboard**: отображаемая статистика (с возможностью кастомного display через statsDisplayService)

### 2.2 Пробелы

- Нет **кривой эквити** (equity curve) — график PnL во времени
- Нет **разбивки по дням/неделям** — какой период самый прибыльный
- Нет **Sharpe Ratio / Sortino** — риск-скорректированная доходность
- Нет **max drawdown** — максимальное просадка от пика
- Нет **корреляции по парам** — какие монеты лучше работают вместе/против
- Нет **аналитики по времени удержания** — сколько в среднем держим позицию
- Admin trades — без фильтра по пользователю (все сделки в куче)

---

## 3. Открытие позиций и ордера — проблемы

### 3.1 Критично: PnL в DemoPage

**Проблема:** В `DemoPage.tsx` при закрытии позиции PnL считается с умножением на leverage:

```ts
const pnl = ... * pos.size * lev
```

При `size` = номинал в USDT и USDT-M фьючерсах формула верная: `PnL = (priceChg%) × size`. Умножение на `lev` завышает PnL в `lev` раз.

**Исправление:** Убрать `* lev` — как в AutoTradingPage.

### 3.2 Размер позиции: только % от баланса

**Сейчас:** sizePercent от баланса, резерв 70–85%, без учёта расстояния до SL.

**Предложение:** Добавить режим «по риску»:
- riskPct = 1–2% баланса на сделку
- size = riskUsd / stopPct (где stopPct = расстояние до SL в %)
- Ограничить сверху sizePercent (как сейчас)

### 3.3 Trailing Stop

**Сейчас:** SL/TP задаются при входе и не двигаются.

**Предложение:** Опция Trailing Stop — сдвигать SL в прибыль при движении цены (например, на 0.5 ATR от максимума/минимума).

### 3.4 Частичное закрытие (TP1, TP2, TP3)

**Сейчас:** Один TP уровень; можно задать массив, но логика закрытия «всё или ничего» при первом достижении.

**Предложение:** Частичное закрытие: 50% на TP1, 30% на TP2, 20% на TP3. OKX поддерживает reduce-only ордера.

---

## 4. Предложения по улучшению — приоритеты

### P0 — Критично

| Задача | Файл | Описание |
|--------|------|----------|
| Исправить PnL при закрытии в DemoPage | `DemoPage.tsx` | Убрать `* lev` в формулах pnl и pnlPercent |

### P1 — Аналитика

| Задача | Описание |
|--------|----------|
| Equity curve | График накопленного PnL по времени (по дням) |
| Max Drawdown | Максимальная просадка от пика (в % и USDT) |
| Sharpe Ratio | (avgReturn - riskFree) / stdReturn за период |
| Разбивка по дням | Таблица: дата, PnL дня, кол-во сделок, win rate |
| Среднее время удержания | Mean hold time в минутах/часах |

### P2 — Открытие позиций

| Задача | Описание |
|--------|----------|
| Режим «размер по риску» | riskPct, size = riskUsd / stopPct |
| Trailing Stop | Опция в UI и в autoTrader |
| Retry при Claude 529 | 2–3 попытки с задержкой при Overloaded |
| Фильтр по Open Interest | Не открывать при аномально низкой ликвидности (опционально) |

### P3 — Ордера и API

| Задача | Описание |
|--------|----------|
| Валидация POST/PATCH orders | Zod-схемы, проверка владельца при PATCH |
| Частичное закрытие TP | 50% на TP1, 30% на TP2, 20% на TP3 |
| Синхронизация OKX → БД | Регулярный sync (cron) для закрытых позиций |

### P4 — Бэктест и сопоставимость

| Задача | Описание |
|--------|----------|
| Бэктест в USDT | balance в USDT, size как доля, leverage, комиссии |
| Сравнение с live | Один формат метрик для бэктеста и реальной торговли |

### P5 — UX и конфиг

| Задача | Описание |
|--------|----------|
| Admin Analytics: фильтр по пользователю | Выбор user_id для аналитики |
| Конфигурируемый emotionalFilter | Пороги cooldown, maxLossStreak, maxDailyDrawdown в админке |
| Экспорт отчёта | CSV/Excel истории сделок |

---

## 5. Краткий чеклист внедрения

- [x] **P0:** DemoPage — исправить PnL (убрать × lev)
- [x] **P1:** Добавить equity curve + max drawdown в AdminAnalytics
- [x] **P1:** Добавить Sharpe Ratio и разбивку по дням
- [x] **P2:** Опция «размер по риску» в AutoTrading (sizeMode, riskPct в API)
- [x] **P2:** Retry при Claude 529
- [x] **P3:** Zod-схемы для orders API, проверка владельца
- [ ] **P4:** Бэктест в USDT
- [x] **P5:** Фильтр по пользователю в Admin Analytics + CSV экспорт

---

## 6. Итог

Приложение имеет продуманную цепочку: анализ → скоринг → AI-гейты → funding → emotional filter → исполнение. Основные направления улучшений:

1. **Исправить ошибку PnL** в DemoPage.
2. **Расширить аналитику** — equity curve, drawdown, Sharpe, разбивка по времени.
3. **Гибкость размера позиции** — режим «по риску» и trailing stop.
4. **Надёжность** — retry при 529, валидация API, регулярный sync с OKX.
