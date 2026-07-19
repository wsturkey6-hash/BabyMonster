import { describe, expect, it } from 'vitest';
import { dailySummary, sameLocalDay } from '../src/logic/dailyStats';
import type { RecordData } from '../src/logic/types';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('dailySummary', () => {
  it('空資料日', () => {
    const s = dailySummary(d(2026, 7, 15), []);
    expect(s).toEqual({
      stoolCount: 0,
      urineCount: 0,
      totalFeed: 0,
      averageTemperature: null,
      averageWeight: null,
    });
  });

  it('次數與加總、平均', () => {
    const records = [
      rec(d(2026, 7, 15, 8), { feedAmount: 100, stoolColor: 7, hasUrine: true, temperature: 36.5, weight: 4000 }),
      rec(d(2026, 7, 15, 12), { feedAmount: 120, hasUrine: true }),
      rec(d(2026, 7, 15, 18), { stoolColor: 3, temperature: 37.5, weight: 4100 }),
    ];
    const s = dailySummary(d(2026, 7, 15), records);
    expect(s.stoolCount).toBe(2);
    expect(s.urineCount).toBe(2);
    expect(s.totalFeed).toBe(220);
    expect(s.averageTemperature).toBeCloseTo(37.0, 3);
    expect(s.averageWeight).toBeCloseTo(4050, 3);
  });

  it('只算選定當天（跨午夜邊界）', () => {
    const records = [
      rec(d(2026, 7, 15, 8), { feedAmount: 100 }),
      rec(d(2026, 7, 14, 23), { feedAmount: 999 }),
      rec(d(2026, 7, 16, 0), { feedAmount: 999 }),
    ];
    expect(dailySummary(d(2026, 7, 15), records).totalFeed).toBe(100);
  });
});

describe('sameLocalDay', () => {
  it('同一天不同時刻為真、跨日為假', () => {
    expect(sameLocalDay(d(2026, 7, 15, 0), d(2026, 7, 15, 23))).toBe(true);
    expect(sameLocalDay(d(2026, 7, 15, 23), d(2026, 7, 16, 0))).toBe(false);
  });
});
