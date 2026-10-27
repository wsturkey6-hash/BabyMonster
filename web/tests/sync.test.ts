import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSyncTimestamp, parseEpochMs, validateEntity } from '../../shared/validateEntity';
import { BabyDB, type EntityKind } from '../src/db/db';
import { failurePhase } from '../src/sync/autoSync';
import { NeedsLoginError, RequestError, syncOnce, type Change, type ServerChange, type SyncResponse } from '../src/sync/sync';
import type { RecordData } from '../src/logic/types';

/** 行程內的假伺服器：LWW（updatedAt 大者勝，相等時後到者勝）、墓碑、單調遞增的 seq。 */
class FakeServer {
  rows = new Map<string, ServerChange>();
  seq = 0;
  requests: { cursor: number; changes: Change[] }[] = [];

  fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { cursor, changes } = JSON.parse(init!.body as string) as { cursor: number; changes: Change[] };
    this.requests.push({ cursor, changes });
    const results = changes.map((c) => {
      let applied = false;
      try {
        assertSyncTimestamp(c.updatedAt, Date.now());
        if (c.op === 'put') validateEntity(c.kind, c.id, c.data, parseEpochMs);
        const stored = this.rows.get(`${c.kind}/${c.id}`);
        if (!stored || c.updatedAt >= stored.updatedAt) {
          this.rows.set(`${c.kind}/${c.id}`, {
            kind: c.kind, id: c.id, deleted: c.op === 'delete', data: c.data, updatedAt: c.updatedAt, seq: ++this.seq,
          });
          applied = true;
        }
      } catch {
        // 驗證不過：照協定回 applied: false
      }
      return { kind: c.kind, id: c.id, applied };
    });
    const out: SyncResponse = {
      cursor: this.seq,
      changes: [...this.rows.values()].filter((r) => r.seq > cursor),
      results,
    };
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  };

  /** 伺服器上還活著的實體 */
  live(kind: EntityKind) {
    return [...this.rows.values()].filter((r) => r.kind === kind && !r.deleted).map((r) => r.data).sort(byId);
  }
}

const byId = (a: any, b: any) => (a.id ?? a.key).localeCompare(b.id ?? b.key);
const newClient = (name: string) => new BabyDB(name, { indexedDB: new IDBFactory(), IDBKeyRange });
const P = 'aaaaaaaa-0000-0000-0000-000000000001';
const rec = (id: string, extra: Partial<RecordData> = {}): RecordData => ({
  id, babyId: P, timestamp: 1_700_000_000_000, hasUrine: false, ...extra,
});

// 可控的時鐘：每次寫入前自己撥到想要的時間
let clock = 0;
beforeEach(() => {
  clock = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

async function snapshot(db: BabyDB) {
  return {
    profiles: (await db.profiles.toArray()).sort(byId),
    records: (await db.records.toArray()).sort(byId),
  };
}

describe('syncOnce', () => {
  it('兩支手機：爸爸新增、媽媽編輯、爸爸刪除，交錯同步後三方一致', async () => {
    const server = new FakeServer();
    const father = newClient('father');
    const mother = newClient('mother');

    await father.profiles.add({ id: P, name: '小明', birthDate: 0 });
    await father.records.bulkAdd([rec('keep'), rec('doomed'), rec('both')]);
    await syncOnce(father, server.fetch);
    await syncOnce(mother, server.fetch);
    expect((await snapshot(mother)).records.map((r) => r.id)).toEqual(['both', 'doomed', 'keep']);

    // 媽媽編輯 doomed 與 keep，爸爸在同步前刪除 doomed、並編輯 both
    clock += 1000;
    await mother.records.put(rec('doomed', { note: '媽媽改的' }));
    await mother.records.put(rec('keep', { note: '媽媽改的' }));
    clock += 1000;
    await father.records.delete('doomed');
    await father.records.put(rec('both', { note: '爸爸改的' }));
    clock += 1000;
    await mother.records.put(rec('both', { note: '媽媽後改的' }));

    await syncOnce(mother, server.fetch);
    await syncOnce(father, server.fetch);
    await syncOnce(mother, server.fetch);
    await syncOnce(father, server.fetch);

    const f = await snapshot(father);
    const m = await snapshot(mother);
    expect(f).toEqual(m);
    expect(f.records.map((r) => [r.id, r.note])).toEqual([['both', '媽媽後改的'], ['keep', '媽媽改的']]);
    expect(server.live('record')).toEqual(f.records);
    expect(server.live('profile')).toEqual(f.profiles);
    expect(await father.outbox.count()).toBe(0);
    expect(await mother.outbox.count()).toBe(0);
  });

  it('上傳期間被改過的列（seq 較大）不會被刪掉，下一輪送出；也不會被回傳的舊版蓋掉', async () => {
    const server = new FakeServer();
    const db = newClient('a');
    await db.records.add(rec('r1', { note: 'v1' }));

    let edited = false;
    const fetchWithEdit: typeof fetch = async (url, init) => {
      const res = await server.fetch(url, init);
      if (!edited) {
        edited = true;
        clock += 1000;
        await db.records.put(rec('r1', { note: 'v2' })); // 請求在途中又編輯
      }
      return res;
    };
    await syncOnce(db, fetchWithEdit);

    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].changes[0].data).toMatchObject({ note: 'v1' });
    expect(server.requests[1].changes[0].data).toMatchObject({ note: 'v2' });
    expect((await db.records.get('r1'))?.note).toBe('v2');
    expect((server.rows.get('record/r1')?.data as RecordData).note).toBe('v2');
    expect(await db.outbox.count()).toBe(0);
  });

  it('伺服器略過的筆數會回報（輸給 LWW 的舊寫入）', async () => {
    const server = new FakeServer();
    const a = newClient('a');
    const b = newClient('b');
    clock += 10_000;
    await a.records.add(rec('r1', { note: '新' }));
    await syncOnce(a, server.fetch);
    clock -= 5_000; // b 的時鐘比較慢
    await b.records.add(rec('r1', { note: '舊' }));
    expect(await syncOnce(b, server.fetch)).toEqual({ skipped: 1, kept: 0 });
    expect((await b.records.get('r1'))?.note).toBe('新');
  });

  it('回應不是 JSON（Access session 過期的登入頁）→ NeedsLoginError，outbox 保留', async () => {
    const db = newClient('a');
    await db.records.add(rec('r1'));
    const html: typeof fetch = async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } });
    await expect(syncOnce(db, html)).rejects.toBeInstanceOf(NeedsLoginError);
    expect(await db.outbox.count()).toBe(1);
  });

  it('請求帶 clientNow，且是送出當下的時間，不是寫入當下的時間', async () => {
    const db = newClient('a');
    await db.records.add(rec('r1')); // 寫入時 clock = 起點
    clock += 3 * 3600_000; // 離線三小時後才送出
    const bodies: { clientNow: number; changes: Change[] }[] = [];
    const spy: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ cursor: 0, changes: [], results: [] }), { headers: { 'content-type': 'application/json' } });
    };
    const written = clock - 3 * 3600_000;
    await syncOnce(db, spy);
    expect(bodies[0].clientNow).toBe(clock);
    expect(bodies[0].changes[0].updatedAt).toBe(written);
  });

  it('4xx → RequestError，不是一般 Error；failurePhase 不判成 serverDown；5xx 仍是 serverDown', async () => {
    const db = newClient('a');
    await db.records.add(rec('r1'));
    const status = (n: number): typeof fetch => async () =>
      new Response('{}', { status: n, headers: { 'content-type': 'application/json' } });
    const e400 = await syncOnce(db, status(400)).catch((e) => e);
    expect(e400).toBeInstanceOf(RequestError);
    expect(failurePhase(e400)).toBe('requestError');
    const e500 = await syncOnce(db, status(500)).catch((e) => e);
    expect(e500).not.toBeInstanceOf(RequestError);
    expect(failurePhase(e500)).toBe('serverDown');
    expect(await db.outbox.count()).toBe(1); // 失敗不丟資料
  });

  it('非 stale 的拒收：算進 skipped、列留在 outbox，並 console.error 出 kind 與 id', async () => {
    const db = newClient('a');
    await db.records.add(rec('r1'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalid: typeof fetch = async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string) as { changes: Change[] };
      const results = changes.map((c) => ({ kind: c.kind, id: c.id, applied: false, reason: 'invalid' }));
      return new Response(JSON.stringify({ cursor: 0, changes: [], results }), { headers: { 'content-type': 'application/json' } });
    };
    expect(await syncOnce(db, invalid)).toEqual({ skipped: 1, kept: 1 });
    expect(await db.outbox.count()).toBe(1); // 沒寫進伺服器的列不能丟，否則本機與伺服器無聲分歧
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('record/r1');
  });

  it('迴圈上限：伺服器每輪都回新東西又說 more 時，一輪乾淨結束（不丟錯、不無限請求）', async () => {
    const db = newClient('a');
    let n = 0;
    const endless: typeof fetch = async () => {
      n++; // 每輪都有進展，進展護欄不會停，只剩 MAX_ROUNDS 擋得住
      const changes = [{ kind: 'record', id: `r${n}`, deleted: false, data: rec(`r${n}`), updatedAt: 1, seq: n }];
      return new Response(JSON.stringify({ cursor: n, changes, more: true }), { headers: { 'content-type': 'application/json' } });
    };
    await expect(syncOnce(db, endless)).resolves.toEqual({ skipped: 0, kept: 0 });
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(1000);
  });
});

describe('assertSyncTimestamp', () => {
  const now = Date.UTC(2026, 9, 27);
  it('接受現在與合理範圍內的值', () => {
    expect(assertSyncTimestamp(now, now)).toBe(now);
    expect(assertSyncTimestamp(now + 60_000, now)).toBe(now + 60_000);
    expect(assertSyncTimestamp(now - 365 * 86400_000, now)).toBeTruthy();
  });
  it('拒絕 8.64e15、遠古值、秒當毫秒、非數字', () => {
    for (const bad of [8.64e15, 0, 1, Math.floor(now / 1000), now + 10 * 60_000, now - 11 * 365 * 86400_000, NaN, Infinity, '1', null])
      expect(() => assertSyncTimestamp(bad, now)).toThrow();
  });
});

describe('送出前夾擠 updatedAt', () => {
  it('比 clientNow 晚 10 分鐘的 updatedAt 以 clientNow 送出；較早的原樣送出', async () => {
    const db = newClient('a');
    clock += 600_000; // 手機快 10 分鐘時寫入
    await db.records.add(rec('future'));
    clock -= 600_000; // 之後時鐘修正回來
    const past = clock - 60_000;
    await db.outbox.put({ kind: 'record', id: 'past', op: 'put', data: rec('past'), updatedAt: past, seq: 99 });
    const sent: { clientNow: number; changes: Change[] }[] = [];
    const fetchFn: typeof fetch = async (_u, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ cursor: 0, changes: [], results: [] }), { headers: { 'content-type': 'application/json' } });
    };
    await syncOnce(db, fetchFn);
    const byId = Object.fromEntries(sent[0].changes.map((c) => [c.id, c.updatedAt]));
    expect(sent[0].clientNow).toBe(clock);
    expect(byId.future).toBe(clock);
    expect(byId.past).toBe(past);
  });
});

describe('伺服器沒寫入的列', () => {
  const reply = (result: object) => async (_u: RequestInfo | URL, init?: RequestInit) => {
    const { changes } = JSON.parse(init!.body as string) as { changes: Change[] };
    const results = changes.map((c) => ({ kind: c.kind, id: c.id, applied: false, ...result }));
    return new Response(JSON.stringify({ cursor: 0, changes: [], results }), { headers: { 'content-type': 'application/json' } });
  };

  it("reason 是 'invalid' → 列留在 outbox", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = newClient('a');
    await db.records.add(rec('r1'));
    await syncOnce(db, reply({ reason: 'invalid' }));
    expect(await db.outbox.count()).toBe(1);
    expect(err).toHaveBeenCalled();
  });

  it("reason 是 'stale' 或沒帶 reason → 列被丟掉", async () => {
    for (const result of [{ reason: 'stale' }, {}]) {
      const db = newClient('a');
      await db.records.add(rec('r1'));
      await syncOnce(db, reply(result));
      expect(await db.outbox.count()).toBe(0);
    }
  });

  it('什麼都沒寫入、也沒回傳東西 → 這輪結束就停，不跑滿 MAX_ROUNDS', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = newClient('a');
    await db.records.add(rec('r1'));
    const fetchFn = vi.fn(reply({ reason: 'invalid' })) as unknown as typeof fetch;
    await syncOnce(db, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(1);
  });
});

describe('請求大小', () => {
  // 伺服器在 parse 之前就擋 2 MB。只限 500 筆不夠：每筆都帶一段接近上限的備註時，
  // 500 筆會組出超過 2 MB 的 body，而每一輪都重建同一個 body、每一輪都被回 413，
  // 於是整個同步（連拉取一起）永久停擺，待傳清單一筆都傳不出去。
  const SERVER_CAP = 2 * 1024 * 1024;

  it('一批就超過伺服器上限時，會自己切小批送完，不會每輪都撞 413', async () => {
    const server = new FakeServer();
    const db = newClient('big');
    const note = '安'.repeat(1400); // 遠低於 MAX_NOTE = 2000，但 UTF-8 約 4.2 KB
    await db.records.bulkAdd(Array.from({ length: 500 }, (_, i) => rec(`r${i}`, { note })));

    let oversized = 0;
    const capped: typeof fetch = async (url, init) => {
      if (new TextEncoder().encode(init!.body as string).length > SERVER_CAP) {
        oversized++;
        return new Response(JSON.stringify({ error: '請求過大' }), {
          status: 413, headers: { 'content-type': 'application/json' },
        });
      }
      return server.fetch(url, init);
    };

    await syncOnce(db, capped);
    expect(oversized).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(server.live('record')).toHaveLength(500);
    expect(server.requests.length).toBeGreaterThan(1); // 真的切成多批
  });

  it('單筆自己就很大也照送，不會卡成一筆都送不動', async () => {
    const server = new FakeServer();
    const db = newClient('one');
    await db.records.add(rec('r1', { note: '安'.repeat(1999) }));
    await syncOnce(db, server.fetch);
    expect(await db.outbox.count()).toBe(0);
    expect(server.requests[0].changes).toHaveLength(1);
  });
});
