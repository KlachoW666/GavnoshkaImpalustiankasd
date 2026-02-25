#!/bin/bash
# Диагностика на VPS: почему не открывается clabx.ru (404 / connection refused).
# Запуск из корня проекта: bash scripts/diagnose-vps.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
fail(){ echo -e "${RED}[FAIL]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $*"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== 1. Бэкенд (Node :3000) ==="
if command -v pm2 &>/dev/null; then
  pm2 describe cryptosignal 2>/dev/null | grep -E "status|pid|uptime" || true
  STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)
  echo "  PM2 cryptosignal: $STATUS"
fi
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "304" ]; then
  ok "GET http://127.0.0.1:3000/ → $CODE (Node отвечает)"
else
  fail "GET http://127.0.0.1:3000/ → $CODE (ожидался 200). Запустите: pm2 start ecosystem.config.js"
fi
CODE_API=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/api/health 2>/dev/null || echo "000")
echo "  GET /api/health → $CODE_API"

echo ""
echo "=== 2. Frontend (сборка) ==="
if [ -f "frontend/dist/index.html" ]; then
  ok "frontend/dist/index.html есть"
else
  fail "frontend/dist/index.html нет. Выполните: cd frontend && npm run build"
fi

echo ""
echo "=== 3. DNS (куда смотрит clabx.ru) ==="
if command -v nslookup &>/dev/null; then
  IP=$(nslookup clabx.ru 2>/dev/null | grep -A1 "Name:" | grep "Address:" | tail -1 | awk '{print $2}')
  echo "  clabx.ru → $IP"
  if [ -n "$IP" ] && [ "$IP" != "91.219.151.7" ]; then
    warn "Домен указывает на $IP, а не на 91.219.151.7. Настройте A-запись у регистратора."
  elif [ "$IP" = "91.219.151.7" ]; then
    ok "DNS: clabx.ru → 91.219.151.7"
  fi
else
  echo "  (nslookup не найден, проверьте DNS вручную: clabx.ru должен быть 91.219.151.7)"
fi

echo ""
echo "=== 4. Nginx (порт 80) ==="
if ! command -v nginx &>/dev/null; then
  warn "nginx не установлен"
else
  echo "  sites-enabled:"
  ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
  [ -d /etc/nginx/conf.d ] && echo "  conf.d:" && ls /etc/nginx/conf.d/ 2>/dev/null || true
  echo "  server_name / proxy_pass:"
  grep -rh "server_name\|proxy_pass\|root " /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true
  CODE80=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:80/ 2>/dev/null || echo "000")
  CODE_DOMAIN=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 -H "Host: clabx.ru" http://127.0.0.1:80/ 2>/dev/null || echo "000")
  echo "  GET http://127.0.0.1:80/ (по IP) → $CODE80"
  echo "  GET http://127.0.0.1:80/ (Host: clabx.ru) → $CODE_DOMAIN"
  if [ "$CODE_DOMAIN" != "200" ] && [ "$CODE_DOMAIN" != "304" ]; then
    warn "Запрос с Host: clabx.ru не даёт 200. Проверьте, что в sites-enabled только cryptosignal.conf и перезагрузите nginx."
  fi
fi

echo ""
echo "=== 5. Что сделать (по порядку) ==="
echo "  # Только один конфиг для 80 — наш proxy на Node:"
echo "  cp $PROJECT_ROOT/nginx/cryptosignal.conf /etc/nginx/sites-available/cryptosignal.conf"
echo "  rm -f /etc/nginx/sites-enabled/*"
echo "  ln -sf /etc/nginx/sites-available/cryptosignal.conf /etc/nginx/sites-enabled/"
echo "  nginx -t && nginx -s reload"
echo ""
echo "  # Убедиться что Node запущен и отдаёт страницу:"
echo "  pm2 restart cryptosignal"
echo "  sleep 3"
echo "  curl -s http://127.0.0.1:3000/ | head -3"
echo ""
