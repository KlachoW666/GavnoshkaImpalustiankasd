# CLABX — Crypto Trading Platform

**CLABX** — платформа для автоматической торговли криптовалютой с аналитикой, сигналами в реальном времени и интеграцией с OKX. Интерфейс торговли выполнен в стиле [Bitget](https://www.bitget.com): единая страница «Торговля» (рынки, график, стакан, сделки, ордера, позиции), Spot и Фьючерсы.

---

## Основные возможности

- **Авто-торговля** — открытие/закрытие позиций по сигналам (реальный счёт или демо-режим OKX)
- **Сигналы** — лента сигналов с AI-оценкой вероятности выигрыша
- **Скринер** — топ монет по волатильности, объёму, BB squeeze
- **Графики** — свечи, стакан заявок, индикаторы
- **Бэктест** — проверка стратегии на исторических данных
- **Копитрейдинг** — подписка на провайдеров, копирование сделок
- **Социальная торговля** — лидерборд, рейтинг трейдеров
- **Админ-панель** — пользователи, подписки, ключи активации, логи

---

## Технологии

- **Backend:** Node.js, Express, TypeScript, SQLite (better-sqlite3), OKX API (CCXT), WebSocket
- **Frontend:** React 18, TypeScript, Vite, Lightweight Charts
- **Auth:** bcrypt, сессии в БД

---

## Установка

### Требования

- Node.js 18+
- npm или yarn

### Шаги

```bash
git clone <repo-url> clabx
cd clabx

# Корень (при необходимости)
npm install

# Backend
cd backend
cp .env.example .env   # настройте .env
npm install
npm run build

# Frontend
cd ../frontend
npm install
npm run build

# Запуск (из корня)
cd ..
node backend/dist/index.js
# или: npm start (если настроен в package.json)
```

### Переменные окружения (backend/.env)

```env
PORT=3000
NODE_ENV=production
DATABASE_PATH=./data/cryptosignal.db

# OKX (опционально, для глобального доступа)
OKX_API_KEY=
OKX_SECRET=
OKX_PASSPHRASE=
OKX_SANDBOX=false

# Один общий пароль админа (если не используете логины из БД)
ADMIN_PASSWORD=your_secure_password

# Включение исполнения ордеров авто-торговли
AUTO_TRADING_EXECUTION_ENABLED=true
```

Пользователи с группой **admin** (group_id=3) могут входить в админ-панель по своему **логину и паролю** из БД. Если логин не указан — проверяется только `ADMIN_PASSWORD`.

---

## Обновление

```bash
git pull origin main
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
# Перезапуск сервиса (PM2/systemd)
```

Скрипт `update.sh` (если есть): из корня проекта `bash update.sh`.

---

## Роутинг и обновление страницы

- Все разделы привязаны к URL: `/`, `/signals`, `/chart`, `/auto`, `/backtest`, `/copy`, `/social`, `/profile`, `/settings`, `/admin` и т.д.
- При обновлении страницы (F5) открывается тот же раздел, что и в URL.
- Доступ к разделам зависит от группы пользователя (вкладки из `groups.allowed_tabs`). При отсутствии прав текущая страница заменяется на первую разрешённую и URL синхронизируется.

---

## Админ-панель

### Вход

- **Сохранение данных входа:** на странице входа можно включить «Сохранить данные входа». Логин и пароль сохраняются в localStorage и подставляются при следующем открытии; при включённой опции токен админа также сохраняется и не сбрасывается при обновлении страницы.
- **Выход:** кнопка «Выйти» очищает токен и перезагружает страницу.

### Управление пользователями

В разделе **Пользователи** при открытии карточки пользователя доступно:

- **Добавить подписку** — указать длительность (1h, 7d, 99d и т.п.) и нажать «Добавить».
- **Отменить подписку** — кнопка «Отменить подписку» снимает активную подписку (дата окончания обнуляется).
- **Изменить логин и пароль** — поля «Новый логин» и «Новый пароль» и кнопка «Сохранить». Логин от 2 символов, пароль от 4; пустые поля не меняются.

---

## Структура проекта

```
├── backend/
│   ├── src/
│   │   ├── config/       # Конфиг
│   │   ├── db/           # SQLite, пользователи, ордера, копитрейдинг
│   │   ├── lib/          # Утилиты, логгер
│   │   ├── routes/       # API: auth, market, orders, admin, backtest, copy-trading, social, ml
│   │   ├── services/     # autoTrader, backtester, copyTrading, onlineML, анализ рынка
│   │   └── index.ts
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/     # Auth, Notifications
│   │   ├── pages/        # Dashboard, Signals, Chart, Auto, Backtest, Copy, Social, Admin
│   │   ├── utils/
│   │   └── App.tsx
│   └── vite.config.ts
├── telegram-bot/         # Отдельный бот (опционально)
├── install.sh
├── update.sh
└── README.md
```

---

## Безопасность

- Пароли хранятся в виде bcrypt-хеша.
- Админ: либо логин/пароль пользователя с группой admin, либо общий `ADMIN_PASSWORD`.
- Сохранённые данные входа (логин/пароль и токен) хранятся только в браузере (localStorage); используйте «Сохранить» только на доверенных устройствах.

---

## Поддержка

- Сайт: [clabx.ru](https://clabx.ru)
- Telegram: [@clabx_bot](https://t.me/clabx_bot), [@clabxartur](https://t.me/clabxartur), [@clabxsupport](https://t.me/clabxsupport)

---

Торговля криптовалютой связана с риском потери капитала. Используйте платформу на свой страх и риск.
