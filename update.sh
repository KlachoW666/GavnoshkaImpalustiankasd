#!/bin/bash
# CLABX — скрипт автоматического обновления на VPS
# Домен: clabx.ru, VPS: 91.219.151.7. Сайт + бот. n8n — на отдельном VPS. При запуске от root применяет Nginx-конфиг.
#
# Запуск на VPS (обязательно bash и из корня проекта):
#   bash update.sh                    # Обновление с main и перезапуск PM2
#   bash update.sh main              # Обновление с конкретной ветки
#   bash update.sh --no-restart      # Обновление без перезапуска
#   bash update.sh --force           # Принудительное обновление (git reset --hard)
#
# После клонирования на Windows скрипт может иметь CRLF — на VPS выполните:
#   sed -i 's/\r$//' update.sh install.sh domain.sh
#   bash update.sh

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[CLABX][update]${NC} $*"; }
success() { echo -e "${GREEN}[CLABX][update]${NC} $*"; }
warn() { echo -e "${YELLOW}[CLABX][update][WARN]${NC} $*"; }
err() { echo -e "${RED}[CLABX][update][ERROR]${NC} $*" >&2; }

# npm install с повторами при сетевых ошибках (ETIMEDOUT и т.д.)
npm_install_retry() {
  local max=5
  local n=1
  local delay=30
  # Увеличен таймаут fetch для медленных сетей (VPS, прокси)
  export npm_config_fetch_timeout=120000
  export npm_config_fetch_retries=5
  while true; do
    if npm install "$@"; then
      return 0
    fi
    if [ $n -ge $max ]; then
      return 1
    fi
    warn "npm install не удался (попытка $n/$max), повтор через ${delay} сек..."
    sleep $delay
    n=$((n+1))
  done
}

# Параметры
NO_RESTART=false
FORCE_UPDATE=false
PM2_APP_NAME="cryptosignal"
PM2_BOT_NAME="telegram-bot"
PM2_ECOSYSTEM="ecosystem.config.js"
REPO_URL="https://github.com/KlachoW666/GavnoshkaImpalustiankasd.git"
BRANCH=""

# Обработка флагов и позиционных аргументов
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-restart)
      NO_RESTART=true
      shift
      ;;
    --force)
      FORCE_UPDATE=true
      shift
      ;;
    --help|-h)
      echo "CLABX Update Script"
      echo ""
      echo "Usage:"
      echo "  ./update.sh [branch] [options]"
      echo ""
      echo "Options:"
      echo "  --no-restart    Обновить без перезапуска сервиса"
      echo "  --force         Принудительное обновление (git reset --hard)"
      echo "  --help, -h      Показать эту справку"
      echo ""
      echo "Examples:"
      echo "  ./update.sh                 # Обновить с main и перезапустить"
      echo "  ./update.sh dev             # Обновить с ветки dev"
      echo "  ./update.sh --force         # Принудительное обновление"
      echo "  ./update.sh dev --force     # Обновить с ветки dev принудительно"
      echo "  ./update.sh --no-restart    # Обновить без перезапуска"
      exit 0
      ;;
    *)
      # Если аргумент не начинается с --, это название ветки
      if [[ -z "$BRANCH" ]]; then
        BRANCH="$1"
      fi
      shift
      ;;
  esac
done

# Устанавливаем ветку по умолчанию, если не указана
BRANCH="${BRANCH:-main}"

# Проверка что мы в правильной директории
if [ ! -f "package.json" ]; then
  err "Ошибка: package.json не найден. Запустите скрипт из корня проекта."
  exit 1
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  🚀 CLABX Automatic Update Script"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Сохраняем текущий коммит для отката
CURRENT_COMMIT=$(git rev-parse HEAD)
log "Текущий коммит: ${CURRENT_COMMIT:0:8}"

# Проверяем статус git
if [ -n "$(git status --porcelain)" ]; then
  warn "Обнаружены незакоммиченные изменения:"
  git status --short
  echo ""

  if [ "$FORCE_UPDATE" = true ]; then
    warn "Флаг --force: сбрасываем все изменения..."
    git reset --hard
    git clean -fd
  else
    if [ "${NONINTERACTIVE:-0}" = "1" ]; then
      warn "NONINTERACTIVE=1: продолжаю без запроса"
    else
      read -p "Продолжить обновление? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        warn "Обновление отменено"
        exit 0
      fi
    fi
  fi
fi

# Останавливаем приложение (PM2 или systemd): сайт, бот
if [ "$NO_RESTART" = false ]; then
  if command -v pm2 &>/dev/null; then
    if pm2 describe "$PM2_APP_NAME" &>/dev/null || pm2 describe "$PM2_BOT_NAME" &>/dev/null; then
      log "Останавливаем PM2: ${PM2_APP_NAME}, ${PM2_BOT_NAME}..."
      pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
      pm2 stop "$PM2_BOT_NAME" 2>/dev/null || true
      success "Сайт и бот остановлены"
    fi
  elif command -v systemctl &>/dev/null && systemctl is-active --quiet clabx 2>/dev/null; then
    log "Останавливаем systemd сервис clabx..."
    systemctl stop clabx 2>/dev/null || sudo systemctl stop clabx 2>/dev/null || true
    success "Сервис остановлен"
  else
    warn "Ни PM2 (${PM2_APP_NAME}/${PM2_BOT_NAME}), ни systemd (clabx) не запущены"
  fi
fi

# Создаем backup базы данных (если есть)
BACKUP_DIR=""
if [ -d "data" ]; then
  log "Создаём backup базы данных..."
  BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -r data "$BACKUP_DIR/"
  success "Backup создан: $BACKUP_DIR"
fi

# Git pull
log "Репозиторий: ${REPO_URL}"
log "Получаем обновления (ветка: ${BRANCH})..."

# Убеждаемся что origin настроен правильно
CURRENT_ORIGIN=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CURRENT_ORIGIN" != "$REPO_URL" ]; then
  warn "Обновляю remote origin на ${REPO_URL}..."
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
fi

# Если есть локальные/неотслеживаемые изменения — временно убираем в stash, иначе merge/pull упадёт
STASH_USED=false
if [ -n "$(git status --porcelain)" ]; then
  log "Временно сохраняю локальные изменения в stash (git stash push -u)..."
  if git stash push -u -m "clabx-update-$(date +%Y%m%d_%H%M%S)"; then
    STASH_USED=true
    success "Изменения сохранены в stash"
  else
    err "Не удалось сохранить изменения в stash. Прервите обновление или запустите с --force."
    exit 1
  fi
fi

git fetch origin

if [ "$FORCE_UPDATE" = true ]; then
  git reset --hard origin/$BRANCH
else
  git pull origin $BRANCH
fi

NEW_COMMIT=$(git rev-parse HEAD)
log "Новый коммит: ${NEW_COMMIT:0:8}"

if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
  success "Уже установлена последняя версия"
  log "Пересборка backend и frontend (чтобы подхватить изменения при ручном pull)..."
  (cd backend && npm run build 2>/dev/null) || warn "Backend build пропущен или не удался"
  (cd frontend && npm run build 2>/dev/null) || warn "Frontend build пропущен или не удался"
  if [ "$NO_RESTART" = false ]; then
    if command -v pm2 &>/dev/null && [ -f "$PM2_ECOSYSTEM" ]; then
      pm2 start "$PM2_ECOSYSTEM" --only "$PM2_APP_NAME" 2>/dev/null || pm2 restart "$PM2_APP_NAME" 2>/dev/null || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null && break
        sleep 2
      done
      if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3000/api/health 2>/dev/null; then
        warn "Бэкенд не отвечает — проверьте: pm2 logs ${PM2_APP_NAME} --lines 80"
      else
        sleep 3
        if curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null; then
          success "✅ Сайт (${PM2_APP_NAME}) запущен"
        else
          warn "Бэкенд перестал отвечать через 3 сек — возможно падает: pm2 logs ${PM2_APP_NAME}"
        fi
      fi
      pm2 start "$PM2_ECOSYSTEM" --only "$PM2_BOT_NAME" 2>/dev/null || pm2 restart "$PM2_BOT_NAME" 2>/dev/null || true
      pm2 save 2>/dev/null || true
    elif command -v pm2 &>/dev/null; then
      pm2 start "$PM2_APP_NAME" 2>/dev/null || pm2 restart "$PM2_APP_NAME" 2>/dev/null || true
      success "PM2 приложение запущено"
    elif command -v systemctl &>/dev/null; then
      systemctl start clabx 2>/dev/null || sudo systemctl start clabx 2>/dev/null || true
      success "Сервис запущен"
    fi
    # Nginx для clabx.ru (и при «Already up to date»)
    if [ -f "nginx/nginx-pm2.conf" ] && command -v nginx &>/dev/null && [ "$(id -u)" = "0" ]; then
      PROJECT_ROOT="$(pwd)"
      sed "s|/root/opt/cryptosignal|$PROJECT_ROOT|g" nginx/nginx-pm2.conf > /etc/nginx/sites-available/clabx 2>/dev/null && \
      ln -sf /etc/nginx/sites-available/clabx /etc/nginx/sites-enabled/clabx && \
      rm -f /etc/nginx/sites-enabled/clabx_ru_ /etc/nginx/sites-enabled/default 2>/dev/null
      nginx -t 2>/dev/null && ( nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null ) && success "Nginx перезагружен (clabx.ru)"
    fi
  fi
  exit 0
fi

# Показываем что изменилось
log "Изменения:"
git log --oneline $CURRENT_COMMIT..$NEW_COMMIT

# Функция отката
rollback() {
  err "Обновление не удалось! Откатываемся к $CURRENT_COMMIT..."
  git reset --hard $CURRENT_COMMIT
  if [ "${STASH_USED:-false}" = true ]; then
    log "Восстанавливаю локальные изменения из stash..."
    git stash pop || true
  fi
  if [ -n "${BACKUP_DIR:-}" ] && [ -d "$BACKUP_DIR" ]; then
    log "Восстанавливаем backup базы данных..."
    cp -r "$BACKUP_DIR/data" ./
  fi
  if [ "$NO_RESTART" = false ]; then
    if command -v pm2 &>/dev/null; then
      [ -f "$PM2_ECOSYSTEM" ] && ( pm2 reload "$PM2_ECOSYSTEM" 2>/dev/null || pm2 start "$PM2_ECOSYSTEM" 2>/dev/null ) || pm2 start "$PM2_APP_NAME" 2>/dev/null || true
    else
      systemctl start clabx 2>/dev/null || sudo systemctl start clabx 2>/dev/null || true
    fi
  fi
  err "Откат завершён"
  exit 1
}

# Устанавливаем trap для отката при ошибке
trap rollback ERR

# Исправление CRLF (если скрипты пришли с Windows)
for f in update.sh install.sh domain.sh domainCLABX.sh; do
  if [ -f "$f" ] && grep -q $'\r' "$f" 2>/dev/null; then
    log "Исправляю переводы строк в $f..."
    sed -i 's/\r$//' "$f"
  fi
done

# Устанавливаем зависимости и собираем проект (как в install.sh)
export NODE_ENV=development
# Сетевые настройки npm для VPS с нестабильным интернетом
export npm_config_fetch_timeout=120000
export npm_config_fetch_retries=5
log "Устанавливаем зависимости (корень)..."
npm_install_retry --no-fund --no-audit

log "Backend: зависимости и сборка..."
cd backend
npm_install_retry --include=dev --no-fund --no-audit
npm run build
cd ..

log "Frontend: зависимости и сборка..."
cd frontend
npm_install_retry --include=dev --no-fund --no-audit
npm run build
cd ..

log "Telegram-бот: зависимости и сборка..."
if [ -d "telegram-bot" ]; then
  cd telegram-bot
  npm_install_retry --no-fund --no-audit
  npm run build
  cd ..
  success "Бот собран"
else
  warn "Папка telegram-bot не найдена — пропускаем сборку бота"
fi

# Применяем миграции БД (если есть)
if [ -f "backend/dist/migrations.js" ]; then
  log "Применяем миграции базы данных..."
  node backend/dist/migrations.js || warn "Миграции не применились (возможно их нет)"
fi

# Удаляем trap
trap - ERR

# Запускаем приложение по очереди: сначала бэкенд (сайт), проверка health, потом бот
if [ "$NO_RESTART" = false ]; then
  if command -v pm2 &>/dev/null; then
    if [ -f "$PM2_ECOSYSTEM" ]; then
      # 1. Запуск бэкенда (cryptosignal) — без него сайт не работает
      log "Запускаем бэкенд (${PM2_APP_NAME})..."
      pm2 start "$PM2_ECOSYSTEM" --only "$PM2_APP_NAME" 2>/dev/null || pm2 restart "$PM2_APP_NAME" 2>/dev/null || true
      log "Ждём готовности бэкенда (проверка /api/health)..."
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        if curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null; then
          break
        fi
        sleep 2
      done
      if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3000/api/health 2>/dev/null; then
        err "Бэкенд (${PM2_APP_NAME}) не отвечает на порту 3000. Проверьте логи: pm2 logs ${PM2_APP_NAME} --lines 80"
        pm2 logs "$PM2_APP_NAME" --lines 40 --nostream 2>/dev/null || true
        exit 1
      fi
      sleep 3
      if curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null; then
        success "✅ Сайт (${PM2_APP_NAME}) запущен и отвечает"
      else
        warn "Бэкенд перестал отвечать через 3 сек — возможно падает: pm2 logs ${PM2_APP_NAME}"
      fi
      # 2. Бот
      log "Запускаем Telegram-бот (${PM2_BOT_NAME})..."
      pm2 start "$PM2_ECOSYSTEM" --only "$PM2_BOT_NAME" 2>/dev/null || pm2 restart "$PM2_BOT_NAME" 2>/dev/null || true
      sleep 2
      if pm2 describe "$PM2_BOT_NAME" &>/dev/null; then
        success "✅ Telegram-бот (${PM2_BOT_NAME}) запущен"
      else
        warn "Проверьте бота: pm2 logs ${PM2_BOT_NAME}"
      fi
      pm2 save 2>/dev/null || true
    else
      log "Запускаем PM2 приложение ${PM2_APP_NAME}..."
      pm2 start "$PM2_APP_NAME" 2>/dev/null || pm2 restart "$PM2_APP_NAME"
      pm2 save 2>/dev/null || true
      sleep 3
      if pm2 describe "$PM2_APP_NAME" &>/dev/null; then
        success "✅ PM2 приложение запущено"
      else
        warn "Проверьте: pm2 status && pm2 logs ${PM2_APP_NAME}"
      fi
    fi
  else
    log "Запускаем systemd сервис clabx..."
    systemctl start clabx 2>/dev/null || sudo systemctl start clabx 2>/dev/null || true
    sleep 3
    if systemctl is-active --quiet clabx 2>/dev/null; then
      success "✅ Сервис запущен"
    else
      err "Проверьте: systemctl status clabx && journalctl -u clabx -n 50"
      exit 1
    fi
  fi
fi

# Nginx: применить конфиг для clabx.ru (VPS, только при запуске от root)
# Домен clabx.ru, VPS 91.219.151.7 — сайт через nginx-pm2.conf
if [ "$NO_RESTART" = false ] && [ -f "nginx/nginx-pm2.conf" ] && command -v nginx &>/dev/null && [ "$(id -u)" = "0" ]; then
  log "Применяем Nginx-конфиг для clabx.ru..."
  PROJECT_ROOT="$(pwd)"
  sed "s|/root/opt/cryptosignal|$PROJECT_ROOT|g" nginx/nginx-pm2.conf > /etc/nginx/sites-available/clabx 2>/dev/null && \
  ln -sf /etc/nginx/sites-available/clabx /etc/nginx/sites-enabled/clabx && \
  rm -f /etc/nginx/sites-enabled/clabx_ru_ /etc/nginx/sites-enabled/default 2>/dev/null; \
  if nginx -t 2>/dev/null; then
    nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
    success "Nginx перезагружен (clabx.ru → 127.0.0.1:3000)"
  else
    warn "nginx -t не прошёл — проверьте конфиг вручную"
  fi
fi

# Очистка старых backups (оставляем только последние 5)
if [ -d "backups" ]; then
  log "Очистка старых backups..."
  ls -t backups | tail -n +6 | xargs -I {} rm -rf backups/{}
fi

success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "  ✅ Обновление завершено успешно!"
success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Изменения:"
echo "  От:  ${CURRENT_COMMIT:0:8}"
echo "  До:  ${NEW_COMMIT:0:8}"
echo ""
echo "Полезные команды:"
echo "  pm2 status                                # Статус сайта и бота (PM2)"
echo "  pm2 logs ${PM2_APP_NAME}                  # Логи сайта"
echo "  pm2 logs ${PM2_BOT_NAME}                  # Логи Telegram-бота"
echo "  curl -s http://127.0.0.1:3000/api/health  # Проверка бэкенда (должен вернуть 200)"
echo "  systemctl status clabx                    # Если через systemd"
echo "  git log --oneline -5                     # Последние коммиты"
echo ""
echo "Если сайт clabx.ru не открывается: pm2 status (cryptosignal = online), curl выше, rm -f /etc/nginx/sites-enabled/clabx_ru_ && nginx -s reload"
echo ""
if [ "${STASH_USED:-false}" = true ]; then
  warn "Локальные изменения сохранены в stash. Список: git stash list"
fi

# Показываем версию (если есть package.json с версией)
if command -v jq &> /dev/null && [ -f "package.json" ]; then
  VERSION=$(jq -r '.version // "unknown"' package.json)
  success "Текущая версия: v${VERSION}"
fi
