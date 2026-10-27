import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BabyDB } from '../src/db/db';
import { syncOnce, type ServerChange, type SyncRequest, type SyncResponse } from '../src/sync/sync';
import type { RecordData } from '../src/logic/types';

const P = 'aaaaaaaa-0000-0000-0000-000000000001';
const rec = (id: string, extra: Partial<RecordData> = {}): RecordData => ({
  id, babyId: P, timestamp: 1_700_000_000_000, hasUrine: false, ...extra,
});
const newClient = (name: string) => new BabyDB(name, { indexedDB: new IDBFactory(), IDBKeyRange });

/**
 * 假伺服器：refuse 裡的 id 一律回 invalid（永遠寫不進去）；其餘照 LWW 寫入。
 * batch 限制每次回傳的 changes 筆數，超過就帶 more，cursor 照契約等於這批最大 seq。
 * requests 記錄請求次數；remote() 模擬另一支手機直接把東西寫進伺服器。
 */
class Server {
  constructor(private batch = 1000, private refuse = new Set<string>()) {}
  rows = new Map<string, ServerChange>();
  seq = 0;
  requests = 0;
  remote(id: string, extra: Partial<RecordData> = {}, updatedAt = Date.now()) {
    this.rows.set(`record/${id}`, {
      kind: 'record', id, deleted: false, data: rec(id, extra), updatedAt, seq: ++this.seq,
    });
  }
  fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.requests++;
    const req = JSON.parse(init!.body as string) as SyncRequest;
    const results = req.changes.map((c) => {
      if (this.refuse.has(c.id)) return { kind: c.kind, id: c.id, applied: false, reason: 'invalid' as const };
      this.rows.set(`${c.kind}/${c.id}`, {
        kind: c.kind, id: c.id, deleted: c.op === 'delete', data: c.data, updatedAt: c.updatedAt, seq: ++this.seq,
      });
      return { kind: c.kind, id: c.id, applied: true };
    });
    const all = [...this.rows.values()].filter((r) => r.seq > req.cursor).sort((a, b) => a.seq - b.seq);
    const changes = all.slice(0, this.batch);
    const out: SyncResponse = {
      cursor: changes.length ? changes[changes.length - 1].seq : req.cursor,
      changes,
      results,
      more: all.length > changes.length,
    };
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  };
}

afterEach(() => vi.restoreAllMocks());

describe('被拒收而留著的列，其實體在伺服器上也有更新：不能空轉到 MAX_ROUNDS', () => {
  it('每次嘗試的請求數都是小的有界值；別的實體照常雙向流動', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const srv = new Server(1000, new Set(['bad']));
    const a = newClient('a');
    await a.records.add(rec('bad', { note: '本機' }));
    srv.remote('bad', { note: '另一支手機' }); // seq 1，在 A 的 cursor 之上，而 A 有待送的 bad → 會被略過

    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      srv.requests = 0;
      expect(await syncOnce(a, srv.fetch)).toEqual({ skipped: 1, kept: 1 });
      counts.push(srv.requests);
    }
    expect(counts).toEqual([1, 1, 1]);

    // 停擺之後，別的實體照常流動
    await a.records.add(rec('ok-local'));
    srv.remote('ok-remote');
    srv.requests = 0;
    await syncOnce(a, srv.fetch);
    expect(srv.requests).toBeLessThanOrEqual(3);
    expect(srv.rows.get('record/ok-local')?.data).toBeTruthy(); // 送得上去
    expect(await a.records.get('ok-remote')).toBeTruthy(); // 收得下來

    // 之後每次嘗試仍有界，那一筆維持本機版本、列還在
    srv.requests = 0;
    await syncOnce(a, srv.fetch);
    expect(srv.requests).toBeLessThanOrEqual(2);
    expect((await a.records.get('bad'))?.note).toBe('本機');
    expect(await a.outbox.count()).toBe(1);
  });
});

describe('進展護欄：真的有做事才繼續', () => {
  it('一輪確實套用了好幾批遠端變更 → 一路拉到沒有為止', async () => {
    const srv = new Server(2);
    for (let i = 0; i < 5; i++) srv.remote(`r${i}`);
    const a = newClient('a');
    await syncOnce(a, srv.fetch);
    expect(srv.requests).toBe(3);
    expect(await a.records.count()).toBe(5);
  });

  it('列被確認（acked）即使遠端變更全被略過 → 仍繼續到沒有東西為止', async () => {
    const srv = new Server(1);
    const a = newClient('a');
    await a.records.add(rec('x'));
    srv.remote('x'); // 全被略過，但 x 這一輪送出後被確認
    srv.remote('y');
    await syncOnce(a, srv.fetch);
    expect(await a.outbox.count()).toBe(0);
    expect(await a.records.get('y')).toBeTruthy();
  });

  it('什麼都沒做（沒刪列、沒套用、沒寫入）→ 一次請求就停', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const srv = new Server(1000, new Set(['bad']));
    const a = newClient('a');
    await a.records.add(rec('bad'));
    await syncOnce(a, srv.fetch);
    expect(srv.requests).toBe(1);
  });
});

describe('lastSync 只在有進展時寫入', () => {
  it('只剩被拒收的列、沒有進展 → 不寫；有進展 → 寫', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const srv = new Server(1000, new Set(['bad']));
    const a = newClient('a');
    await a.records.add(rec('bad'));
    await syncOnce(a, srv.fetch);
    expect(await a.syncState.get('lastSync')).toBeUndefined();
    await syncOnce(a, srv.fetch);
    expect(await a.syncState.get('lastSync')).toBeUndefined();

    await a.records.add(rec('ok'));
    await syncOnce(a, srv.fetch); // ok 被確認
    expect((await a.syncState.get('lastSync'))?.v).toBeGreaterThan(0);
  });
});
