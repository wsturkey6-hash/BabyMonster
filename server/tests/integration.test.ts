/**
 * 端到端：真正的客戶端模組（web/src/sync/sync.ts）對真正的伺服器，走 loopback 的 HTTP。
 *
 * 兩支獨立的手機各自一個 fake-indexeddb，交錯做新增／編輯／刪除，最後三方（兩支手機與伺服器）
 * 必須完全一致。不需要 dev server、也不需要 Pages Function：那一段轉送是另一個 commit 的事，
 * 這裡直接把 Function 會加上的兩個 header（X-Proxy-Secret、X-Family-User）補上。
 */
import 'fake-indexeddb/auto';
import { serve } from '@hono/node-server';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Store } from '../src/store';
import { BabyDB } from '../../web/src/db/db';
import { syncOnce } from '../../web/src/sync/sync';
import type { RecordData } from '../../web/src/logic/types';

const SECRET = 'integration-proxy-secret-0123456789';
const BABY = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOSE = `${BABY}|hepb|第一劑`;

let store: Store;
let server: { close: (cb?: () => void) => void };
let base = '';

beforeAll(async () => {
  store = new Store(':memory:');
  const app = createApp({ store, secret: SECRET });
  await new Promise<void>((done) => {
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info) => {
      base = `http://127.0.0.1:${info.port}`;
      done();
    }) as unknown as { close: (cb?: () => void) => void };
  });
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  store.close();
});

/** 這支手機的 fetch：客戶端送的是相對路徑 /api/sync，補上 origin 與轉送層會加的 header。 */
function phoneFetch(email: string): typeof fetch {
  return async (url, init) => {
    const path = typeof url === 'string' ? url : String(url);
    return fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), 'x-proxy-secret': SECRET, 'x-family-user': email },
    });
  };
}

interface Phone {
  name: string;
  db: BabyDB;
  fetch: typeof fetch;
}

let phones = 0;
function newPhone(name: string, email: string): Phone {
  phones++;
  return {
    name,
    db: new BabyDB(`${name}-${phones}`, { indexedDB: new IDBFactory(), IDBKeyRange }),
    fetch: phoneFetch(email),
  };
}

const totals = { pushed: 0, pulled: 0, skipped: 0 };

/** 同步一次，順便把計數累加起來（最後印出來）。 */
async function sync(p: Phone): Promise<{ skipped: number; kept: number }> {
  const before = await p.db.outbox.count();
  const cursorBefore = (await p.db.syncState.get('cursor'))?.v ?? 0;
  const out = await syncOnce(p.db, p.fetch);
  const cursorAfter = (await p.db.syncState.get('cursor'))?.v ?? 0;
  totals.pushed += before;
  totals.pulled += Math.max(0, cursorAfter - cursorBefore);
  totals.skipped += out.skipped;
  return out;
}

/** 三方（兩支手機 + 伺服器）看到的東西。 */
async function snapshot(p: Phone) {
  return {
    profiles: await p.db.profiles.orderBy('id').toArray(),
    records: (await p.db.records.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    doses: (await p.db.vaccineDoses.toArray()).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function serverSnapshot() {
  const live = store.since(0, 100_000).filter((r) => r.deleted === 0);
  const of = (kind: string) => live.filter((r) => r.kind === kind).map((r) => JSON.parse(r.data!));
  return {
    profiles: of('profile').sort((a, b) => a.id.localeCompare(b.id)),
    records: of('record').sort((a: RecordData, b: RecordData) => a.id.localeCompare(b.id)),
    doses: of('vaccineDose').sort((a, b) => a.key.localeCompare(b.key)),
  };
}

const rec = (id: string, extra: Partial<RecordData> = {}): RecordData => ({
  id,
  babyId: BABY,
  timestamp: 1_700_000_000_000,
  hasUrine: false,
  ...extra,
});

describe('真客戶端 × 真伺服器（loopback）', () => {
  let dad: Phone;
  let mum: Phone;
  beforeEach(() => {
    dad = newPhone('dad', 'dad@example.com');
    mum = newPhone('mum', 'mum@example.com');
  });

  it('GET /api/health', async () => {
    const res = await fetch(`${base}/api/health`, { headers: { 'x-proxy-secret': SECRET } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('新增 → 編輯 → 刪除交錯，最後兩支手機與伺服器三方一致', async () => {
    // 爸爸建立寶寶、三筆記錄、一筆接種
    await dad.db.profiles.add({ id: BABY, name: '小寶', birthDate: 1_700_000_000_000, sex: 'male' });
    await dad.db.records.bulkAdd([rec('r1', { feedAmount: 100 }), rec('r2'), rec('r3')]);
    await dad.db.vaccineDoses.add({ key: DOSE, babyId: BABY, vaccineId: 'hepb', doseLabel: '第一劑', date: 1_700_000_000_000 });
    await sync(dad);
    await sync(mum);
    expect((await snapshot(mum)).records).toHaveLength(3);

    // 媽媽改 r1、刪 r3、改寶寶名字；爸爸同時新增 r4
    await mum.db.records.update('r1', { note: '媽媽加的備註' });
    await mum.db.records.delete('r3');
    await mum.db.profiles.update(BABY, { name: '小寶寶' });
    await dad.db.records.add(rec('r4', { weight: 5000 }));
    await sync(mum);
    await sync(dad);
    await sync(mum);

    // 爸爸把接種紀錄改回尚未施打（= 刪除），媽媽改 r2
    await dad.db.vaccineDoses.delete(DOSE);
    await mum.db.records.update('r2', { temperature: 37.1 });
    for (const p of [dad, mum, dad, mum]) await sync(p);

    const d = await snapshot(dad);
    const m = await snapshot(mum);
    expect(m).toEqual(d);
    expect(serverSnapshot()).toEqual(d);

    expect(d.records.map((r) => r.id)).toEqual(['r1', 'r2', 'r4']);
    expect(d.records[0].note).toBe('媽媽加的備註');
    expect(d.records[1].temperature).toBe(37.1);
    expect(d.profiles[0].name).toBe('小寶寶');
    expect(d.doses).toEqual([]);

    expect(await dad.db.outbox.count()).toBe(0);
    expect(await mum.db.outbox.count()).toBe(0);
    // 墓碑留在伺服器上（r3 與那筆接種），只是不再算進「活的」資料
    expect(store.since(0, 100_000).filter((r) => r.deleted === 1).map((r) => r.id).sort()).toEqual([DOSE, 'r3']);
  });

  it('輸掉 LWW 的那支手機會把贏家拿回來（伺服器推進贏家的 seq）', async () => {
    await dad.db.records.add(rec('r1'));
    await sync(dad);
    await sync(mum);

    // 爸爸先改（較早），媽媽後改（較晚）→ 媽媽贏；爸爸的版本被回報 stale 之後要收到媽媽的版本
    await dad.db.records.update('r1', { note: '爸爸' });
    await new Promise((r) => setTimeout(r, 5));
    await mum.db.records.update('r1', { note: '媽媽' });
    await sync(mum); // 贏家先上去，媽媽的游標已越過它
    const out = await sync(dad); // 爸爸輸掉
    expect(out.skipped).toBeGreaterThan(0);
    expect(out.kept).toBe(0); // stale 不是 invalid，不會留在 outbox
    for (const p of [dad, mum]) await sync(p);

    expect((await dad.db.records.get('r1'))?.note).toBe('媽媽');
    expect((await mum.db.records.get('r1'))?.note).toBe('媽媽');
    expect(serverSnapshot().records[0].note).toBe('媽媽');
  });

  it('伺服器沒有任何一筆被回報 invalid（正常使用下不該出現）', async () => {
    await dad.db.records.add(rec('r1'));
    const out = await sync(dad);
    expect(out.kept).toBe(0);
  });

  /**
   * 真的 socket 路徑：不帶 Content-Length 的 50 MB（chunked）。
   * 這裡要看的不只是 413，而是「實際只流進來剛過上限的那一點點」——
   * 這台機器只有 8 GB，還跑著 Audiobookshelf，整包 50 MB 進記憶體是不行的。
   */
  it('50 MB 的 chunked body 回 413，而且真的只收到剛過上限的量', async () => {
    const CHUNK = 64 * 1024;
    const TOTAL = 50 * 1024 * 1024;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= TOTAL) {
          c.close();
          return;
        }
        sent += CHUNK;
        c.enqueue(new Uint8Array(CHUNK).fill(0x78));
      },
    });
    const res = await fetch(`${base}/api/sync`, {
      method: 'POST',
      body,
      // @ts-expect-error duplex 是 Node 的 fetch 才有的欄位
      duplex: 'half',
      headers: { 'content-type': 'application/json', 'x-proxy-secret': SECRET },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: '請求內容過大' });
    expect(sent).toBeLessThan(8 * 1024 * 1024); // 50 MB 裡真正流進來的只有幾 MB
  });

  // 放在最後一個 it 裡而不是 afterAll：這樣這一行一定會跟著 `npm test` 印出來
  it('印出這一輪的推送／拉取／略過筆數', () => {
    console.log(
      `[integration] 真客戶端 × 真伺服器：pushed=${totals.pushed} pulled=${totals.pulled} skipped=${totals.skipped}`,
    );
    expect(totals.pushed).toBeGreaterThan(0);
    expect(totals.pulled).toBeGreaterThan(0);
  });
});
