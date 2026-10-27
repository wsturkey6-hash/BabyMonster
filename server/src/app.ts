import { Hono } from 'hono';
import { familyUser, proxySecretOk } from './auth';
import { BodyTooLargeError, MAX_BODY_BYTES, readCappedText } from './body';
import { logCrash, logRejected, logSync } from './log';
import { applySync } from './sync';
import type { Store } from './store';

export interface AppOptions {
  store: Store;
  secret: string;
  /** 伺服器的時鐘。測試會換掉它；平移與範圍檢查都以它為準。 */
  now?: () => number;
}

export function createApp(opts: AppOptions) {
  const now = opts.now ?? Date.now;
  const app = new Hono();

  // 每個請求都要帶對的 X-Proxy-Secret（三道保護的最後一道，Access 設錯時還擋得住）。
  // 所有失敗路徑都回同一個 401 與同一句話：不透露是沒帶、長度不對還是值不對。
  app.use('*', async (c, next) => {
    if (!proxySecretOk(c.req.header('x-proxy-secret'), opts.secret)) {
      logRejected(401, 'proxy-secret');
      return c.json({ error: '未授權' }, 401);
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/sync', async (c) => {
    const started = performance.now();

    let text: string;
    try {
      text = await readCappedText(c.req.raw, MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        logRejected(413, 'body-too-large');
        return c.json({ error: '請求內容過大' }, 413);
      }
      throw err;
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      logRejected(400, 'bad-json');
      return c.json({ error: '請求內容格式錯誤' }, 400);
    }

    const user = familyUser(c.req.header('x-family-user'));
    const out = applySync(opts.store, body, now(), user);
    if (!out.ok) {
      logRejected(400, 'bad-request');
      return c.json({ error: out.message }, 400);
    }
    logSync({ user, ...out.counts, ms: Math.round(performance.now() - started) });
    return c.json(out.response);
  });

  // 客戶端只認 application/json（不是 JSON 就當成 Access session 過期），所以錯誤也一律回 JSON
  app.notFound((c) => c.json({ error: '找不到這個路徑' }, 404));
  app.onError((err, c) => {
    logCrash(c.req.path, err);
    return c.json({ error: '伺服器內部錯誤' }, 500);
  });

  return app;
}
