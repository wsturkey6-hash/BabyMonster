#!/usr/bin/env bash
#
# 把 shared/ 與 server/ 推到家裡的伺服器，再重建容器。Mac 與 Windows Git Bash 都能跑。
# 伺服器上沒有 GitHub 憑證，所以走 tar + ssh（設計文件 §6.1）。
#
# repo 目前還是公開的，所以這個檔案裡**沒有**主機名稱、IP 或任何密碼。
# 連線目標請放在 ~/.ssh/config 的 Host 別名，用環境變數指定：
#
#   BABY_SSH_HOST=myserver ./scripts/deploy-api.sh
#
# DB_PATH 與 PROXY_SECRET 都是**伺服器上**的環境變數（compose 的 environment，
# 值放在 /srv/family/.env）。這支腳本不讀、不寫、也不印它們。
set -euo pipefail

SSH_HOST="${BABY_SSH_HOST:?請設定 BABY_SSH_HOST（建議用 ~/.ssh/config 的 Host 別名，不要寫 IP）}"
REMOTE_APP="${BABY_REMOTE_APP:-/srv/family/babymonster/app}"
COMPOSE_DIR="${BABY_COMPOSE_DIR:-/srv/family}"
SERVICE="${BABY_SERVICE:-babymonster-api}"

cd "$(dirname "$0")/.."

# .dockerignore 也要一起送：伺服器上的 build context 根目錄就是 $REMOTE_APP，
# 而 BuildKit 和舊版 builder 都只讀 context 根的那一份。不送就等於遠端建置沒有排除清單。
echo "打包 .dockerignore、shared/ 與 server/ → ${SSH_HOST}:${REMOTE_APP}"
tar czf - \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.env \
  --exclude='.env.*' \
  --exclude='*.db' \
  --exclude='*.db-wal' \
  --exclude='*.db-shm' \
  --exclude=.git \
  .dockerignore shared server \
  | ssh "$SSH_HOST" "mkdir -p '$REMOTE_APP' && tar xzf - -C '$REMOTE_APP'"

echo "重建並啟動 ${SERVICE}"
ssh "$SSH_HOST" "cd '$COMPOSE_DIR' && docker compose up -d --build '$SERVICE'"

echo "完成。檢查：ssh ${SSH_HOST} 'docker logs --tail 20 ${SERVICE}'"
