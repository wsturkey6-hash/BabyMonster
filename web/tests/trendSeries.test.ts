import { describe, expect, it } from 'vitest';
import { trendSeries } from '../src/logic/trendSeries';
import type { RecordData } from '../src/logic/types';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('trendSeries', () => {
  it('產生 days 個點、日期由舊到新、無資料日次數為 0', () => {
    const s = trendSeries('stoolCount', 3, d(2026, 7, 15), []);
    expect(s).toHaveLength(3);
    expect(new Date(s[0].dayMs).getDate()).toBe(13);
    expect(new Date(s[2].dayMs).getDate()).toBe(15);
    expect(s.map((p) => p.value)).toEqual([0, 0, 0]);
  });

  it('平均體溫在無資料日為 null（斷點）', () => {
    const records = [rec(d(2026, 7, 14), { temperature: 37 })];
    const s = trendSeries('avgTemperature', 3, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([null, 37, null]);
  });

  it('總喝奶量逐日加總', () => {
    const records = [
      rec(d(2026, 7, 14, 8), { feedAmount: 100 }),
      rec(d(2026, 7, 14, 20), { feedAmount: 50 }),
      rec(d(2026, 7, 15, 8), { feedAmount: 120 }),
    ];
    const s = trendSeries('totalFeed', 2, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([150, 120]);
  });

  it('days <= 0 回空陣列', () => {
    expect(trendSeries('stoolCount', 0, d(2026, 7, 15), [])).toEqual([]);
  });
});
