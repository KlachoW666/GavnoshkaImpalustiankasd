# Запуск BotNot (сайт + бот на VPS, n8n — отдельно)

На **основном VPS** (clabx.ru, 91.219.151.7): бэкенд (порт 3000) и Telegram-бот. Сайт и бот запускаются через PM2 и `update.sh`. **n8n** вынесен из этого проекта и будет ставиться на **другом VPS** для синхронизации (workflow в `scenarN8N/` и `n8n-master/workflows-botnot/` можно использовать там).

**Сервер (VPS):** IP **91.219.151.7**, домен **clabx.ru**. Сайт: https://clabx.ru

На VPS после `bash update.sh` (при запуске от root) скрипт автоматически применяет **nginx/nginx-pm2.conf** для clabx.ru и перезагружает Nginx.

---

## n8n на отдельном VPS (позже)

Workflow и сценарии лежат в **scenarN8N/** и **n8n-master/workflows-botnot/** — их можно скопировать на другой VPS, установить там n8n и настроить `backendUrl` на `https://clabx.ru` (или IP основного VPS) для синхронизации с бэкендом.

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

---

## Вариант C: PM2 + Nginx на одной машине (clabx.ru)

Если сайт отдаётся через **Nginx** (например, на домене clabx.ru), а бэкенд и бот запущены через **PM2** (без Docker), Nginx должен проксировать на **127.0.0.1:3000**, а не на `backend:3000` (имя сервиса Docker).

### 1. Конфиг Nginx для PM2

В репозитории есть **nginx/nginx-pm2.conf** — конфиг для деплоя через PM2:

- **upstream** — `127.0.0.1:3000` (backend под PM2)
- **root** — путь к собранному фронтенду, например `/root/opt/cryptosignal/frontend/dist`

### 2. Установка на сервере

```bash
# Путь к проекту (как у вас на VPS)
PROJECT=/root/opt/cryptosignal

# Подставить путь в конфиг и положить в Nginx
sed "s|/root/opt/cryptosignal|$PROJECT|g" nginx/nginx-pm2.conf | sudo tee /etc/nginx/sites-available/clabx
sudo ln -sf /etc/nginx/sites-available/clabx /etc/nginx/sites-enabled/
# Уберите default, если мешает: sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Замените в конфиге **server_name** на ваш домен (clabx.ru и т.д.).

### 3. «Сайт намеренно отклонил соединение» (connection refused)

Если браузер пишет **«Не удаётся установить соединение»** или **«Сайт clabx.ru намеренно отклонил соединение»**, запрос не доходит до Nginx — порт 80 (или 443) закрыт или не слушается. На VPS выполните:

**Шаг 1 — Nginx запущен и слушает порт 80**

```bash
systemctl status nginx
# или
ps aux | grep nginx
ss -tlnp | grep :80
```

- Если Nginx не запущен: `systemctl start nginx` или `nginx`.
- Должна быть строка `0.0.0.0:80` (или `*:80`) — значит Nginx слушает все интерфейсы. Если только `127.0.0.1:80` — снаружи подключиться нельзя.

**Шаг 2 — файрвол (порты 80 и 443 открыты)**

- Если установлен **ufw**: `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw reload`.
- Если **ufw: command not found** — на этом VPS файрвол может быть через **iptables** или через **панель хостинга**. Зайдите в панель, где управляете сервером (91.219.151.7), раздел «Сеть» / «Файрвол» / «Firewall», и откройте **входящие** TCP **80** и **443**.

**Шаг 3 — проверить с самого сервера**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/
curl -s -o /dev/null -w "%{http_code}" http://91.219.151.7/
```

- Если с `127.0.0.1` возвращает 200/301/302, а с браузера по clabx.ru — «отклонено», значит блокирует файрвол или сеть хостера.

**Кратко:** должен быть запущен Nginx, порт 80 слушать на `0.0.0.0`, порты 80 и 443 открыты в файрволе (и в панели хостинга, если есть).

---

### 4. 502 Bad Gateway — что проверить на сервере

Если на **clabx.ru** открывается **502 Bad Gateway**, выполните на VPS по шагам:

**Шаг 1 — бэкенд и порт 3000**

```bash
pm2 status
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health
```

- Если `pm2 status` показывает **cryptosignal** в статусе **stopped** или **errored** — перезапустите: `pm2 restart cryptosignal` и смотрите логи: `pm2 logs cryptosignal --lines 30`.
- Если `curl` возвращает не **200** — бэкенд не отвечает на 3000; проверьте `pm2 logs cryptosignal` и наличие `backend/.env`.

**Шаг 2 — какой конфиг использует Nginx**

```bash
ls -la /etc/nginx/sites-enabled/
grep -r "upstream\|proxy_pass" /etc/nginx/sites-enabled/ 2>/dev/null | head -20
```

- Если в конфиге для clabx.ru указано **backend:3000** или **server backend** — это конфиг для Docker; при PM2 Nginx должен проксировать на **127.0.0.1:3000**.

**Шаг 3 — применить конфиг для PM2**

```bash
cd /root/opt/cryptosignal   # или ваш путь к проекту
git pull origin main
PROJECT=$(pwd)
sed "s|/root/opt/cryptosignal|$PROJECT|g" nginx/nginx-pm2.conf | sudo tee /etc/nginx/sites-available/clabx
sudo ln -sf /etc/nginx/sites-available/clabx /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # если default перехватывает clabx.ru
sudo nginx -t && sudo systemctl reload nginx
```

После этого снова откройте clabx.ru. Если 502 остаётся — пришлите вывод команд из шага 1 и 2.

**Кратко:** при работе через PM2 в Nginx должен быть **upstream** на **127.0.0.1:3000** (как в **nginx/nginx-pm2.conf**), а не на `backend:3000`.

**Если cryptosignal постоянно падает (много рестартов в `pm2 status`):** проверьте наличие `backend/.env` с нужными переменными (PORT=3000, BINANCE_*, ANTHROPIC_* и т.д.) и логи: `pm2 logs cryptosignal --lines 80`. Скрипт `update.sh` теперь запускает приложения по очереди (сначала бэкенд, проверка /api/health, затем бот и n8n) и при недоступности бэкенда выводит логи и завершается с ошибкой.
