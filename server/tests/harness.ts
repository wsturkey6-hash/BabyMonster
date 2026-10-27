import { vi } from 'vitest';
import { createApp } from '../src/app';
import { Store } from '../src/store';
import type { EntityRow } from '../src/store';

export const SECRET = 'test-proxy-secret-0123456789';
export const USER = 'parent@example.com';
/** 與共用向量檔同一個「現在」，時間相關的測試都以它為基準。 */
export const T0 = 1_790_000_000_000;

export interface SyncInit {
  secret?: string | null;
  user?: string | null;
  /** 直接送原始字串（測 __proto__ 這種沒辦法用物件字面值表達的 body）。 */
  raw?: string;
}

export interface Harness {
  store: Store;
  /** 伺服器的時鐘，測試可以推進它。 */
  setNow(t: number): void;
  sync(body: unknown, init?: SyncInit): Promise<{ status: number; body: any }>;
  request(path: string, init?: RequestInit & { secret?: string | null }): Promise<Response>;
  rows(): EntityRow[];
  row(kind: string, id: string): EntityRow | undefined;
  /** 直接塞 n 列進 DB（分頁測試要上千列，走 HTTP 太慢）。 */
  seed(n: number): void;
}

/** log 是刻意要留在正式環境的，但單元測試裡會蓋掉輸出，所以關掉。 */
export function silenceLogs(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

export function harness(start = T0): Harness {
  const store = new Store(':memory:');
  let now = start;
  const app = createApp({ store, secret: SECRET, now: () => now });

  // secret / user 給 null 代表「不要帶這個 header」，沒給就用預設值
  const headers = (init?: { secret?: string | null; user?: string | null }): Record<string, string> => {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    const secret = init && 'secret' in init ? init.secret : SECRET;
    if (typeof secret === 'string') h['x-proxy-secret'] = secret;
    const user = init && 'user' in init ? init.user : USER;
    if (typeof user === 'string') h['x-family-user'] = user;
    return h;
  };

  return {
    store,
    setNow: (t) => {
      now = t;
    },
    async sync(body, init) {
      const res = await app.request('/api/sync', {
        method: 'POST',
        headers: headers(init),
        body: init?.raw ?? JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text === '' ? undefined : JSON.parse(text) };
    },
    async request(path, init) {
      const h = { ...headers(init), ...((init?.headers as Record<string, string>) ?? {}) };
      return app.request(path, { ...init, headers: h });
    },
    rows: () => store.since(0, 100_000),
    row: (kind, id) => store.since(0, 100_000).find((r) => r.kind === kind && r.id === id),
    seed(n) {
      store.transaction(() => {
        for (let i = 0; i < n; i++) {
          store.write({
            kind: 'record',
            id: `seed-${i}`,
            json: JSON.stringify({ id: `seed-${i}`, babyId: 'b', timestamp: T0, hasUrine: false }),
            deleted: false,
            updatedAt: T0,
            updatedBy: USER,
            seq: store.nextSeq(),
            receivedAt: T0,
          });
        }
      });
    },
  };
}

const BABY = 'aaaaaaaa-0000-0000-0000-000000000001';

/** 一筆合法的 record change。 */
export function putRecord(id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'record',
    id,
    op: 'put' as const,
    data: { id, babyId: BABY, timestamp: T0, hasUrine: false, ...extra },
    updatedAt,
  };
}

export function deleteRecord(id: string, updatedAt: number) {
  return { kind: 'record', id, op: 'delete' as const, updatedAt };
}

export { BABY };
