# Запуск BotNot на одной машине (бэкенд + n8n)

Всё на одном сервере: бэкенд (порт 3000), n8n (порт 5678), workflow `site-analysis-open-wait.json` синхронизирован с `scenarN8N/site-analysis-open-wait.json` и с копией в `n8n-master/workflows-botnot/`.

---

## Вариант A: Без Docker (два процесса на одной машине)

### 1. Бэкенд

```bash
cd backend
npm install
# Заполните .env (BINANCE_*, ANTHROPIC_*, PORT=3000 и т.д.)
npm run dev
```

Бэкенд: **http://localhost:3000**

### 2. n8n

**Вариант 2a — из исходников (n8n-master):**

```bash
cd n8n-master
pnpm install
# Опционально: скопируйте .env.botnot.example в .env и задайте N8N_HOST=0.0.0.0, N8N_PORT=5678
pnpm start
```

**Вариант 2b — через npx (без клона n8n-master):**

```bash
npx n8n
```

n8n: **http://localhost:5678**

### 3. Импорт workflow в n8n

1. Откройте http://localhost:5678.
2. Создайте учётную запись (при первом запуске).
3. Меню **Workflows** → **Import from File** (или **⋯** → **Import**).
4. Выберите файл:
   - **scenarN8N/site-analysis-open-wait.json**  
   или  
   - **n8n-master/workflows-botnot/site-analysis-open-wait.json**
5. Сохраните workflow и включите его (переключатель **Active**).

В workflow в узле **Config** уже задано `backendUrl: http://localhost:3000` — при таком запуске менять ничего не нужно.

### 4. Проверка

- Webhook для сайта: **POST** `http://localhost:5678/webhook/analysis`  
  Тело: `{"symbol": "ETH", "riskPct": 0.02, "minConfidence": 0.65}`  
- Ответ: JSON с полями `recommendation`, `direction`, `suggestionForUser`, `summary`, `analyses` и т.д.

---

## Вариант B: Docker Compose (одна машина)

### 1. Подготовка

- В `backend/.env` должны быть заданы все ключи (Binance, Anthropic и т.д.).
- В workflow при использовании Docker узел **Config** должен использовать адрес бэкенда по имени сервиса: **http://backend:3000** (вместо `http://localhost:3000`). Либо импортируйте workflow и вручную измените в узле Config поле `backendUrl` на `http://backend:3000`.

### 2. Запуск

Если в `backend` есть Dockerfile:

```bash
docker compose -f docker-compose.botnot.yml up -d
```

Если Dockerfile нет — в `docker-compose.botnot.yml` раскомментируйте блок с `image: node:22-alpine`, `volumes` и `command` для сервиса `backend` и снова выполните `up -d`.

### 3. Импорт workflow в n8n (Docker)

1. Откройте http://localhost:5678.
2. Импортируйте **scenarN8N/site-analysis-open-wait.json** (или **n8n-master/workflows-botnot/site-analysis-open-wait.json**).
3. В узле **Config** измените **backendUrl** на **http://backend:3000**.
4. Сохраните и активируйте workflow.

### 4. Адреса

- Бэкенд: http://localhost:3000  
- n8n: http://localhost:5678  
- Webhook: http://localhost:5678/webhook/analysis  

---

## Синхронизация workflow

Один и тот же workflow лежит в двух местах:

- **scenarN8N/site-analysis-open-wait.json** — основной файл сценария.
- **n8n-master/workflows-botnot/site-analysis-open-wait.json** — копия для деплоя рядом с n8n.

При изменении логики обновите оба файла (или копируйте из `scenarN8N` в `n8n-master/workflows-botnot`), чтобы на сервере и в описании всё совпадало.

---

## Краткий чеклист «с первого раза»

1. Бэкенд запущен на порту 3000, в `.env` заданы BINANCE_*, ANTHROPIC_* и т.д.
2. n8n запущен на порту 5678.
3. В n8n импортирован **site-analysis-open-wait.json** из `scenarN8N` или `n8n-master/workflows-botnot`.
4. В узле Config workflow: при запуске без Docker — `http://localhost:3000`, при Docker — `http://backend:3000`.
5. Workflow включён (Active).
6. Сайт шлёт POST на `http://<ваш-сервер>:5678/webhook/analysis` с телом `{ "symbol": "ETH", ... }`.

После этого запросы к webhook должны проходить, а бэкенд — отвечать на вызовы анализа и скринера.
