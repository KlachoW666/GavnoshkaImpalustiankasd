# Интеграция материалов курса C:\kyrs (SuperSliv/Stepik)

**Дата:** 2026-02

Папка C:\kyrs содержит курсы по трейдингу, нейросетям и ML. Ниже — соответствие тем курса и реализаций в проекте BotNot.

---

## 1. Структура курса (по именам файлов)

| Файл | Тема | Реализация в проекте |
|------|------|----------------------|
| 2.1 | Нейросети и глубокое обучение | `onlineMLService.ts` (SGD Logistic Regression), `externalAiService.ts` (OpenAI/Claude/GLM) |
| 2.2 | Candlestick анализ | `candleAnalyzer.ts`, `marketAnalysis.ts` — engulfing, hammer, doji, morning/evening star, three soldiers/crows |
| 4.1 | Технический анализ с японскими свечами | `marketAnalysis.ts` (паттерны, RSI, MACD, BB, EMA), `tradingPrinciples.ts` (Nison) |
| 4.2 | Торговля нейросетями в Python | `onlineMLService.ts`, `autoTrader.ts` — aiWinProbability, feedOrderToML, syncOkxClosedOrdersForML |
| 4.3 | Candlestick паттерны | 15+ паттернов в `candleAnalyzer.ts` + `detectPatterns()` в `market.ts` |
| 4.4 | Анализ рынка | `marketAnalysis.ts` (стакан, лента, свечи), `buildAnalysisBreakdown`, multi-TF |
| 5.1 | Управление риском | `tradingPrinciples.ts` (Schwager: 2% risk), `positionSizing.ts`, `emotionalFilter.ts`, Kelly criterion |
| 5.2 | Разработка стратегий | `signalGenerator.ts`, `computeSignal`, preset scalping/futures25x, confluence |
| 6.1 | Kaggle | Структура признаков ML (FEATURE_DIM=9), `extractFeatures` |
| 6.3 | Оптимизация моделей | `effectiveProbability`, `persistModel`, `warmUpFromDb` |

---

## 2. Принципы и источники

| Источник | Внедрено |
|----------|----------|
| **MaksBaks** | Funding Rate (урок 5), Emotional Filter (урок 12), CoinScanner (урок 10) |
| **Schwager** | 1–2% риск на сделку, trailing stop, failed signal (RSI vs цена) |
| **Burniske** | Асимметричный R:R, диверсификация (25% макс на актив) |
| **Nison** | Ложные пробои (объём), паттерны японских свечей |
| **Sinclair** | Волатильность — уменьшение размера при ATR > 1.5× avg |
| **Chan** | Алгоритмическая торговля — размер по риску, ATR, stop/TP |

---

## 3. Внедрённые улучшения (по материалам курса)

### 3.1 Kelly Criterion (управление риском)
- **Формула:** `f* = (p*b - q) / b`, где p=winRate, q=1-p, b=avgWin/avgLoss
- **Использование:** опциональный множитель размера позиции (полный Kelly агрессивен; используют ½ Kelly)
- **Файл:** `tradingPrinciples.ts`, `positionSizing.ts`

### 3.2 Candlestick паттерны
- Engulfing, Hammer, Doji, Morning/Evening Star, Three White Soldiers/Crows
- Piercing Line, Dark Cloud Cover, Harami, Marubozu, Tweezer Tops/Bottoms
- Dragonfly/Gravestone Doji, Spinning Top

### 3.3 Риск и психология
- Emotional Filter: cooldown после убытков, daily drawdown limit
- Failed signal: RSI в экстремуме + цена против — снижение confidence
- Volatility: уменьшение размера при высокой ATR

### 3.4 Аналитика
- Sharpe Ratio, **Sortino Ratio** (только downside volatility)
- Max Drawdown, Profit Factor, Win Rate, Avg Hold Time
- Equity curve, byDay, byPair

---

## 4. Рекомендации по дальнейшей интеграции

1. **Трейлинг-стоп** — частично в tradingPrinciples; добавить в autoTrader/OKX.
2. **Частичное закрытие TP** — TP1 50%, TP2 30%, TP3 20%.
3. **Kelly в UI** — переключатель «размер: % / по риску / Kelly (½)».
4. **Глубокое обучение** — расширение onlineMLService до нейросети (PyTorch/TF.js) при наличии данных.
5. **Бэктест в USDT** — для сопоставления с live.

---

## 5. Связь с авто-торговлей

```
Курс 5.1 (риск) → emotionalFilter, positionSizing, Kelly
Курс 4.x (ТА)  → candleAnalyzer, marketAnalysis, detectPatterns
Курс 2.x, 4.2  → onlineMLService, externalAiService, aiWinProbability
Курс 5.2       → signalGenerator, runAutoTradingBestCycle, confluence
```
