import { describe, expect, it } from 'vitest';
import { decodeAny, mergeBabies } from '../src/logic/dataTransfer';
import type { RecordData } from '../src/logic/types';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

function rec(id: string, babyId: string, ts: number, feed?: number): RecordData {
  return { id, babyId, timestamp: ts, hasUrine: false, ...(feed !== undefined ? { feedAmount: feed } : {}) };
}

describe('mergeBabies', () => {
  it('同 id 寶寶 → 保留本機名字', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '同id', birthDate: 0 }], records: [] },
      { profiles: [{ id: A, name: '改過名', birthDate: 0 }], records: [rec('r1', A, 1)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0].name).toBe('同id');
    expect(r.records).toHaveLength(1);
  });

  it('不同 id 同名 → 不新增寶寶、babyId 重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [] },
      { profiles: [{ id: B, name: '小明', birthDate: 50 }], records: [rec('r1', B, 1000, 60)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.records[0].babyId).toBe(A);
  });

  it('全新寶寶 → 新增且不重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [] },
      { profiles: [{ id: B, name: '小美', birthDate: 99 }], records: [rec('r1', B, 1000)] },
    );
    expect(r.profiles).toHaveLength(2);
    expect(r.records[0].babyId).toBe(B);
  });

  it('記錄同 id 去重、本機優先', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('dup', A, 1000, 100)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('dup', A, 1000, 999)] },
    );
    expect(r.records).toHaveLength(1);
    expect(r.records[0].feedAmount).toBe(100);
  });

  it('結果依 timestamp 排序', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('r2', A, 2000)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('r1', A, 1000)] },
    );
    expect(r.records.map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  it('同檔兩個同名新寶寶 → 都新增、各自保留 babyId（鏡射 iOS：只對原始 local 比對）', () => {
    const r = mergeBabies(
      { profiles: [], records: [] },
      {
        profiles: [
          { id: A, name: '小明', birthDate: 0 },
          { id: B, name: '小明', birthDate: 50 },
        ],
        records: [rec('r1', A, 1000), rec('r2', B, 2000)],
      },
    );
    expect(r.profiles).toHaveLength(2);
    expect(r.records.map((x) => x.babyId)).toEqual([A, B]);
  });

  it('iOS 大寫 id 與本機小寫 id 視為同一筆（去重、id 對中）', () => {
    const R = 'dddddddd-0000-0000-0000-000000000003';
    const local = {
      profiles: [{ id: A, name: '小明', birthDate: 0 }],
      records: [rec(R, A, 1000, 100)],
    };
    // 模擬 iOS 重新匯出：同一份資料，id 一律大寫（Swift JSONEncoder 行為）
    const incomingRaw = JSON.stringify({
      version: 2,
      profiles: [{ id: A.toUpperCase(), name: '改過名', birthDate: '1970-01-01T00:00:00Z' }],
      records: [
        {
          id: R.toUpperCase(),
          babyId: A.toUpperCase(),
          timestamp: '1970-01-01T00:00:01Z',
          feedAmount: 999,
          hasUrine: false,
        },
      ],
    });
    const incoming = decodeAny(incomingRaw);

    const r = mergeBabies(local, incoming);

    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0].name).toBe('小明'); // 本機優先
    expect(r.records).toHaveLength(1);
    expect(r.records[0].feedAmount).toBe(100); // 本機優先，未產生重複記錄
  });
});

describe('mergeBabies 的接種紀錄', () => {
  const d = (babyId: string, vaccineId: string, label: string, date: number) => ({
    key: `${babyId.toLowerCase()}|${vaccineId}|${label}`,
    babyId: babyId.toLowerCase(), vaccineId, doseLabel: label, date,
  });
  const mar15 = new Date(2026, 2, 15).getTime();
  const mar20 = new Date(2026, 2, 20).getTime();

  it('同一劑重複時本機優先', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(A, 'hepb', '第一劑', mar15)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(A, 'hepb', '第一劑', mar20)] },
    );
    expect(r.vaccineDoses).toHaveLength(1);
    expect(r.vaccineDoses![0].date).toBe(mar15);
  });

  it('不同劑次各留一筆，依 key 排序', () => {
    const r = mergeBabies(
      { profiles: [], records: [], vaccineDoses: [d(A, 'hepb', '第二劑', mar20)] },
      { profiles: [], records: [], vaccineDoses: [d(A, 'hepb', '第一劑', mar15)] },
    );
    expect(r.vaccineDoses!.map((x) => x.doseLabel)).toEqual(['第一劑', '第二劑']);
  });

  it('寶寶用名字對中時，接種紀錄的 babyId 一起重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [], vaccineDoses: [] },
      { profiles: [{ id: B, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(B, 'hepb', '第一劑', mar15)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.vaccineDoses![0].babyId).toBe(A);
    expect(r.vaccineDoses![0].key).toBe(`${A}|hepb|第一劑`);
  });

  it('兩邊都沒有接種紀錄時回傳空陣列', () => {
    const r = mergeBabies({ profiles: [], records: [] }, { profiles: [], records: [] });
    expect(r.vaccineDoses).toEqual([]);
  });
});
