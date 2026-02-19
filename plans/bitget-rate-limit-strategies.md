# Снижение нагрузки на Bitget API (стакан, свечи, объём)

Bitget ограничивает число запросов в секунду по REST (порядка 10 req/s на endpoint). Ниже — что реализовано.

## Реализовано

1. **Rate limiter для REST** — `lib/bitgetRateLimiter.ts`: не более N запросов в секунду (по умолчанию 6, env `BITGET_RATE_LIMIT_PER_SECOND`). Все `fetchOHLCV`, `fetchOrderBook`, `fetchTicker`, `fetchTrades` проходят через очередь.

2. **Стакан (order book)** — WebSocket `bitgetOrderBookStream.ts` (books15) + кэш в БД. DataAggregator: сначала поток (свежее 2 с), затем БД, затем REST.

3. **Свечи (OHLCV)** — WebSocket `bitgetMarketStream.ts`: каналы candle1m/5m/15m/1H/4H/1D, кэш последних свечей. DataAggregator: сначала WS-кэш (по TTL ТФ), затем кэш в памяти, БД, REST. Подписка на первые 6 символов цикла (`subscribeMarketSymbols`).

4. **Тикер (last, volume24h)** — тот же `bitgetMarketStream.ts`, канал ticker. DataAggregator: `getCurrentPrice` и `getTickers` сначала берут из WS-кэша (TTL 5 с).

5. **Coalescing** — в DataAggregator: in-flight Map по ключу (symbol:timeframe:limit для OHLCV, symbol:limit для order book). Один реальный запрос на ключ, остальные ждут тот же результат.

6. **TTL кэша** — увеличены дефолты для свечей (5m: 90 с, 15m: 120 с, 1h: 180 с). Настройка через `MARKET_CACHE_TTL_*_MS`.

7. **Плотность (density)** — по стакану, сохраняется в БД при сохранении стакана (TTL 2 с).
