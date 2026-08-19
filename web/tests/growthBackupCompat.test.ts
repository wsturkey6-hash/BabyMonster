import { describe, expect, it } from 'vitest';
import { decodeAny, encodeV2 } from '../src/logic/dataTransfer';
import type { BackupPayloadV2 } from '../src/logic/dataTransfer';

const P1 = '11111111-1111-1111-1111-111111111111';
const R1 = '22222222-2222-2222-2222-222222222222';

const base = (): BackupPayloadV2 => ({
  profiles: [{ id: P1, name: '小明', birthDate: Date.UTC(2025, 8, 1) }],
  records: [
    {
      id: R1,
      babyId: P1,
      timestamp: Date.UTC(2026, 0, 15, 2, 0),
      hasUrine: false,
      weight: 7250,
    },
  ],
});

describe('備份檔：版本維持 2', () => {
  it('加了新欄位仍然是 version 2（舊版 App 才不會整檔拒絕）', () => {
    const p = base();
    p.profiles[0].sex = 'male';
    p.records[0].height = 68.5;
    p.records[0].headCircumference = 44.2;
    expect(JSON.parse(encodeV2(p)).version).toBe(2);
  });
});

describe('備份檔：新欄位往返', () => {
  it('sex / height / headCircumference 完整往返', () => {
    const p = base();
    p.profiles[0].sex = 'female';
    p.records[0].height = 68.5;
    p.records[0].headCircumference = 44.2;

    const back = decodeAny(encodeV2(p));
    expect(back.profiles[0].sex).toBe('female');
    expect(back.records[0].height).toBe(68.5);
    expect(back.records[0].headCircumference).toBe(44.2);
    expect(back.records[0].weight).toBe(7250);
  });

  it('沒用到新功能時，輸出與舊版逐字節相同（不冒出空鍵）', () => {
    const json = JSON.parse(encodeV2(base()));
    expect('sex' in json.profiles[0]).toBe(false);
    expect('height' in json.records[0]).toBe(false);
    expect('headCircumference' in json.records[0]).toBe(false);
  });

  it('小數點後一位的身高頭圍不會被截斷', () => {
    const p = base();
    p.records[0].height = 68.3;
    p.records[0].headCircumference = 41.7;
    const back = decodeAny(encodeV2(p));
    expect(back.records[0].height).toBe(68.3);
    expect(back.records[0].headCircumference).toBe(41.7);
  });
});

describe('備份檔：讀舊檔（缺欄位）', () => {
  it('舊版匯出的檔案缺這三個欄位 → 解出來是 undefined，不報錯', () => {
    const old = JSON.stringify({
      version: 2,
      profiles: [{ id: P1, name: '小明', birthDate: '2025-09-01T00:00:00Z' }],
      records: [{ id: R1, babyId: P1, timestamp: '2026-01-15T02:00:00Z', hasUrine: false, weight: 7250 }],
    });
    const back = decodeAny(old);
    expect(back.profiles[0].sex).toBeUndefined();
    expect(back.records[0].height).toBeUndefined();
    expect(back.records[0].headCircumference).toBeUndefined();
    expect(back.records[0].weight).toBe(7250);
  });

  it('null 值等同缺欄位', () => {
    const withNulls = JSON.stringify({
      version: 2,
      profiles: [{ id: P1, name: '小明', birthDate: '2025-09-01T00:00:00Z', sex: null }],
      records: [
        {
          id: R1, babyId: P1, timestamp: '2026-01-15T02:00:00Z', hasUrine: false,
          height: null, headCircumference: null,
        },
      ],
    });
    const back = decodeAny(withNulls);
    expect(back.profiles[0].sex).toBeUndefined();
    expect(back.records[0].height).toBeUndefined();
  });

  it('v1 舊檔（單寶寶）照樣讀得進來', () => {
    const v1 = JSON.stringify({
      profile: { name: '小明', birthDate: '2025-09-01T00:00:00Z' },
      records: [{ id: R1, timestamp: '2026-01-15T02:00:00Z', hasUrine: false }],
    });
    const back = decodeAny(v1);
    expect(back.profiles[0].sex).toBeUndefined();
    expect(back.records).toHaveLength(1);
  });
});

describe('備份檔：新欄位的驗證', () => {
  it('sex 不是 male/female 就整檔拒絕', () => {
    const bad = JSON.stringify({
      version: 2,
      profiles: [{ id: P1, name: '小明', birthDate: '2025-09-01T00:00:00Z', sex: 'other' }],
      records: [],
    });
    expect(() => decodeAny(bad)).toThrow(/sex/);
  });

  it('height 不是數字就整檔拒絕', () => {
    const bad = JSON.stringify({
      version: 2,
      profiles: [{ id: P1, name: '小明', birthDate: '2025-09-01T00:00:00Z' }],
      records: [{ id: R1, babyId: P1, timestamp: '2026-01-15T02:00:00Z', hasUrine: false, height: '68.5' }],
    });
    expect(() => decodeAny(bad)).toThrow(/height/);
  });

  it('headCircumference 是 NaN 也拒絕', () => {
    const bad = JSON.stringify({
      version: 2,
      profiles: [{ id: P1, name: '小明', birthDate: '2025-09-01T00:00:00Z' }],
      records: [{ id: R1, babyId: P1, timestamp: '2026-01-15T02:00:00Z', hasUrine: false, headCircumference: 'x' }],
    });
    expect(() => decodeAny(bad)).toThrow(/headCircumference/);
  });
});
