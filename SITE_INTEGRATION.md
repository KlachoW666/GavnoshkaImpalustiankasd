# Интеграция сайта clabx.ru с n8n — запуск цикла авто-трейда

Страница: **https://clabx.ru/auto**  
Кнопка «Запустить» должна запускать workflow n8n (топ-10 монет, анализ, AI, отправка сигнала на сайт для открытия позиций BitGet).

---

## Схема

```
[Браузер] — кнопка «Запустить»
      ↓
[Сайт backend 91.219.151.7] — POST /api/auto-start (с авторизацией)
      ↓
[n8n 188.127.230.83] — POST /webhook/auto-start
      ↓
[Workflow] — сканирование → анализ → AI → POST обратно на сайт /api/trading-signal
```

**Почему не вызывать n8n с фронта напрямую:**  
С браузера запрос на `http://188.127.230.83` будет кросс-доменным (CORS). Надёжнее и безопаснее: фронт дергает **свой** API, а backend сервера сайта вызывает n8n (server-to-server).

---

## 1. Backend (сервер сайта, например Node/Express)

Добавьте маршрут, который принимает запрос с сайта и проксирует его в n8n.

**Переменные окружения на сервере сайта (.env):**

```env
N8N_WEBHOOK_URL=http://188.127.230.83/webhook/auto-start
```

**Пример (Express):**

```javascript
// POST /api/auto-start — запуск цикла авто-трейда в n8n
router.post('/api/auto-start', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId; // из сессии или тела запроса

    const response = await fetch(process.env.N8N_WEBHOOK_URL || 'http://188.127.230.83/webhook/auto-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId || null,
        source: 'clabx.ru/auto',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'n8n error', details: text });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('auto-start error', err);
    return res.status(500).json({ error: 'Failed to start cycle' });
  }
});
```

**Важно:**  
- Защитите маршрут авторизацией (только залогиненные пользователи).  
- `userId` передаётся в n8n и может использоваться при отправке сигнала на `/api/trading-signal`, чтобы сайт открывал позиции по ключам BitGet этого пользователя.

---

## 2. Frontend — кнопка «Запустить»

Страница авто-трейда (например `/auto`). По нажатию — запрос на **свой** API, не напрямую на n8n.

**Пример (ванильный JS / fetch):**

```html
<button id="start-cycle" type="button">Запустить</button>
<div id="status"></div>
<div id="result"></div>

<script>
document.getElementById('start-cycle').addEventListener('click', async () => {
  const btn = document.getElementById('start-cycle');
  const status = document.getElementById('status');
  const result = document.getElementById('result');

  btn.disabled = true;
  status.textContent = 'Запуск цикла…';

  try {
    const res = await fetch('/api/auto-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // куки сессии
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = 'Ошибка';
      result.textContent = data.error || res.statusText;
      return;
    }

    status.textContent = 'Цикл завершён';
    result.textContent = JSON.stringify(data, null, 2);
    // data: aiDecision, topSignal, allSignals, timestamp — можно отобразить в UI
  } catch (e) {
    status.textContent = 'Ошибка сети';
    result.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});
</script>
```

**Пример (React):**

```jsx
const [loading, setLoading] = useState(false);
const [result, setResult] = useState(null);
const [error, setError] = useState(null);

const handleStart = async () => {
  setLoading(true);
  setError(null);
  setResult(null);
  try {
    const res = await fetch('/api/auto-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка запуска');
    setResult(data);
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
};

// В JSX:
<button onClick={handleStart} disabled={loading}>
  {loading ? 'Запуск…' : 'Запустить'}
</button>
{error && <p className="error">{error}</p>}
{result && (
  <pre>
    Итог: {result.aiDecision}
    Топ: {result.topSignal?.symbol} {result.topSignal?.direction}
  </pre>
)}
```

**Пример (Vue 3):**

```vue
<template>
  <button :disabled="loading" @click="startCycle">
    {{ loading ? 'Запуск…' : 'Запустить' }}
  </button>
  <p v-if="error" class="error">{{ error }}</p>
  <pre v-if="result">{{ result }}</pre>
</template>

<script setup>
import { ref } from 'vue';

const loading = ref(false);
const result = ref(null);
const error = ref(null);

async function startCycle() {
  loading.value = true;
  error.value = null;
  result.value = null;
  try {
    const res = await fetch('/api/auto-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка запуска');
    result.value = data;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
```

---

## 3. Что возвращает n8n (ответ webhook)

После выполнения workflow n8n отвечает JSON примерно такого вида:

```json
{
  "source": "clabx.ru/auto",
  "n8nHost": "http://188.127.230.83",
  "siteHost": "https://clabx.ru",
  "aiDecision": "OPEN_LONG",
  "topSignal": {
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "confidence": 0.72,
    "currentPrice": 43250.5,
    "action": "Открыть LONG"
  },
  "allSignals": [
    { "symbol": "BTCUSDT", "direction": "LONG", "confidence": 0.72 },
    { "symbol": "ETHUSDT", "direction": "LONG", "confidence": 0.65 }
  ],
  "timestamp": "2026-02-25T12:00:00.000Z"
}
```

На фронте можно показывать:
- `aiDecision` — OPEN_LONG / OPEN_SHORT / WAIT;
- `topSignal` — символ, направление, уверенность, цену;
- `allSignals` — список всех сигналов с уверенностью выше порога.

---

## 4. Таймаут и долгий цикл

Workflow (топ-10 монет + анализ + AI) может выполняться 1–3 минуты. Если HTTP-ответ ждётся до конца, возможен таймаут на фронте или прокси.

**Варианты:**

1. **Увеличить таймаут** на backend при вызове n8n (например 120–180 секунд).  
2. **Асинхронный запуск:**  
   - `POST /api/auto-start` только запускает n8n и сразу возвращает `{ status: 'started' }`.  
   - n8n по завершении сам вызывает сайт `POST /api/trading-signal` с результатом — там вы открываете позиции BitGet и при необходимости обновляете UI (WebSocket, polling или уведомление).

В текущем workflow n8n уже настроен на ответ в конце (Respond to Webhook). Если нужен «fire and forget», в n8n можно отключить ответ и полагаться только на callback на сайт.

---

## 5. Проверка без фронта

Проверить, что n8n принимает запрос:

```bash
curl -X POST http://188.127.230.83/webhook/auto-start \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","source":"clabx.ru/auto"}'
```

С сайта (с бэкенда) вызывайте тот же URL (или через переменную `N8N_WEBHOOK_URL`), метод POST, тело `{ "userId": "...", "source": "clabx.ru/auto" }`.

---

## 6. Чеклист и пути в проекте BotNot (clabx.ru)

В этом репозитории уже реализовано следующее.

### Backend (реализовано)

| Что | Где | Примечание |
|-----|-----|------------|
| Запуск n8n по кнопке | `POST /api/market/auto-start` | Требует авторизацию (`requireAuth`), передаёт `userId` в n8n |
| Приём сигнала от n8n | `POST /api/market/trading-signal` | Защита: заголовок `X-API-Key` (переменная `TRADING_SIGNAL_API_KEY` в .env) |
| Конфиг n8n | `backend/src/config/index.ts` | `config.n8n.webhookUrl`, `config.n8n.tradingSignalApiKey` |

**Переменные окружения (.env):**

```env
N8N_WEBHOOK_URL=http://188.127.230.83/webhook/auto-start
TRADING_SIGNAL_API_KEY=a8f3k2m9xQpL1nR7vY4wZ0cB6hJ5tU
```

Без `TRADING_SIGNAL_API_KEY` проверка ключа отключена (для разработки). В проде ключ обязателен.

### Frontend

- Страница авто-трейда: `/auto` (`AutoTradingPage.tsx`).
- Чтобы кнопка «Запустить» вызывала **n8n** (а не только внутренний цикл), добавьте запрос на `POST /api/market/auto-start` с `credentials: 'include'` и отображение ответа (например `aiDecision`, `topSignal`). Сейчас страница использует `/api/market/auto-analyze/start` для встроенного цикла.

### n8n (workflow `crypto-trading-full.json`)

| Что сделано | Описание |
|-------------|----------|
| Нода «Объединить агрегат и новости» | После News API данные агрегата и новостей объединяются в один объект, AI получает и анализы, и новости |
| `userId` в ответе | В «Формат для сайта» в payload добавлено поле `userId` из «Контекст запроса» — сайт открывает позиции по ключам BitGet этого пользователя |
| Ответ webhook один раз | Ответ на webhook идёт только из «Формат для сайта» → «Ответ на запрос»; связи с «Отправить на сайт» и «Telegram» до «Ответ на запрос» убраны |
| URL callback | В ноде «Отправить на сайт» URL: `https://clabx.ru/api/market/trading-signal` |

**Что перенести в credentials n8n (не хранить в JSON):**

- API-ключ Anthropic (нода «AI оценка (Anthropic)»)
- Telegram bot token (нода «Telegram уведомление»)
- `X-API-Key` для сайта (нода «Отправить на сайт») — значение взять из `TRADING_SIGNAL_API_KEY` на сервере

### Деплой на сервер clabx.ru (устранение 404)

Если кнопка «Запустить цикл через n8n» даёт **404** или «n8n error», на сервере запущена старая сборка без маршрутов `auto-start` и `trading-signal`. Нужно обновить и перезапустить backend:

```bash
# На сервере (или через CI/CD)
cd /path/to/BotNot   # или GavnoshkaImpalustiankasd
git pull origin main

cd backend
npm install
npm run build

# Перезапуск (PM2, systemd или как у вас настроено)
pm2 restart backend
# или: systemctl restart clabx-backend
```

После деплоя в .env backend должны быть заданы `N8N_WEBHOOK_URL` и `TRADING_SIGNAL_API_KEY` (см. выше).

### Порядок проверки

1. В n8n импортировать обновлённый `crypto-trading-full.json`, включить workflow.
2. В .env бэкенда задать `N8N_WEBHOOK_URL` и `TRADING_SIGNAL_API_KEY`.
3. У пользователя в настройках должны быть сохранены ключи Bitget (иначе `trading-signal` вернёт «No Bitget credentials»).
4. На сервере задеплоить актуальный backend (см. «Деплой на сервер»), чтобы отвечал `POST /api/market/auto-start`.
5. С фронта вызывать `POST /api/market/auto-start` (с куками/токеном) — цикл запустится в n8n, по завершении n8n вызовет `/api/market/trading-signal` с `userId` и при наличии ключей откроется позиция BitGet.
