import { serve } from '@hono/node-server';
import { createApp } from './app';
import { Store } from './store';

const PORT = 8080;
const MIN_SECRET = 16;

// PROXY_SECRET 只從執行時的環境變數來（compose 的 env，來源是伺服器上的 /srv/family/.env）。
// 不是 build ARG、不寫在 image 裡、不寫在 repo 裡。沒設或太短就不要啟動：
// 空字串會讓比對恆為 false（整支 API 變成全部 401），比起「悄悄沒保護」更該直接停下來講清楚。
const secret = process.env.PROXY_SECRET ?? '';
if (secret.length < MIN_SECRET) {
  console.error(`PROXY_SECRET 未設定或長度不足 ${MIN_SECRET}，不啟動`);
  process.exit(1);
}

const store = new Store(process.env.DB_PATH ?? '/data/baby.db');
const app = createApp({ store, secret });

// 容器內部的埠，compose 不對外開放，只有 cloudflared 透過 docker 內部網路連得到
serve({ fetch: app.fetch, hostname: '0.0.0.0', port: PORT }, (info) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), ev: 'listening', port: info.port }));
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store.close();
    process.exit(0);
  });
}
