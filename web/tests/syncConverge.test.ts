import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSyncTimestamp, parseEpochMs, validateEntity } from '../../shared/validateEntity';
import { BabyDB } from '../src/db/db';
import { applyRemote, syncOnce, type ServerChange, type SyncRequest, type SyncResponse } from '../src/sync/sync';
import type { RecordData } from '../src/logic/types';

const P = 'aaaaaaaa-0000-0000-0000-000000000001';
const rec = (id: string, extra: Partial<RecordData> = {}): RecordData => ({
  id, babyId: P, timestamp: 1_700_000_000_000, hasUrine: false, ...extra,
});
const newClient = (name: string) => new BabyDB(name, { indexedDB: new IDBFactory(), IDBKeyRange });

/**
 * 假伺服器：照 shared 的驗證擋 updatedAt、嚴格 LWW（>=）、單調 seq，並回報 reason。
 * bumpOnStale：拒絕 stale 時把贏家的 seq 推到最新（資料不變），對應設計文件 §4.1 的修訂。
 * serverNow：給了就照設計把每筆 updatedAt 依 clientNow 平移到伺服器時間軸（skew = serverNow - clientNow）再檢查、比較、儲存。
 */
class Server {
  constructor(private bumpOnStale = false, private serverNow?: () => number) {}
  rows = new Map<string, ServerChange>();
  seq = 0;
  fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = JSON.parse(init!.body as string) as SyncRequest;
    const { cursor } = req;
    const skew = this.serverNow ? this.serverNow() - req.clientNow : 0;
    const changes = req.changes.map((c) => ({ ...c, updatedAt: c.updatedAt + skew }));
    const results = changes.map((c) => {
      const k = `${c.kind}/${c.id}`;
      try {
        assertSyncTimestamp(c.updatedAt, this.serverNow ? this.serverNow() : Date.now());
        if (c.op === 'put') validateEntity(c.kind, c.id, c.data, parseEpochMs);
      } catch {
        return { kind: c.kind, id: c.id, applied: false, reason: 'invalid' as const };
      }
      const cur = this.rows.get(k);
      if (cur && c.updatedAt < cur.updatedAt) {
        if (this.bumpOnStale) cur.seq = ++this.seq;
        return { kind: c.kind, id: c.id, applied: false, reason: 'stale' as const };
      }
      this.rows.set(k, {
        kind: c.kind, id: c.id, deleted: c.op === 'delete', data: c.data, updatedAt: c.updatedAt, seq: ++this.seq,
      });
      return { kind: c.kind, id: c.id, applied: true };
    });
    const out: SyncResponse = {
      cursor: this.seq,
      changes: [...this.rows.values()].filter((r) => r.seq > cursor).sort((a, b) => a.seq - b.seq),
      results,
    };
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  };
}

/** 在指定的時鐘下執行（手機時鐘各自不同）。 */
async function at<T>(t: number, fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(Date, 'now').mockReturnValue(t);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}
afterEach(() => vi.restoreAllMocks());

describe('時鐘誤差在容許範圍內（快 4 分鐘 < 5 分鐘）時兩支手機仍要收斂', () => {
  it('快手機先改並同步、慢手機改兩次（第二次在請求途中）→ 最後兩邊與伺服器一致', async () => {
    const srv = new Server();
    const slow = newClient('slow');
    const fast = newClient('fast');
    const T = Date.now();

    await at(T, async () => {
      await slow.records.add(rec('r1'));
    });
    await syncOnce(slow, srv.fetch);
    await syncOnce(fast, srv.fetch);

    await at(T + 240_000, () => fast.records.update('r1', { note: '快手機' }));
    await syncOnce(fast, srv.fetch);

    await at(T + 1_000, () => slow.records.update('r1', { note: '慢手機 1' }));
    let edited = false;
    const fetchWithEdit: typeof fetch = async (url, init) => {
      if (!edited) {
        edited = true;
        await at(T + 2_000, () => slow.records.update('r1', { note: '慢手機 2' })); // 請求在途中又編輯
      }
      return srv.fetch(url, init);
    };
    await syncOnce(slow, fetchWithEdit);
    for (const c of [slow, fast, slow, fast, slow]) await syncOnce(c, srv.fetch);

    const onServer = (srv.rows.get('record/r1')!.data as RecordData).note;
    expect((await slow.records.get('r1'))?.note).toBe(onServer);
    expect((await fast.records.get('r1'))?.note).toBe(onServer);
    expect(await slow.outbox.count()).toBe(0);
    expect(await fast.outbox.count()).toBe(0);
  });
});

/**
 * 慢手機（時鐘慢 4 分鐘）在拉過贏家之後才編輯並輸掉 LWW：贏家的 seq 已經落在它的 cursor 之前。
 * 回傳雙方與伺服器同步到穩定後的狀態。
 */
async function loseAfterPulling(srv: Server, winner: BabyDB, loser: BabyDB, edit: (db: BabyDB) => Promise<unknown>) {
  const T = Date.now();
  await at(T, () => winner.records.add(rec('r1')));
  await syncOnce(winner, srv.fetch);
  await syncOnce(loser, srv.fetch);
  await at(T + 1_000, () => winner.records.update('r1', { note: '贏家' }));
  await syncOnce(winner, srv.fetch);
  await syncOnce(loser, srv.fetch); // loser 的 cursor 已越過贏家
  await at(T - 240_000, () => edit(loser));
  for (const c of [loser, winner, loser, winner]) await syncOnce(c, srv.fetch);
}

async function expectConverged(srv: Server, ...clients: BabyDB[]) {
  const onServer = srv.rows.get('record/r1')!;
  expect(onServer.deleted).toBe(false);
  for (const c of clients) {
    expect(await c.records.get('r1')).toEqual(onServer.data);
    expect(await c.outbox.count()).toBe(0);
  }
}

describe('慢 4 分鐘的手機在拉過贏家後編輯、輸掉 LWW（伺服器拒絕 stale 時會推進贏家 seq）', () => {
  const edits = {
    put: (db: BabyDB) => db.records.put(rec('r1', { note: '輸家' })),
    update: (db: BabyDB) => db.records.update('r1', { note: '輸家' }),
    delete: (db: BabyDB) => db.records.delete('r1'),
  };
  for (const [name, edit] of Object.entries(edits)) {
    for (const [label, slowIsA] of [['A 慢', true], ['B 慢', false]] as const) {
      it(`${name}（${label}）→ 輸家拿回贏家，雙方與伺服器一致`, async () => {
        const srv = new Server(true);
        const a = newClient('a');
        const b = newClient('b');
        await (slowIsA ? loseAfterPulling(srv, b, a, edit) : loseAfterPulling(srv, a, b, edit));
        await expectConverged(srv, a, b);
        expect((await a.records.get('r1'))?.note).toBe('贏家');
      });
    }
  }

  it('特徵測試（不是期望行為）：伺服器拒絕 stale 時若不推進贏家 seq，輸家永久停在自己的版本', async () => {
    const srv = new Server(false);
    const winner = newClient('w');
    const loser = newClient('l');
    await loseAfterPulling(srv, winner, loser, edits.put);
    expect(await loser.outbox.count()).toBe(0);
    expect((await loser.records.get('r1'))?.note).toBe('輸家');
    expect((srv.rows.get('record/r1')!.data as RecordData).note).toBe('贏家');
  });
});

describe('伺服器回的 cursor 不可信', () => {
  it('回全域最大 seq 而不是這批的最大 seq 時，客戶端不會越過沒收到的變更', async () => {
    const srv = new Server();
    const a = newClient('a');
    const b = newClient('b');
    for (const id of ['r1', 'r2', 'r3', 'r4']) await a.records.add(rec(id));
    await syncOnce(a, srv.fetch);

    // 每批只送 2 筆、cursor 卻回全域最大 seq
    const lying: typeof fetch = async (url, init) => {
      const res = await srv.fetch(url, init);
      const body = (await res.json()) as SyncResponse;
      const more = body.changes.length > 2;
      body.changes = body.changes.slice(0, 2);
      body.more = more;
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    await syncOnce(b, lying);
    expect((await b.records.toArray()).map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect((await b.syncState.get('cursor'))?.v).toBe(4);
  });

  it('空批次不動 cursor，cursor 也不會倒退', async () => {
    const db = newClient('a');
    await applyRemote(db, [{ kind: 'record', id: 'r1', deleted: false, data: rec('r1'), updatedAt: 1, seq: 5 }], 5);
    await applyRemote(db, [], 999);
    expect((await db.syncState.get('cursor'))?.v).toBe(5);
    await applyRemote(db, [{ kind: 'record', id: 'r0', deleted: false, data: rec('r0'), updatedAt: 1, seq: 3 }], 3);
    expect((await db.syncState.get('cursor'))?.v).toBe(5);
  });
});

describe('applyRemote', () => {
  it('在既有 transaction 內呼叫會丟錯，不會污染呼叫者的 transaction', async () => {
    const db = newClient('a');
    await expect(
      db.transaction('rw', [db.profiles, db.records, db.vaccineDoses, db.outbox, db.syncState], async () => {
        await applyRemote(db, [], 0);
      }),
    ).rejects.toThrow('applyRemote');
    await db.records.add(rec('r1')); // 之後的本機寫入照常進 outbox
    expect(await db.outbox.count()).toBe(1);
  });
});

/**
 * 伺服器依 clientNow 平移 updatedAt 之後，手機時鐘快慢不再影響結果：
 * 真實時間上較晚的操作一定贏，不管它來自快 10 分鐘或慢 10 分鐘的手機。
 * 世界時間 world 由測試推進；各手機的 Date.now() = world + 自己的誤差，伺服器用 world。
 */
describe('伺服器平移 updatedAt 後，快 10 分鐘與慢 10 分鐘的手機收斂', () => {
  const MIN10 = 600_000;
  const DOSE = `${P}|v1|d1`;
  let world = 0;
  let skew = 0;
  beforeEach(() => {
    world = 1_700_000_000_000;
    skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => world + skew);
  });
  const newServer = () => new Server(false, () => world);
  interface Phone { db: BabyDB; skew: number }
  const phone = (name: string, s: number): Phone => ({ db: newClient(name), skew: s });
  async function as<T>(p: Phone, fn: (db: BabyDB) => Promise<T>): Promise<T> {
    skew = p.skew;
    try {
      return await fn(p.db);
    } finally {
      skew = 0;
    }
  }
  const sync = (srv: Server, p: Phone) => as(p, (db) => syncOnce(db, srv.fetch));

  // 每種實體的建立／編輯／刪除／讀取；編輯值用數字，方便比較誰贏
  interface Kind {
    id: string;
    make: (db: BabyDB) => PromiseLike<unknown>;
    edit: (db: BabyDB, n: number) => PromiseLike<unknown>;
    del: (db: BabyDB) => PromiseLike<unknown>;
    read: (db: BabyDB) => Promise<number | undefined>;
  }
  const kinds: Record<string, Kind> = {
    record: {
      id: 'r1',
      make: (db: BabyDB) => db.records.add(rec('r1')),
      edit: (db: BabyDB, n: number) => db.records.update('r1', { note: String(n) }),
      del: (db: BabyDB) => db.records.delete('r1'),
      read: async (db: BabyDB) => { const x = await db.records.get('r1'); return x && Number(x.note); },
    },
    profile: {
      id: 'p1',
      make: (db: BabyDB) => db.profiles.add({ id: 'p1', name: '0', birthDate: 0 }),
      edit: (db: BabyDB, n: number) => db.profiles.update('p1', { name: String(n) }),
      del: (db: BabyDB) => db.profiles.delete('p1'),
      read: async (db: BabyDB) => { const x = await db.profiles.get('p1'); return x && Number(x.name); },
    },
    vaccineDose: {
      id: DOSE,
      make: (db: BabyDB) => db.vaccineDoses.add({ key: DOSE, babyId: P, vaccineId: 'v1', doseLabel: 'd1', date: 0 }),
      edit: (db: BabyDB, n: number) => db.vaccineDoses.update(DOSE, { date: n }),
      del: (db: BabyDB) => db.vaccineDoses.delete(DOSE),
      read: async (db: BabyDB) => (await db.vaccineDoses.get(DOSE))?.date,
    },
  };

  for (const [kind, k] of Object.entries(kinds)) {
    for (const [first, second] of [['edit', 'edit'], ['edit', 'delete'], ['delete', 'edit']] as const) {
      for (const [label, fastFirst] of [['先動的是快手機', true], ['先動的是慢手機', false]] as const) {
        it(`${kind}：${first}／${second}（${label}）→ 真實時間較晚的贏，雙方與伺服器一致`, async () => {
          const srv = newServer();
          const early = phone('early', fastFirst ? MIN10 : -MIN10);
          const late = phone('late', fastFirst ? -MIN10 : MIN10);
          await as(early, async (db) => void (await k.make(db)));
          await sync(srv, early);
          await sync(srv, late);

          world += 1000;
          await as(early, async (db) => void (await (first === 'edit' ? k.edit(db, 1) : k.del(db))));
          world += 1000;
          await as(late, async (db) => void (await (second === 'edit' ? k.edit(db, 2) : k.del(db))));
          for (const p of [early, late, early, late]) await sync(srv, p);

          const expected = second === 'delete' ? undefined : 2;
          expect(srv.rows.get(`${kind}/${k.id}`)!.deleted).toBe(second === 'delete');
          expect(await k.read(early.db)).toBe(expected);
          expect(await k.read(late.db)).toBe(expected);
          expect(await early.db.outbox.count()).toBe(0);
          expect(await late.db.outbox.count()).toBe(0);
        });
      }
    }
  }

  it('F23：快 10 分鐘的手機刪除已同步的記錄 → 伺服器收下墓碑，另一支手機也刪掉', async () => {
    const srv = newServer();
    const fast = phone('fast', MIN10);
    const slow = phone('slow', -MIN10);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await as(slow, (db) => db.records.add(rec('r1')));
    await sync(srv, slow);
    await sync(srv, fast);
    world += 1000;
    await as(fast, (db) => db.records.delete('r1'));
    expect(await sync(srv, fast)).toEqual({ skipped: 0, kept: 0 });
    await sync(srv, slow);
    expect(srv.rows.get('record/r1')!.deleted).toBe(true);
    expect(await slow.db.records.count()).toBe(0);
    expect(await fast.db.records.count()).toBe(0);
    expect(err).not.toHaveBeenCalled();
  });

  // 與 repository.deleteBabyCascade 同一組操作（那個函式綁定預設資料庫，測試用不了）
  const cascade = (db: BabyDB) =>
    db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
      await db.records.where('babyId').equals(P).delete();
      await db.vaccineDoses.where('babyId').equals(P).delete();
      await db.profiles.delete(P);
    });
  const all = async (db: BabyDB) => ({
    profiles: await db.profiles.toArray(),
    records: (await db.records.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    doses: (await db.vaccineDoses.toArray()).sort((a, b) => a.key.localeCompare(b.key)),
  });

  for (const [label, cascadeSkew, otherSkew] of [['刪除的是快手機', MIN10, -MIN10], ['刪除的是慢手機', -MIN10, MIN10]] as const) {
    for (const [when, editFirst] of [['另一支手機在刪除之前編輯', true], ['另一支手機在刪除之後編輯', false]] as const) {
      it(`刪寶寶連同全部記錄（${label}；${when}）→ 兩支手機相同`, async () => {
        const srv = newServer();
        const del = phone('del', cascadeSkew);
        const other = phone('other', otherSkew);
        await as(del, async (db) => {
          await db.profiles.add({ id: P, name: '小明', birthDate: 0 });
          await db.records.bulkAdd([rec('r1'), rec('r2'), rec('r3')]);
          await db.vaccineDoses.bulkAdd([
            { key: DOSE, babyId: P, vaccineId: 'v1', doseLabel: 'd1', date: 0 },
            { key: `${P}|v1|d2`, babyId: P, vaccineId: 'v1', doseLabel: 'd2', date: 0 },
          ]);
        });
        await sync(srv, del);
        await sync(srv, other);

        world += 1000;
        if (editFirst) await as(other, (db) => db.records.update('r2', { note: '編輯' }));
        world += 1000;
        await as(del, cascade);
        world += 1000;
        if (!editFirst) await as(other, (db) => db.records.update('r2', { note: '編輯' }));
        for (const p of [del, other, del, other]) await sync(srv, p);

        const a = await all(del.db);
        expect(await all(other.db)).toEqual(a);
        // 刪除較晚 → 全空；編輯較晚 → 只有那一筆編輯活下來，兩邊仍相同
        if (editFirst) expect(a).toEqual({ profiles: [], records: [], doses: [] });
        else expect(a.records.map((r) => r.id)).toEqual(['r2']);
        expect(await del.db.outbox.count()).toBe(0);
        expect(await other.db.outbox.count()).toBe(0);
      });
    }
  }
});

/**
 * 手機快 10 分鐘時編輯，同步前才把時鐘修正回來：updatedAt 是快的時鐘蓋的章，
 * 送出時的 skew 已是修正後的，不夾擠就會平移到伺服器的未來 10 分鐘，被拒收（invalid）。
 * 用會平移的假伺服器端到端驗證：夾擠之後三種實體、三種操作都要收斂，不能有任何一邊留著舊值。
 */
describe('快 10 分鐘的手機編輯後才修正時鐘', () => {
  const MIN10 = 600_000;
  let world = 0;
  let skew = 0;
  beforeEach(() => {
    world = 1_700_000_000_000;
    skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => world + skew);
  });
  const D = (n: number) => `${P}|v1|d${n}`;
  const byKey = (k: string) => (a: any, b: any) => a[k].localeCompare(b[k]);
  // 每種實體各三筆；edit／del 動第一筆，bulkDel 一次刪三筆，read 回傳目前全部的值
  const kinds = {
    record: {
      make: (db: BabyDB) => db.records.bulkAdd([rec('r1'), rec('r2'), rec('r3')]),
      edit: (db: BabyDB) => db.records.update('r1', { note: '改' }),
      del: (db: BabyDB) => db.records.delete('r1'),
      bulkDel: (db: BabyDB) => db.records.bulkDelete(['r1', 'r2', 'r3']),
      read: async (db: BabyDB) => (await db.records.toArray()).sort(byKey('id')),
    },
    profile: {
      make: (db: BabyDB) => db.profiles.bulkAdd([1, 2, 3].map((i) => ({ id: `p${i}`, name: '0', birthDate: 0 }))),
      edit: (db: BabyDB) => db.profiles.update('p1', { name: '改' }),
      del: (db: BabyDB) => db.profiles.delete('p1'),
      bulkDel: (db: BabyDB) => db.profiles.bulkDelete(['p1', 'p2', 'p3']),
      read: async (db: BabyDB) => (await db.profiles.toArray()).sort(byKey('id')),
    },
    vaccineDose: {
      make: (db: BabyDB) =>
        db.vaccineDoses.bulkAdd([1, 2, 3].map((i) => ({ key: D(i), babyId: P, vaccineId: 'v1', doseLabel: `d${i}`, date: 0 }))),
      edit: (db: BabyDB) => db.vaccineDoses.update(D(1), { date: 99 }),
      del: (db: BabyDB) => db.vaccineDoses.delete(D(1)),
      bulkDel: (db: BabyDB) => db.vaccineDoses.bulkDelete([D(1), D(2), D(3)]),
      read: async (db: BabyDB) => (await db.vaccineDoses.toArray()).sort(byKey('key')),
    },
  };

  for (const [kind, k] of Object.entries(kinds)) {
    for (const op of ['edit', 'del', 'bulkDel'] as const) {
      it(`${kind}：${op}（快 10 分鐘時做、1 分鐘後修正時鐘才同步）→ 沒有 invalid，雙方與伺服器一致`, async () => {
        const srv = new Server(true, () => world);
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fast = newClient('fast');
        const other = newClient('other');
        await k.make(fast);
        await syncOnce(fast, srv.fetch);
        await syncOnce(other, srv.fetch);
        const before = await k.read(other);

        world += 1000;
        skew = MIN10; // 這支手機快 10 分鐘
        await k[op](fast);
        skew = 0; // 使用者把時鐘修正回來
        world += 60_000;
        for (const db of [fast, other, fast, other]) await syncOnce(db, srv.fetch);

        const a = await k.read(fast);
        expect(a).not.toEqual(before); // 這次操作確實生效，沒被丟掉
        expect(await k.read(other)).toEqual(a);
        expect(await fast.outbox.count()).toBe(0);
        expect(await other.outbox.count()).toBe(0);
        expect(err).not.toHaveBeenCalled(); // 沒有任何一筆被伺服器以 invalid 拒收
      });
    }
  }
});
