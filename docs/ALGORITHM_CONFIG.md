# Конфигурация алгоритмов (по документации /docs)

**Дата:** 2026-02

Единый источник настроек, выведенных из docs. Все значения должны соответствовать принципам (Schwager, Burniske, Nison, Sinclair, MaksBaks).

---

## 1. Пороги входа (runAutoTradingBestCycle)

| Параметр | Значение | Документ | Примечание |
|----------|----------|----------|------------|
| AUTO_MIN_CONFIDENCE | 0.65 (65%) | APP: 75% | Снижен для стабильного потока сделок |
| AUTO_MIN_RISK_REWARD | 1.1 | APP: 1.2, EXTERNAL_AI: 1.25 | Минимум для R:R |
| Technical override | conf≥80% и rr≥2 | KYRS | Обход AI-гейта при сильном тех. сигнале |
| minVolOk (ATR) | ≥0.1% | DATA_AND_ML | Фильтр низкой волатильности |

---

## 2. Размер позиции (autoTrader)

| Параметр | Значение | Документ | Файл |
|----------|----------|----------|------|
| reserveRatio (balance≥50) | 0.85 | POSITIONS | autoTrader.ts |
| reserveRatio (balance<50) | 0.7 | POSITIONS | autoTrader.ts |
| maxPctOnePosition (balance<20) | 15% | POSITIONS | autoTrader.ts |
| MAX_SINGLE_ASSET_PCT | 25% | Burniske | tradingPrinciples |
| RISK_PCT_PER_TRADE | 2% | Schwager | tradingPrinciples |
| RISK_MAX_PCT | 3% | Schwager | tradingPrinciples |
| sizeMode | percent \| risk | APP, POSITIONS | UI + API |
| volatilitySizeMultiplier | 0.7 при ATR>1.5×avg | Sinclair | tradingPrinciples |

---

## 3. Цепочка фильтров перед ордером (порядок)

1. canExecute (AUTO_TRADING_EXECUTION_ENABLED, OKX keys)
2. R:R ≥ AUTO_MIN_RISK_REWARD (1.1)
3. AI-гейт: effectiveAiProb ≥ minAiProb ИЛИ technical override (conf≥80%, rr≥2)
4. Внешний ИИ (OpenAI/Claude): score ≥ minScore (при blockOnLowScore)
5. Funding Rate: не LONG при shouldAvoidLong, не SHORT при shouldAvoidShort
6. emotionalFilter.canOpenTrade()
7. executeSignal → OKX

---

## 4. ML (onlineMLService)

| Параметр | Значение | Документ |
|----------|----------|----------|
| MIN_SAMPLES_FOR_AI_GATE | 15 | DATA_AND_ML (ML_MIN_SAMPLES_GATE) |
| FEATURE_DIM | 9 | DATA_AND_ML |
| effectiveProbability | blend при samples<50 | Консервативная оценка |
| persistModel | data/ml_model.json | DATA_AND_ML |

---

## 5. Применяемые принципы

| Источник | Что применяется |
|----------|-----------------|
| Schwager | 2% риск, failed signal (RSI vs цена), trailing stop (константа) |
| Burniske | R:R асимметрия, 25% макс на актив |
| Nison | Ложные пробои (объём), паттерны свечей |
| Sinclair | volatilitySizeMultiplier при ATR>1.5×avg |
| MaksBaks | Funding Rate, Emotional Filter, CoinScanner |
| Kelly | kellyFraction() — опционально для размера |

---

## 6. Что ещё внедрить (по docs)

- [ ] Trailing Stop в autoTrader/OKX
- [ ] Частичное TP (50/30/20)
- [ ] Конфиг emotionalFilter в админке
- [ ] Бэктест в USDT
- [ ] Kelly в UI (переключатель размера)
