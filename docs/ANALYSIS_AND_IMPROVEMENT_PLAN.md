# Анализ приложения и план улучшений

**Дата:** 2026-02

---

## 1. Обзор приложения

Крипто-трейдинговое приложение с сигналами, авто-торговлей на OKX, демо-счётом, бэктестом и ML-оценкой сделок.

### 1.1 Основные модули

| Модуль | Назначение |
|--------|------------|
| **market.ts** | Анализ рынка (Multi-TF, orderbook, tape), генерация сигналов, авто-цикл (runAutoTradingBestCycle) |
| **autoTrader.ts** | Исполнение ордеров OKX: размер (percent/risk), SL/TP, reserve ratio |
| **coinScanner.ts** | Отбор монет: волатильность, объём, BB Squeeze, EMA, Funding Rate |
| **emotionalFilter** | Cooldown после убытков, дневной drawdown, защита от тильта |
| **externalAiService** | OpenAI/Claude/GLM, CryptoPanic/GNews, retry при 529 |
| **onlineMLService** | Онлайн ML (SGD Logistic Regression) — aiWinProbability |
| **backtester.ts** | Симуляция по свечам (RSI + направление), maxDrawdown, equityCurve |
| **statsDisplayService** | Кастомный display для Dashboard (volumePerDay и т.д.) |
| **orders DB** | SQLite/in-memory, синхронизация с OKX при GET |

### 1.2 Потоки данных

```
Сигнал: CoinScanner → runAnalysis (Multi-TF, orderbook, tape)
  → confidence, R:R, aiProb
  → AI-гейты (minAiProb, external AI, Funding Rate)
  → emotionalFilter
  → executeSignal (OKX)
  → insertOrder / syncClosedOrdersFromOkx

Аналитика: listOrders(closed) → /api/stats, /admin/analytics, TradingAnalytics
```

---

## 2. Аналитика — текущее состояние

### 2.1 Реализовано

| Источник | Метрики | Где отображается |
|----------|---------|------------------|
| **GET /api/stats** | totalPnl, winRate, wins, losses, openCount, totalPnlPercent | Dashboard |
| **GET /admin/analytics** | totalTrades, winRate, profitFactor, best/worst, equityCurve, maxDrawdownUsdt/Pct, sharpeRatio, byDay, avgHoldTimeMinutes | Admin Analytics |
| **Admin Analytics** | Фильтр по clientId, экспорт CSV | Admin Panel |
| **TradingAnalytics** (frontend) | byDirection, byPair, byConfidenceBand, byHour, rrRatio, expectancy, maxConsecutiveWins/Losses, suggestions | AutoTradingPage |
| **getDashboardData** | trades24h, risk (emotionalFilter), keysStats, topUsers | Admin Dashboard |
| **statsDisplayService** | Прирост по дням (volumePerDay, ordersPerDay и т.д.) | Dashboard (display) |
| **Backtester** | equityCurve, maxDrawdown, winrate, profitFactor | BacktestPage |

### 2.2 Пробелы в аналитике

| Пробел | Описание |
|--------|----------|
| **Sortino Ratio** | Как Sharpe, но учитывает только отрицательную волатильность |
| **Корреляция по парам** | Какие пары лучше работают вместе / против |
| **Аналитика по confidence** | Связь confidenceAtOpen → win rate (есть в TradingAnalytics по band) |
| **График equity в Admin** | SVG простой; нет масштабирования, тултипов |
| **Сравнение бэктест vs live** | Разные единицы (абстрактный баланс vs USDT) |
| **Per-user аналитика на фронте** | Пользователь видит только свои сделки через /orders; нет сводки «моя аналитика» |
| **Экспорт по периоду** | CSV — все сделки, нет выбора дат |

---

## 3. Остающиеся проблемы

### 3.1 Бэктест

- Баланс в абстрактных единицах (100), не в USDT
- Нет плеча, комиссий, size как доля баланса
- Нельзя напрямую сравнить с live-торговлей

### 3.2 Синхронизация OKX

- Sync только при GET /orders и GET /trading/positions (при наличии userCreds)
- Нет регулярного cron — ордера, закрытые вне приложения, не подтягиваются автоматически

### 3.3 Конфигурируемость

- **emotionalFilter**: cooldownMs, maxLossStreak, maxDailyDrawdownPct — зашиты в коде
- **sizeMode / riskPct** в AutoTrading: API поддерживает, UI переключателя нет

### 3.4 Торговля

- **Trailing Stop**: нет
- **Частичное закрытие TP** (TP1 50%, TP2 30%, TP3 20%): нет
- **Open Interest фильтр**: опционально, не реализован

---

## 4. План улучшений (приоритизированный)

### Фаза 1 — Быстрые победы (1–2 дня)

| # | Задача | Описание | Эффект |
|---|--------|----------|--------|
| 1 | UI sizeMode в AutoTrading | Переключатель «Размер: % баланса / по риску» + поле riskPct | Пользователь может включить risk-based sizing |
| 2 | Sortino Ratio в Admin Analytics | Добавить расчёт и отображение | Риск-метрика точнее Sharpe |
| 3 | Экспорт CSV по датам | Параметры ?since= & ?until= в /admin/analytics/export | Выгрузка за период |
| 4 | Конфиг emotionalFilter в админке | Пороги cooldown, maxLossStreak, maxDailyDrawdown | Гибкая настройка риска |

### Фаза 2 — Аналитика и UX (3–5 дней)

| # | Задача | Описание | Эффект |
|---|--------|----------|--------|
| 5 | Улучшить график equity | Lightweight-charts или Recharts, тултипы, zoom | Удобнее анализ кривой |
| 6 | Страница «Моя аналитика» | Для авторизованного пользователя: сводка по его сделкам (как Admin, но по userId) | Персональная аналитика |
| 7 | Бэктест в USDT | initialBalance в USDT, size как доля, leverage, комиссии 0.05% | Сопоставимость с live |
| 8 | Сравнение бэктест vs live | Общие метрики (Sharpe, drawdown) в одном формате | Валидация стратегии |

### Фаза 3 — Торговля и надёжность (5–7 дней)

| # | Задача | Описание | Эффект |
|---|--------|----------|--------|
| 9 | Cron sync OKX | Периодический syncClosedOrdersFromOkx (каждые 5–10 мин) для пользователей с ключами | Актуальная БД при закрытии вне приложения |
| 10 | Trailing Stop | Опция в настройках, логика в AutoTradingPage (демо) и autoTrader (OKX) | Защита прибыли |
| 11 | Частичное закрытие TP | TP1 50%, TP2 30%, TP3 20% через reduce-only ордера OKX | Более гибкий выход |
| 12 | Open Interest фильтр | Проверка ликвидности по OI перед входом (опционально) | Меньше ложных входов |

### Фаза 4 — Продвинутая аналитика (по мере необходимости)

| # | Задача | Описание |
|---|--------|----------|
| 13 | Корреляция по парам | Матрица корреляции PnL между парами |
| 14 | A/B тесты стратегий | Сравнение разных preset (scalping vs futures25x) по метрикам |
| 15 | Алерты | Уведомления при drawdown > X%, серия убытков и т.д. |

---

## 5. Краткий чеклист

### Сделано ранее

- [x] PnL DemoPage (убрать × lev)
- [x] Equity curve, max drawdown, Sharpe, byDay, avgHoldTime
- [x] Фильтр по пользователю, CSV экспорт
- [x] sizeMode risk, riskPct в API
- [x] Retry Claude 529
- [x] Zod orders, проверка владельца

### Следующие шаги

- [x] **Фаза 1:** UI sizeMode, Sortino, экспорт по датам, конфиг emotionalFilter
- [x] **Фаза 2:** «Моя аналитика», бэктест в USDT, equity (SVG)
- [x] **Фаза 3:** Cron sync OKX, Trailing Stop (демо), Open Interest фильтр
- [x] **Фаза 4:** Корреляция по парам, алерты (drawdown, loss streak)

---

## 6. Итог

Приложение имеет развитую аналитику (Admin: equity, drawdown, Sharpe, byDay, avgHold; TradingAnalytics: byDirection, byPair, suggestions) и устойчивую цепочку исполнения (AI-гейты, funding, emotional filter, size by risk). Основные направления: **конфигурируемость** (emotionalFilter, sizeMode в UI), **бэктест в USDT**, **cron sync OKX**, **trailing stop и частичное TP**.
