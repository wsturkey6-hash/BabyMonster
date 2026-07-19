import { describe, expect, it } from 'vitest';
import { decodeAny, encodeV2, isoFromMs, msFromIso } from '../src/logic/dataTransfer';
import type { BackupPayloadV2 } from '../src/logic/dataTransfer';

const P1 = '11111111-1111-1111-1111-111111111111';
const R1 = '22222222-2222-2222-2222-222222222222';

function payload(): BackupPayloadV2 {
  return {
    profiles: [{ id: P1, name: '小明', birthDate: Date.UTC(2025, 10, 2) }],
    records: [
      {
        id: R1,
        babyId: P1,
        timestamp: Date.UTC(2026, 6, 18, 4, 56),
        feedAmount: 120,
        stoolColor: 7,
        stoolAmount: 'medium',
        stoolShape: 4,
        hasUrine: true,
        temperature: 36.5,
        weight: 4000,
        note: '備註',
      },
    ],
  };
}

describe('ISO 8601 日期（相容性關鍵）', () => {
  it('輸出 UTC 秒級、無毫秒', () => {
    expect(isoFromMs(Date.UTC(2026, 6, 18, 4, 56, 0, 789))).toBe('2026-07-18T04:56:00Z');
    expect(isoFromMs(Date.UTC(2026, 6, 18, 4, 56))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
  it('解析寬鬆：無毫秒、含毫秒、時區偏移都接受', () => {
    expect(msFromIso('2026-07-18T04:56:00Z')).toBe(Date.UTC(2026, 6, 18, 4, 56));
    expect(msFromIso('2026-07-18T04:56:00.789Z')).toBe(Date.UTC(2026, 6, 18, 4, 56, 0, 789));
    expect(msFromIso('2026-07-18T12:56:00+08:00')).toBe(Date.UTC(2026, 6, 18, 4, 56));
  });
  it('無效日期丟錯', () => {
    expect(() => msFromIso('2026-07-18')).toThrow();
    expect(() => msFromIso('not a date')).toThrow();
  });
});

describe('encodeV2', () => {
  it('round-trip 等值', () => {
    const p = payload();
    expect(decodeAny(encodeV2(p))).toEqual(p);
  });
  it('JSON 內日期全部無毫秒、含 version 2', () => {
    const obj = JSON.parse(encodeV2(payload()));
    expect(obj.version).toBe(2);
    expect(obj.profiles[0].birthDate).toBe('2025-11-02T00:00:00Z');
    expect(obj.records[0].timestamp).toBe('2026-07-18T04:56:00Z');
  });
  it('選填欄位不存在時整個省略（不輸出 null）', () => {
    const p: BackupPayloadV2 = {
      profiles: [{ id: P1, name: 'x', birthDate: 0 }],
      records: [{ id: R1, babyId: P1, timestamp: 0, hasUrine: false }],
    };
    const rec = JSON.parse(encodeV2(p)).records[0];
    expect(Object.keys(rec).sort()).toEqual(['babyId', 'hasUrine', 'id', 'timestamp']);
  });
});

describe('decodeAny', () => {
  it('v1 檔（現行 iOS 匯出）轉 v2：records 全綁該寶寶', () => {
    const v1 = `{"profile":{"name":"Old","birthDate":"2024-05-20T00:00:00Z"},
      "records":[{"id":"${R1}","timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}`;
    const v2 = decodeAny(v1);
    expect(v2.profiles).toHaveLength(1);
    expect(v2.profiles[0].name).toBe('Old');
    expect(v2.records).toHaveLength(1);
    expect(v2.records[0].babyId).toBe(v2.profiles[0].id);
    expect(v2.records[0].hasUrine).toBe(true);
  });
  it('欄位不合法 → 整檔拒絕', () => {
    const bad = JSON.parse(encodeV2(payload()));
    bad.records[0].stoolColor = 12; // 超出 1–9
    expect(() => decodeAny(JSON.stringify(bad))).toThrow();
  });
  it('缺 hasUrine → 整檔拒絕', () => {
    const bad = JSON.parse(encodeV2(payload()));
    delete bad.records[0].hasUrine;
    expect(() => decodeAny(JSON.stringify(bad))).toThrow();
  });
  it('無法辨識的格式丟錯', () => {
    expect(() => decodeAny('{"foo":1}')).toThrow();
    expect(() => decodeAny('not json')).toThrow();
  });
});
