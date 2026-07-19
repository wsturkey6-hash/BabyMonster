import { describe, expect, it } from 'vitest';
import { mergeBabies } from '../src/logic/dataTransfer';
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
});
