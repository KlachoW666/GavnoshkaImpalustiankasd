# Фильтры анализа: SHORT в перепроданности и после резкого падения

Правила снижают число входов в SHORT, когда высока вероятность отскока (краткосрочные торги в плюс).

## 1. SHORT в зоне перепроданности (риск отскока)

**Файл:** `backend/src/lib/tradingPrinciples.ts` — `detectFailedSignalHint`.

- **Условие:** направление сигнала SHORT, RSI ≤ 35 (`RSI_OVERSOLD_SHORT_RISK`), направление цены за последние 5 свечей 5m — вниз.
- **Действие:** снижение confidence на `SHORT_OVERSOLD_CONFIDENCE_REDUCTION` (0.10).
- **Логика:** шорт после уже произошедшего падения часто попадает в отскок; RSI в перепроданности увеличивает риск разворота вверх.
- **Лог:** `[SignalGenerator] confidence reduced: short into oversold` (symbol, rsi, priceDirection).

## 2. SHORT после резкого недавнего падения (5m и 15m)

**Файл:** `backend/src/routes/market.ts` — `runAnalysis`, до вызова `signalGenerator.generateSignal`.

**5m:**
- **Условие:** направление сигнала SHORT; за последние `SHARP_DROP_CANDLES` (8) свечей 5m цена упала не менее чем на `SHARP_DROP_PCT` (1.5%).
- **Действие:** снижение confidence на `SHARP_DROP_CONFIDENCE_PENALTY` (0.10).
- **Лог:** `[runAnalysis] confidence reduced: sharp drop before short (5m)` (symbol, dropPct, candles).

**15m (дополнительно для максимального эффекта):**
- **Условие:** направление SHORT; за последние `SHARP_DROP_15M_CANDLES` (4) свечи 15m цена упала не менее чем на `SHARP_DROP_15M_PCT` (2%).
- **Действие:** дополнительное снижение confidence на `SHARP_DROP_15M_CONFIDENCE_PENALTY` (0.05).
- **Логика:** старший ТФ подтверждает падение — не шортить вдогонку; оба ТФ уменьшают ложные SHORT после отскока.
- **Лог:** `[runAnalysis] confidence reduced: sharp drop before short (15m)` (symbol, dropPct, candles).

Константы в начале `market.ts`: `SHARP_DROP_*` (5m) и `SHARP_DROP_15M_*` (15m).

## 3. SHORT при восходящем движении (не шортить против ралли)

**Файл:** `backend/src/routes/market.ts` — `runAnalysis`, после фильтра резкого падения.

- **Условие:** направление сигнала SHORT и `priceDirection === 'up'` (последние 5 свечей 5m: close ≥ close 5 свечей назад).
- **Действие:** снижение confidence на `SHORT_AGAINST_UP_MOVE_PENALTY` (0.10).
- **Логика:** не открывать SHORT, когда последние свечи идут вверх — не шортить против текущего ралли.
- **Лог:** `[runAnalysis] confidence reduced: short against up move (5m)` (symbol).

Константа: `SHORT_AGAINST_UP_MOVE_PENALTY` в начале `market.ts`.

## 4. Блокировка входа против HTF

**Файл:** `backend/src/routes/market.ts`.

- В анализе: при `againstHTF` (сигнал против старшего тренда 1d/4h) в breakdown выставляется `blockEntryWhenAgainstHTF = againstHTF && confidence < AGAINST_HTF_MIN_CONFIDENCE` (0.72).
- В авто-цикле: если у лучшего сигнала `best.breakdown.blockEntryWhenAgainstHTF`, ордер не открывается, в лог пишется причина.

## 5. Условие обхода AI gate (strong technical)

**Файл:** `backend/src/routes/market.ts` — после оценки внешнего ИИ.

- При обходе AI gate (conf ≥ 80%, rr ≥ 2) для открытия ордера дополнительно требуется: **effectiveAiProb ≥ 25%** (`TECH_OVERRIDE_MIN_AI_PROB`) **или** оценка внешнего ИИ ≥ 55% (`TECH_OVERRIDE_MIN_EXTERNAL_AI`).
- Если оба показателя ниже порогов — ордер не открывается, в лог выводится причина.

Константы: `TECH_OVERRIDE_MIN_AI_PROB`, `TECH_OVERRIDE_MIN_EXTERNAL_AI`, `AGAINST_HTF_MIN_CONFIDENCE` в начале `market.ts`.
