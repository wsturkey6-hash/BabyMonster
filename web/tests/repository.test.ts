import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import {
  allData,
  clearVaccineDose,
  createDefaultBaby,
  deleteBabyCascade,
  importMerge,
  resolveCurrentBaby,
  setVaccineDose,
} from '../src/db/repository';
import { doseRecordKey } from '../src/logic/vaccineLog';
import type { ProfileData, RecordData } from '../src/logic/types';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

const baby = (id: string, name: string): ProfileData => ({ id, name, birthDate: 0 });
const rec = (id: string, babyId: string, ts: number): RecordData => ({
  id, babyId, timestamp: ts, hasUrine: false,
});

beforeEach(async () => {
  await db.profiles.clear();
  await db.records.clear();
  await db.vaccineDoses.clear();
});

describe('importMerge', () => {
  it('空庫匯入 → 全數寫入', async () => {
    await importMerge({ profiles: [baby(A, '小明')], records: [rec('r1', A, 1000)] });
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.records).toHaveLength(1);
  });

  it('重複 id 本機優先、同名寶寶重對映（走 mergeBabies）', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.records.add({ ...rec('dup', A, 1000), feedAmount: 100 });
    await importMerge({
      profiles: [baby(B, '小明')],
      records: [{ ...rec('dup', B, 1000), feedAmount: 999 }, rec('r2', B, 2000)],
    });
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.records).toHaveLength(2);
    expect(d.records.find((r) => r.id === 'dup')?.feedAmount).toBe(100);
    expect(d.records.find((r) => r.id === 'r2')?.babyId).toBe(A);
  });

  it('匯入失敗 → 回滾，現有資料不動', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.records.add(rec('r1', A, 1000));
    // 同 id、不同名字的兩個 profile 會通過 mergeBabies（比對僅針對原始 local，鏡射 iOS），
    // 在 transaction 內 clear 之後的 profiles.bulkAdd 觸發 ConstraintError → 全回滾
    const dupProfiles = [baby(B, '小美'), { ...baby(B, '小強') }];
    await expect(importMerge({ profiles: dupProfiles, records: [] })).rejects.toThrow();
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.profiles[0].name).toBe('小明');
    expect(d.records).toHaveLength(1);
  });

  it('incoming 內部重複 record id → 由 mergeBabies 去重，匯入成功存 1 筆', async () => {
    await importMerge({
      profiles: [baby(A, '小明')],
      records: [rec('same', A, 1), rec('same', A, 2)],
    });
    const d = await allData();
    expect(d.records).toHaveLength(1);
  });
});

describe('deleteBabyCascade', () => {
  it('刪寶寶連動刪其全部記錄，不動別的寶寶', async () => {
    await db.profiles.bulkAdd([baby(A, '小明'), baby(B, '小美')]);
    await db.records.bulkAdd([rec('r1', A, 1), rec('r2', A, 2), rec('r3', B, 3)]);
    await deleteBabyCascade(A);
    const d = await allData();
    expect(d.profiles.map((p) => p.id)).toEqual([B]);
    expect(d.records.map((r) => r.id)).toEqual(['r3']);
  });
});

describe('createDefaultBaby', () => {
  it('建立預設寶寶 BabyMonster、生日為今天 00:00', async () => {
    const b = await createDefaultBaby();
    expect(b.name).toBe('BabyMonster');
    const t = new Date();
    expect(b.birthDate).toBe(new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime());
    expect(await db.profiles.get(b.id)).toBeTruthy();
  });
});

describe('resolveCurrentBaby（純函式）', () => {
  const list = [baby(A, '小明'), baby(B, '小美')];
  it('存的 id 找得到 → 該寶寶', () => {
    expect(resolveCurrentBaby(list, B)?.id).toBe(B);
  });
  it('找不到或 null → 退回第一個', () => {
    expect(resolveCurrentBaby(list, 'nope')?.id).toBe(A);
    expect(resolveCurrentBaby(list, null)?.id).toBe(A);
  });
  it('沒有寶寶 → null', () => {
    expect(resolveCurrentBaby([], A)).toBeNull();
  });
});

describe('接種紀錄', () => {
  const march15 = new Date(2026, 2, 15).getTime();

  it('setVaccineDose 寫入一筆，key 由 babyId|vaccineId|劑次 組成', async () => {
    await setVaccineDose(A, 'dtap-hib-ipv', '第一劑', march15);
    const all = await db.vaccineDoses.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe(doseRecordKey(A, 'dtap-hib-ipv', '第一劑'));
    expect(all[0].date).toBe(march15);
  });

  it('同一劑重複寫入是覆蓋而不是新增一筆', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await setVaccineDose(A, 'hepb', '第一劑', new Date(2026, 2, 20).getTime());
    const all = await db.vaccineDoses.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe(new Date(2026, 2, 20).getTime());
  });

  it('clearVaccineDose 刪掉該劑', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await clearVaccineDose(A, 'hepb', '第一劑');
    expect(await db.vaccineDoses.count()).toBe(0);
  });

  it('allData 會帶出接種紀錄', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    const d = await allData();
    expect(d.vaccineDoses).toHaveLength(1);
  });

  it('刪寶寶會連帶刪掉它的接種紀錄，別的寶寶不受影響', async () => {
    await db.profiles.bulkAdd([baby(A, '小明'), baby(B, '小華')]);
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await setVaccineDose(B, 'hepb', '第一劑', march15);
    await deleteBabyCascade(A);
    const left = await db.vaccineDoses.toArray();
    expect(left.map((d) => d.babyId)).toEqual([B]);
  });
});
