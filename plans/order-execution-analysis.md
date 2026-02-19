# Анализ ордеров и качества исполнения

## 1. Жизненный цикл ордера (текстовая схема)

```
[Авто-цикл] runAutoTradingBestCycle (market.ts)
    │
    ├─ userCycleLocks: один цикл на пользователя/глобально (таймаут 8 мин)
    ├─ analysisSemaphore(5): лимит параллельных анализов символов
    ├─ runAnalysis(symbol) по символам → лучший сигнал по score
    ├─ Фильтры: minConf, minRR, AI gate, funding rate
    │
    └─ canExecute ──► executeSignal(best.signal, opts, userCreds?)  [autoTrader.ts]
                          │
                          ├─ emotionalFilter.canOpenTrade()
                          ├─ fetchPositions + fetchBalance (openCount, balance)
                          ├─ maxPositions, баланс, MIN_BALANCE_REAL, MIN_NOTIONAL_USD
                          ├─ Open Interest (опционально)
                          ├─ Валидация SL/TP, tpMultiplier, MIN_TP_DISTANCE_PCT
                          ├─ Размер позиции: reserve ratio, sizePercent/risk, volMult
                          ├─ tryPlaceOrder(tdMode, oneWayMode?)
                          │     ├─ setLeverage(leverage, ccxtSymbol, { marginMode })
                          │     ├─ params: tdMode, posSide/tradeSide или buy_single/sell_single, stopLoss, takeProfit
                          │     └─ exchange.createOrder(ccxtSymbol, 'market', orderSide, amount, undefined, params)
                          ├─ Retry: 40774 → one-way; 51000 posSide → posSide=net; 51010 → isolated; 50102 → sleep 2s
                          │
                          └─ return { ok, orderId, positionSize }
                                    │
    [При result.ok]
    ├─ insertOrder(bitget-{orderId}-{Date.now()}, clientId, pair, ...)  [DB]
    └─ copyOrderToSubscribers(userId, signal, opts)  → executeSignal по подписчикам (без insertOrder для подписчиков)

[Ручной цикл] runManualCycle → executeSignal → ордер не пишется в БД (только на бирже; подтягивается pullClosedOrdersFromBitget)

[Sync] bitgetSyncCron (каждые 6 мин)
    ├─ syncClosedOrdersFromBitget: по открытым в БД ордерам bitget-* — fetchOrder на Bitget → при closed/filled → updateOrderClose + feedOrderToML
    └─ pullClosedOrdersFromBitget: выгрузка закрытых ордеров с биржи, upsert в БД для истории/ML
```

---

## 2. Основные файлы

| Область | Файл | Роль |
|--------|------|------|
| Исполнение | `backend/src/services/autoTrader.ts` | executeSignal, размер позиции, параметры Bitget, retry, syncClosedOrdersFromBitget |
| Цикл и insert | `backend/src/routes/market.ts` | runAutoTradingBestCycle, lock/semaphore, вызов executeSignal, insertOrder после успеха |
| Копи-трейд | `backend/src/services/copyTradingService.ts` | copyOrderToSubscribers → executeSignal по подписчикам (без insert в БД) |
| БД | `backend/src/db/index.ts` | insertOrder, updateOrderClose, listOrders, orderExistsWithBitgetOrdId |
| Схема | `backend/src/db/schema.sql` | Таблица orders (id, client_id, pair, direction, size, leverage, open_price, close_price, status, …) |
| Sync | `backend/src/services/bitgetSyncCron.ts` | Каждые 6 мин: syncClosedOrdersFromBitget + pullClosedOrdersFromBitget |

---

## 3. Корректность работы ордеров

### Реализовано корректно
- **Bitget side/posSide/tradeSide:** hedge (posSide long/short + tradeSide open), one-way (buy_single/sell_single), retry при 40774/51000/51010.
- **Размер позиции:** резерв баланса, min notional, округление по точности Bitget, учёт плеча.
- **SL/TP:** привязка к ордеру при создании (triggerPrice, type: market); валидация относительно entry, MIN_TP_DISTANCE_PCT, tpMultiplier.
- **Только маркет-ордера:** createOrder(..., 'market', ...) — предсказуемое исполнение по рынку.
- **Один цикл на пользователя:** userCycleLocks + таймаут 8 мин; семафор анализа с освобождением при таймауте (защита от deadlock).

### Риски и рекомендации
1. **Двойной вход по одному символу:** раньше проверялся только openCount >= maxPositions; при двух циклах подряд с одним и тем же лучшим символом возможны две позиции по одной паре.  
   **Рекомендация:** не открывать новую позицию, если уже есть открытая по этому символу (проверка в executeSignal).
2. **Ручные ордера не пишутся в БД:** runManualCycle не вызывает insertOrder; ордера есть только на Bitget, в БД попадают при pullClosedOrdersFromBitget.  
   **Рекомендация:** при желании единого учёта — вызывать insertOrder после успешного executeSignal и в ручном пути (с тем же форматом id).
3. **Ордера подписчиков (копи-трейд):** не сохраняются в БД; история — только через pull по clientId подписчика.  
   **Рекомендация:** либо явно документировать, либо при необходимости добавить insertOrder для подписчиков с их clientId.

---

## 4. Качество исполнения

- **Тип ордера:** только market — нет контроля проскальзывания; исполнение по текущей рыночной цене.
- **Размер:** ограничен балансом, min notional Bitget, точностью контракта; при необходимости можно добавить лимиты по макс. размеру на символ.
- **SL/TP:** выставляются при создании ордера (preset); отдельного шага «после исполнения» нет.

**Рекомендации по качеству:**
- При необходимости: опция лимит-ордера с offset от entry или проверка средней цены исполнения после fill и логирование при большом проскальзывании.
- Сохранять текущую логику «один ордер на символ за цикл» и проверку «уже есть позиция по символу» для снижения дублирования и переторговки.

---

## 5. Итог

- Реализация ордеров и синхронизации с Bitget в целом корректна: параметры режимов, retry, размер позиции, SL/TP, sync и cron учтены.
- Главное улучшение для корректности — **запрет второй позиции по тому же символу** в executeSignal.
- Дополнительно при необходимости: единообразная запись ордеров в БД (ручной путь, подписчики) и при желании — контроль проскальзывания/лимиты.
