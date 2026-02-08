# CryptoSignal Pro

Система анализа криптовалютных рынков и генерации торговых сигналов.  
Создано по техническому заданию из `teh_zadanie.js`.

## Стек технологий

- **Desktop**: Electron
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Lightweight Charts
- **Интеграции**: BingX (через CCXT), mock-данные для TradingView/Scalpboard

## Структура

```
BotNot/
├── electron/         # Electron main process
├── backend/          # API Gateway, Data Aggregator, Candle Analyzer, Signal Generator
├── frontend/         # Dashboard, Signal Feed, Chart View
├── teh_zadanie.js    # Исходное ТЗ (генератор docx)
└── README.md
```

## Запуск как десктопное приложение (рекомендуется)

### 1. Установка зависимостей

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. Сборка и запуск

```bash
npm run electron:dev
```

или по шагам:

```bash
npm run build          # собрать backend + frontend
npm run electron       # запустить окно приложения
```

### 3. Создание установщика / portable (.exe)

```bash
npm run dist:win
```

В папке `release/` появятся:
- `CryptoSignal Pro Setup x.x.x.exe` — установщик
- `CryptoSignalPro-Portable.exe` — portable-версия (без установки)

---

## Запуск в браузере (dev-режим)

```bash
npm run dev            # backend + frontend
# или по отдельности:
npm run dev:backend    # http://localhost:3000
npm run dev:frontend   # http://localhost:5173
```

## API

- `GET /api/health` — проверка состояния
- `GET /api/signals` — список торговых сигналов
- `GET /api/signals/:id` — сигнал по ID
- `GET /api/market/candles/:symbol` — свечи (query: timeframe, limit)
- `POST /api/market/analyze/:symbol` — запуск анализа и генерация сигнала

WebSocket: `ws://localhost:5173/ws` (в dev проксируется на 3000)

## Экраны

- **Dashboard** — обзор, активные сигналы, кнопка анализа
- **Сигналы** — лента сигналов с фильтрами LONG/SHORT
- **График** — свечной график (Lightweight Charts)

## Формат сигнала

```json
{
  "id": "sig_20260204_001",
  "symbol": "BTC/USDT",
  "direction": "LONG",
  "entry_price": 97500,
  "stop_loss": 96800,
  "take_profit": [98200, 98800, 99500],
  "confidence": 0.85,
  "triggers": ["bullish_engulfing", "rsi_oversold_reversal"]
}
```

---
⚠️ Система предоставляет информационные сигналы и не является финансовой рекомендацией.
