#!/bin/bash
# Обновление проекта с git (pull, сборка, перезапуск PM2).
#
# Запуск из корня проекта:
#   bash update.sh              # обновление с main и перезапуск
#   bash update.sh dev          # обновление с ветки dev
#   bash update.sh --no-restart  # без перезапуска PM2
#   bash update.sh --force      # принудительно (git reset --hard)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[update]${NC} $*"; }
success(){ echo -e "${GREEN}[update]${NC} $*"; }
warn()   { echo -e "${YELLOW}[update]${NC} $*"; }
err()    { echo -e "${RED}[update][ERROR]${NC} $*" >&2; }

npm_install_retry() {
  local max=5 n=1 delay=30
  export npm_config_fetch_timeout=120000
  export npm_config_fetch_retries=5
  while true; do
    if npm install "$@"; then return 0; fi
    [ $n -ge $max ] && return 1
    warn "npm install не удался (попытка $n/$max), повтор через ${delay} сек..."
    sleep $delay
    n=$((n+1))
  done
}

NO_RESTART=false
FORCE_UPDATE=false
PM2_APP_NAME="cryptosignal"
PM2_BOT_NAME="telegram-bot"
PM2_ECOSYSTEM="ecosystem.config.js"
BRANCH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-restart) NO_RESTART=true; shift ;;
    --force)      FORCE_UPDATE=true; shift ;;
    --help|-h)
      echo "Usage: ./update.sh [branch] [--no-restart] [--force]"
      exit 0
      ;;
    *)
      [[ -z "$BRANCH" ]] && BRANCH="$1"
      shift
      ;;
  esac
done

BRANCH="${BRANCH:-main}"

if [ ! -f "package.json" ]; then
  err "Запустите скрипт из корня проекта."
  exit 1
fi

log "Обновление (ветка: $BRANCH)"
CURRENT_COMMIT=$(git rev-parse HEAD)

if [ -n "$(git status --porcelain)" ]; then
  warn "Есть незакоммиченные изменения:"
  git status --short
  if [ "$FORCE_UPDATE" = true ]; then
    warn "Флаг --force: сброс изменений..."
    git reset --hard
    git clean -fd
  else
    [[ "${NONINTERACTIVE:-0}" != "1" ]] && { read -p "Продолжить? (y/N) " -n 1 -r; echo; [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0; }
  fi
fi

if [ "$NO_RESTART" = false ]; then
  if command -v pm2 &>/dev/null; then
    pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
    pm2 stop "$PM2_BOT_NAME" 2>/dev/null || true
    # Удаляем n8n из PM2 (больше не используем)
    pm2 stop n8n 2>/dev/null || true
    pm2 delete n8n 2>/dev/null || true
  fi
fi

BACKUP_DIR=""
if [ -d "data" ]; then
  BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -r data "$BACKUP_DIR/"
  log "Backup: $BACKUP_DIR"
fi

STASH_USED=false
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "update-$(date +%Y%m%d_%H%M%S)" && STASH_USED=true || { err "Не удалось stash. Используйте --force или закоммитьте изменения."; exit 1; }
fi

git fetch origin
if [ "$FORCE_UPDATE" = true ]; then
  git reset --hard origin/$BRANCH
else
  git pull origin $BRANCH
fi

NEW_COMMIT=$(git rev-parse HEAD)
if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
  success "Уже последняя версия."
  [ "$NO_RESTART" = false ] && command -v pm2 &>/dev/null && [ -f "$PM2_ECOSYSTEM" ] && pm2 reload "$PM2_ECOSYSTEM" 2>/dev/null || true
  exit 0
fi

rollback() {
  err "Откат к $CURRENT_COMMIT..."
  git reset --hard $CURRENT_COMMIT
  [[ "${STASH_USED:-false}" = true ]] && git stash pop || true
  [[ -n "${BACKUP_DIR:-}" && -d "$BACKUP_DIR" ]] && cp -r "$BACKUP_DIR/data" ./
  [ "$NO_RESTART" = false ] && command -v pm2 &>/dev/null && [ -f "$PM2_ECOSYSTEM" ] && pm2 reload "$PM2_ECOSYSTEM" 2>/dev/null || true
  exit 1
}
trap rollback ERR

[ -f "update.sh" ] && grep -q $'\r' "update.sh" 2>/dev/null && sed -i 's/\r$//' update.sh

export NODE_ENV=development
export npm_config_fetch_timeout=120000
export npm_config_fetch_retries=5

log "Зависимости (корень)..."
npm_install_retry --no-fund --no-audit

log "Backend..."
(cd backend && npm_install_retry --include=dev --no-fund --no-audit && npm run build)

log "Frontend..."
(cd frontend && npm_install_retry --include=dev --no-fund --no-audit && npm run build)

if [ -d "telegram-bot" ]; then
  log "Telegram-бот..."
  (cd telegram-bot && npm_install_retry --no-fund --no-audit && npm run build)
fi

[ -f "backend/dist/migrations.js" ] && node backend/dist/migrations.js 2>/dev/null || true

trap - ERR

if [ "$NO_RESTART" = false ] && command -v pm2 &>/dev/null && [ -f "$PM2_ECOSYSTEM" ]; then
  pm2 reload "$PM2_ECOSYSTEM" 2>/dev/null || pm2 start "$PM2_ECOSYSTEM"
  pm2 save 2>/dev/null || true
fi

[ -d "backups" ] && ls -t backups 2>/dev/null | tail -n +6 | xargs -I {} rm -rf backups/{} 2>/dev/null || true

success "Обновление завершено: ${CURRENT_COMMIT:0:8} → ${NEW_COMMIT:0:8}"
[[ "${STASH_USED:-false}" = true ]] && warn "Локальные изменения в stash: git stash list"
