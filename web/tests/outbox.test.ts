import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { skipOutboxInCurrentTransaction } from '../src/db/outboxMiddleware';
import { deleteBabyCascade, importMerge, setVaccineDose } from '../src/db/repository';
import { applyRemote } from '../src/sync/sync';
import type { ProfileData, RecordData } from '../src/logic/types';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const baby = (id: string, name: string): ProfileData => ({ id, name, birthDate: 0 });
const rec = (id: string, babyId: string, ts = 1): RecordData => ({ id, babyId, timestamp: ts, hasUrine: false });
const outbox = () => db.outbox.orderBy('seq').toArray();
const remoteRec = (id: string, seq: number) => ({
  kind: 'record' as const, id, deleted: false, data: rec(id, A), updatedAt: 1, seq,
});

beforeEach(async () => {
  await db.profiles.clear();
  await db.records.clear();
  await db.vaccineDoses.clear();
  await db.outbox.clear();
  await db.syncState.clear();
});

describe('outbox middleware', () => {
  it('bulkPut：每一筆各記一列 put，帶各自的完整資料', async () => {
    await db.records.bulkPut([rec('r1', A, 1), rec('r2', A, 2), rec('r3', A, 3)]);
    expect(await outbox()).toMatchObject([
      { kind: 'record', id: 'r1', op: 'put', data: rec('r1', A, 1) },
      { kind: 'record', id: 'r2', op: 'put', data: rec('r2', A, 2) },
      { kind: 'record', id: 'r3', op: 'put', data: rec('r3', A, 3) },
    ]);
  });

  it('Collection.modify：只為被改到的每一列各記一列 put，資料是修改後的', async () => {
    await db.records.bulkAdd([rec('r1', A, 1), rec('r2', A, 2), rec('r3', A, 3)]);
    await db.outbox.clear();
    await db.records.where('timestamp').belowOrEqual(2).modify({ note: '改' });
    const rows = await outbox();
    expect(rows).toHaveLength(2);
    expect(rows).toMatchObject([
      { kind: 'record', id: 'r1', op: 'put', data: { ...rec('r1', A, 1), note: '改' } },
      { kind: 'record', id: 'r2', op: 'put', data: { ...rec('r2', A, 2), note: '改' } },
    ]);
  });

  it('add：記一筆 put，帶完整資料', async () => {
    await db.records.add(rec('r1', A));
    expect(await outbox()).toMatchObject([{ kind: 'record', id: 'r1', op: 'put', data: rec('r1', A) }]);
  });

  it('put：記一筆 put', async () => {
    await db.profiles.put(baby(A, '小明'));
    expect(await outbox()).toMatchObject([{ kind: 'profile', id: A, op: 'put', data: baby(A, '小明') }]);
  });

  it('update：記 put，資料是更新後的完整列', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.profiles.update(A, { name: '小美', sex: undefined });
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ op: 'put', data: { id: A, name: '小美', birthDate: 0 } });
  });

  it('delete：記一筆 delete，沒有 data', async () => {
    await db.records.add(rec('r1', A));
    await db.records.delete('r1');
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'record', id: 'r1', op: 'delete' });
    expect(rows[0].data).toBeUndefined();
  });

  it('where().delete()：每一筆被刪的列都記 delete', async () => {
    await db.records.bulkAdd([rec('r1', A), rec('r2', A), rec('r3', 'other')]);
    await db.outbox.clear();
    await db.records.where('babyId').equals(A).delete();
    expect((await outbox()).map((r) => [r.id, r.op])).toEqual([['r1', 'delete'], ['r2', 'delete']]);
  });

  it('bulkAdd / bulkDelete', async () => {
    await db.records.bulkAdd([rec('r1', A), rec('r2', A)]);
    expect((await outbox()).map((r) => [r.id, r.op])).toEqual([['r1', 'put'], ['r2', 'put']]);
    await db.records.bulkDelete(['r1', 'r2']);
    expect((await outbox()).map((r) => [r.id, r.op])).toEqual([['r1', 'delete'], ['r2', 'delete']]);
  });

  it('主鍵範圍刪除（clear 走 deleteRange）：每一列都記 delete', async () => {
    await db.records.bulkAdd([rec('r1', A), rec('r2', A)]);
    await db.outbox.clear();
    await db.records.clear();
    expect((await outbox()).map((r) => [r.id, r.op])).toEqual([['r1', 'delete'], ['r2', 'delete']]);
  });

  it('資料與 outbox 在同一個 transaction：失敗時一起回滾', async () => {
    await expect(
      db.transaction('rw', db.records, async () => {
        await db.records.add(rec('r1', A));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.records.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('同一個實體只留最新一筆，seq 遞增', async () => {
    await db.records.add(rec('r1', A));
    await db.records.add(rec('r2', A));
    const before = (await db.outbox.get(['record', 'r1']))!.seq;
    await db.records.put({ ...rec('r1', A), note: 'x' });
    await db.records.delete('r2');
    const rows = await outbox();
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(rows[0].seq).toBeGreaterThan(before);
    expect(rows[0].seq).toBeLessThan(rows[1].seq);
    expect(rows[0].data).toMatchObject({ note: 'x' });
    expect(rows[1].op).toBe('delete');
  });

  it('deleteBabyCascade：寶寶、其記錄、其接種紀錄各一筆 delete', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.records.bulkAdd([rec('r1', A), rec('r2', A)]);
    await setVaccineDose(A, 'hepb', '第一劑', 0);
    await db.outbox.clear();
    await deleteBabyCascade(A);
    const rows = await outbox();
    expect(rows.every((r) => r.op === 'delete')).toBe(true);
    expect(rows.map((r) => `${r.kind}:${r.id}`).sort()).toEqual(
      [`profile:${A}`, 'record:r1', 'record:r2', `vaccineDose:${A}|hepb|第一劑`].sort(),
    );
  });

  it('importMerge：只為新增的列記 put，本機既有的列不動', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.records.add(rec('r1', A));
    await db.outbox.clear();
    await importMerge({ profiles: [baby(A, '小明')], records: [rec('r1', A), rec('r2', A)] });
    expect((await outbox()).map((r) => `${r.kind}:${r.id}`)).toEqual(['record:r2']);
  });
});

describe('applyRemote', () => {
  it('寫入與刪除資料，但不產生 outbox 列', async () => {
    await db.records.add(rec('gone', A));
    await db.outbox.clear();
    await applyRemote(db, [remoteRec('r1', 1), { kind: 'record', id: 'gone', deleted: true, updatedAt: 1, seq: 2 }], 2);
    expect((await db.records.toArray()).map((r) => r.id)).toEqual(['r1']);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.syncState.get('cursor'))?.v).toBe(2);
  });

  it('套用途中穿插的本機寫入，outbox 列保留（標記是每個 transaction 各自的，不是全域旗標）', async () => {
    // 先讓一個「套用遠端」的 transaction 卡在中途，再在它進行時發起本機寫入
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const applying = db.transaction('rw', [db.records, db.outbox, db.syncState], async () => {
      skipOutboxInCurrentTransaction();
      await db.records.put(rec('remote', A));
      await gate;
      await db.records.put(rec('remote-2', A));
    });
    const local = db.records.put(rec('local', A));
    release();
    await Promise.all([applying, local]);

    // 再用真正的 applyRemote 與本機寫入同時發起
    await Promise.all([applyRemote(db, [remoteRec('remote-3', 1)], 1), db.records.put(rec('local-2', A))]);

    expect((await outbox()).map((r) => r.id).sort()).toEqual(['local', 'local-2']);
    expect(await db.records.count()).toBe(5);
  });

  it('本機有待上傳的變更時，同一個實體的遠端變更被略過', async () => {
    await db.records.put({ ...rec('r1', A), note: '本機' });
    await applyRemote(db, [{ ...remoteRec('r1', 1), data: { ...rec('r1', A), note: '遠端' } }], 1);
    expect((await db.records.get('r1'))?.note).toBe('本機');
    expect(await db.outbox.get(['record', 'r1'])).toBeTruthy();
  });
});
