import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { BabyDB, db } from '../src/db/db';
import { allData, deleteBabyCascade, importMerge, saveFoodRecord, setFoodMarks } from '../src/db/repository';
import { decodeAny, encodeV2, mergeBabies, type BackupPayloadV2 } from '../src/logic/dataTransfer';
import { foodMarkKey, makeFoodMark, type FoodRecord } from '../src/logic/foodLog';
import { syncOnce, type ServerChange, type SyncResponse } from '../src/sync/sync';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

const food = (id: string, babyId: string, extra: Partial<FoodRecord> = {}): FoodRecord => ({
  id, babyId, timestamp: Date.UTC(2026, 9, 1, 4), foods: ['米湯'], firstFoods: ['米湯'], reactions: [], ...extra,
});

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const newClient = (name: string) => new BabyDB(name, { indexedDB: new IDBFactory(), IDBKeyRange });

describe('備份檔', () => {
  const base: BackupPayloadV2 = {
    profiles: [{ id: A, name: '小明', birthDate: Date.UTC(2026, 3, 1) }],
    records: [],
  };

  it('沒用副食品時，匯出與沒有這兩個欄位時逐字節相同', () => {
    expect(encodeV2({ ...base, foodRecords: [], foodMarks: [] })).toBe(encodeV2(base));
    expect(JSON.parse(encodeV2(base))).not.toHaveProperty('foodRecords');
  });

  it('副食品紀錄與試敏標記 round-trip；標記的 key 不寫進檔案', () => {
    const p: BackupPayloadV2 = {
      ...base,
      vaccineDoses: [],
      foodRecords: [food('f1', A, { amount: { value: 2, unit: '匙' }, reactions: ['紅疹'], note: '吐了一點' })],
      foodMarks: [makeFoodMark(A, '香蕉', 'reaction')],
    };
    const text = encodeV2(p);
    expect(JSON.parse(text).foodMarks).toEqual([{ babyId: A, food: '香蕉', status: 'reaction' }]);
    expect(decodeAny(text)).toEqual(p);
  });

  it('副食品資料不合法 → 整檔拒絕', () => {
    const wire = JSON.parse(encodeV2({ ...base, foodRecords: [food('f1', A)] }));
    wire.foodRecords[0].foods = [];
    expect(() => decodeAny(JSON.stringify(wire))).toThrow('第 1 筆副食品紀錄');
  });

  it('合併：本機優先，寶寶 id 重對映時紀錄與標記 key 跟著改', () => {
    const local: BackupPayloadV2 = {
      profiles: [{ id: A, name: '小明', birthDate: 0 }],
      records: [],
      foodRecords: [food('f1', A, { note: '本機' })],
      foodMarks: [makeFoodMark(A, '米湯', 'tried')],
    };
    const incoming: BackupPayloadV2 = {
      profiles: [{ id: B, name: '小明', birthDate: 0 }],
      records: [],
      foodRecords: [food('f1', B, { note: '匯入' }), food('f2', B)],
      foodMarks: [makeFoodMark(B, '米湯', 'reaction'), makeFoodMark(B, '香蕉', 'reaction')],
    };
    const r = mergeBabies(local, incoming);
    expect(r.foodRecords!.map((x) => [x.id, x.babyId, x.note])).toEqual([
      ['f1', A, '本機'],
      ['f2', A, undefined],
    ]);
    expect(r.foodMarks).toEqual([makeFoodMark(A, '米湯', 'tried'), makeFoodMark(A, '香蕉', 'reaction')]);
  });
});

describe('repository', () => {
  beforeEach(async () => {
    await Promise.all([db.profiles.clear(), db.foodRecords.clear(), db.foodMarks.clear(), db.outbox.clear()]);
  });

  it('刪除寶寶一併刪掉它的副食品紀錄與標記，其他寶寶的不動', async () => {
    await db.profiles.bulkAdd([{ id: A, name: 'A', birthDate: 0 }, { id: B, name: 'B', birthDate: 0 }]);
    await saveFoodRecord(food('f1', A));
    await saveFoodRecord(food('f2', B));
    await setFoodMarks(A, ['香蕉'], 'reaction');
    await setFoodMarks(B, ['香蕉'], 'tried');
    await deleteBabyCascade(A);
    expect((await db.foodRecords.toArray()).map((r) => r.id)).toEqual(['f2']);
    expect((await db.foodMarks.toArray()).map((m) => m.key)).toEqual([foodMarkKey(B, '香蕉')]);
  });

  it('副食品的寫入會進 outbox', async () => {
    await saveFoodRecord(food('f1', A));
    await setFoodMarks(A, ['米湯', '香蕉'], 'reaction');
    const rows = await db.outbox.toArray();
    expect(rows.map((r) => `${r.kind}/${r.id}`).sort()).toEqual([
      `foodMark/${A}|米湯`, `foodMark/${A}|香蕉`, 'foodRecord/f1',
    ]);
  });

  it('匯出、匯入含副食品', async () => {
    await db.profiles.add({ id: A, name: 'A', birthDate: 0 });
    await saveFoodRecord(food('f1', A));
    const exported = await allData();
    await db.foodRecords.clear();
    await importMerge(exported);
    expect((await db.foodRecords.toArray()).map((r) => r.id)).toEqual(['f1']);
  });
});

describe('同步', () => {
  it('請求帶上認得的種類，副食品資料會上傳', async () => {
    const c = newClient('kinds');
    await c.foodRecords.add(food('f1', A));
    const bodies: any[] = [];
    await syncOnce(c, async (_u, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return json({ cursor: 0, changes: [], results: [{ kind: 'foodRecord', id: 'f1', applied: true }] });
    });
    expect(bodies[0].kinds).toEqual(['profile', 'record', 'vaccineDose', 'foodRecord', 'foodMark']);
    expect(bodies[0].changes.map((x: any) => x.kind)).toEqual(['foodRecord']);
  });

  it('拉回來的副食品資料寫進對應的表；不認得的種類略過，不會寫進接種紀錄', async () => {
    const c = newClient('apply');
    const changes: ServerChange[] = [
      { kind: 'foodRecord', id: 'f1', deleted: false, data: food('f1', A), updatedAt: 1, seq: 1 },
      { kind: 'foodMark', id: foodMarkKey(A, '香蕉'), deleted: false, data: makeFoodMark(A, '香蕉', 'reaction'), updatedAt: 1, seq: 2 },
      { kind: 'future' as any, id: 'x', deleted: false, data: { key: 'x' } as any, updatedAt: 1, seq: 3 },
    ];
    await syncOnce(c, async () => json({ cursor: 3, changes, results: [] } satisfies SyncResponse));
    expect(await c.foodRecords.count()).toBe(1);
    expect(await c.foodMarks.count()).toBe(1);
    expect(await c.vaccineDoses.count()).toBe(0);
    expect((await c.syncState.get('cursor'))?.v).toBe(3);
  });

  it('升級後第一次同步從 0 重拉一次，之後照常用存著的游標', async () => {
    const c = newClient('reset');
    await c.syncState.put({ k: 'cursor', v: 42 }); // 舊版留下的游標，沒有 kindsVersion
    const cursors: number[] = [];
    const fetchFn: typeof fetch = async (_u, init) => {
      cursors.push(JSON.parse(init!.body as string).cursor);
      return json({ cursor: 50, changes: [{ kind: 'record', id: 'r1', deleted: true, updatedAt: 1, seq: 50 }], results: [] });
    };
    await syncOnce(c, fetchFn);
    await syncOnce(c, fetchFn);
    expect(cursors).toEqual([0, 50]);
  });
});
