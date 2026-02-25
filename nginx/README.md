# Nginx: подключение сайта clabx.ru

**Если браузер показывает «404 Not Found» (nginx/1.22.1):** Nginx запущен, но не отдаёт сайт. Причина — активен не тот конфиг (например, отдача статики из папки, которой нет, или default). Нужно использовать **cryptosignal.conf**: он проксирует все запросы на Node (127.0.0.1:3000), а Node отдаёт и API, и фронтенд из `frontend/dist`. Выполните шаги ниже (раздел 2).

Если браузер пишет «Сайт отклонил соединение» — на сервере не слушается порт 80 или nginx не настроен.

## 1. Проверить, что слушает порты

```bash
# Должен быть процесс на 3000 (Node) и можно nginx на 80
ss -tlnp | grep -E ':80|:3000'
# или
sudo netstat -tlnp | grep -E ':80|:3000'
```

Если 3000 нет — запустить приложение:

```bash
cd /root/opt/cryptosignal   # или ваш путь к проекту
pm2 start ecosystem.config.js
pm2 save
```

## 2. Подключить конфиг nginx

```bash
# Скопировать конфиг из репозитория
sudo cp /root/opt/cryptosignal/nginx/cryptosignal.conf /etc/nginx/sites-available/cryptosignal.conf
# Включить сайт
sudo ln -sf /etc/nginx/sites-available/cryptosignal.conf /etc/nginx/sites-enabled/
# Убедиться, что дефолтный default не перехватывает (можно переименовать или убрать server_name)
# Проверить конфиг и перезагрузить
sudo nginx -t && sudo systemctl reload nginx
```

Если nginx не установлен:

```bash
sudo apt update && sudo apt install -y nginx
sudo systemctl enable nginx && sudo systemctl start nginx
```

Потом снова скопировать конфиг и сделать `ln -sf` + `nginx -t && systemctl reload nginx`.

## 3. Фаервол (порт 80 открыт)

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw status
sudo ufw enable   # если ещё не включён
```

## 4. Проверка

- На сервере: `curl -I http://127.0.0.1:3000/` — должен быть ответ 200 от Node.
- Снаружи: `curl -I http://clabx.ru/` — ответ 200 от nginx/Node.

Если 3000 отвечает, а снаружи нет — смотреть nginx и ufw.

## 5. 404 Not Found — что сделать

**Самый надёжный вариант — оставить только наш конфиг:**

```bash
cd /root/opt/cryptosignal   # или ваш путь к проекту
cp nginx/cryptosignal.conf /etc/nginx/sites-available/cryptosignal.conf
rm -f /etc/nginx/sites-enabled/*
ln -sf /etc/nginx/sites-available/cryptosignal.conf /etc/nginx/sites-enabled/cryptosignal.conf
nginx -t && nginx -s reload
```

Проверить Node: `curl -s http://127.0.0.1:3000/ | head -5` — должен быть HTML. Если пусто или ошибка: `pm2 restart cryptosignal` и `ls frontend/dist/index.html` (должен быть после `npm run build` в frontend).

**Диагностика на VPS:** `bash scripts/diagnose-vps.sh` — скрипт покажет, что не так (бэкенд, frontend/dist, nginx), и выведет команды для исправления.
