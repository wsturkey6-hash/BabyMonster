# BabyMonster API（Node.js 22 + SQLite）
#
# Build context 是 **repo 根目錄**，不是 server/：shared/validateEntity.ts 要和 server/ 一起進來，
# 兩邊才不可能對驗證規則有不同解讀。例如：
#   docker build -f server/Dockerfile -t babymonster-api .
# compose 那邊對應的是 build.context 指到含 server/ 與 shared/ 的目錄、build.dockerfile 指到 server/Dockerfile。
#
# PROXY_SECRET **只**在執行時以環境變數提供（compose 的 env，來源是伺服器上的 /srv/family/.env）。
# 這裡刻意沒有任何 ARG / ENV 碰它：build ARG 會留在 image 的 history 裡，等於把 secret 烤進 image。

FROM node:22-bookworm-slim AS build
WORKDIR /app/server
# better-sqlite3 的 prebuilds/ 已經附了 linux-x64 的 binary，執行時直接載入。但它帶著 binding.gyp，
# npm 看到就會預設跑 node-gyp rebuild 從原始碼編譯，而 slim image 沒有 python 與編譯器，安裝直接失敗。
# 所以兩個階段都用 --ignore-scripts：不編譯，改用套件自己附的 binary（伺服器上實測可載入、WAL 正常）。
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts
COPY shared/validateEntity.ts /app/shared/validateEntity.ts
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    TZ=Asia/Taipei \
    DB_PATH=/data/baby.db
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist ./dist

# 非 root 執行。node image 內建的 node 使用者是 uid/gid 1000，
# 掛進來的 /data 必須讓它寫得進去（伺服器上：chown -R 1000:1000 /srv/family/babymonster/data）
USER node
EXPOSE 8080
CMD ["node", "dist/server/src/index.js"]
