import { describe, expect, it } from 'vitest';
import { dailySummary, dayNotes, feedTarget, sameLocalDay } from '../src/logic/dailyStats';
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
      averageHeight: null,
      averageHeadCircumference: null,
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

describe('dayNotes', () => {
  it('只取當天有備註的記錄，依時間由早到晚', () => {
    const morning = rec(d(2026, 7, 15, 8), { note: '早上精神很好' });
    const evening = rec(d(2026, 7, 15, 18), { note: '晚上有點鬧' });
    const records = [
      evening,
      morning,
      rec(d(2026, 7, 15, 12), { feedAmount: 100 }), // 沒備註
      rec(d(2026, 7, 14, 23), { note: '前一天' }),
      rec(d(2026, 7, 16, 0), { note: '隔天' }),
    ];
    expect(dayNotes(d(2026, 7, 15), records)).toEqual([
      { id: morning.id, timestamp: morning.timestamp, note: '早上精神很好' },
      { id: evening.id, timestamp: evening.timestamp, note: '晚上有點鬧' },
    ]);
  });

  it('同一分鐘的兩筆備註都保留，id 各自不同', () => {
    const a = rec(d(2026, 7, 15, 9), { note: '第一件事' });
    const b = rec(d(2026, 7, 15, 9), { note: '第二件事' });
    const out = dayNotes(d(2026, 7, 15), [a, b]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((n) => n.id)).size).toBe(2);
  });

  it('沒有備註時回傳空陣列', () => {
    expect(dayNotes(d(2026, 7, 15), [rec(d(2026, 7, 15, 8), { feedAmount: 100 })])).toEqual([]);
  });

  it('空字串備註不算', () => {
    expect(dayNotes(d(2026, 7, 15), [rec(d(2026, 7, 15, 8), { note: '' })])).toEqual([]);
  });
});

describe('sameLocalDay', () => {
  it('同一天不同時刻為真、跨日為假', () => {
    expect(sameLocalDay(d(2026, 7, 15, 0), d(2026, 7, 15, 23))).toBe(true);
    expect(sameLocalDay(d(2026, 7, 15, 23), d(2026, 7, 16, 0))).toBe(false);
  });
});

describe('feedTarget', () => {
  it('沒有體重記錄時沒有目標', () => {
    expect(feedTarget(d(2026, 7, 15), [rec(d(2026, 7, 15), { feedAmount: 100 })])).toBeNull();
  });

  it('體重 kg × 100 就是當天最少奶量', () => {
    const t = feedTarget(d(2026, 7, 15), [rec(d(2026, 7, 15, 9), { weight: 5250 })]);
    expect(t).toEqual({ minimum: 525, weight: 5250, timestamp: d(2026, 7, 15, 9) });
  });

  it('取當天結束前最後一筆體重，之後才量的不算', () => {
    const records = [
      rec(d(2026, 7, 10), { weight: 4000 }),
      rec(d(2026, 7, 15, 8), { weight: 5000 }),
      rec(d(2026, 7, 15, 20), { weight: 5100 }), // 同一天更晚的一筆
      rec(d(2026, 7, 16), { weight: 9000 }), // 選定日之後
    ];
    expect(feedTarget(d(2026, 7, 15), records)?.minimum).toBe(510);
  });

  it('那天之前還沒量過就用第一筆體重（補記體重後舊日子也看得到目標）', () => {
    const records = [rec(d(2026, 7, 20), { weight: 5000 }), rec(d(2026, 7, 25), { weight: 5400 })];
    expect(feedTarget(d(2026, 7, 15), records)?.weight).toBe(5000);
  });

  it('記錄順序顛倒也一樣', () => {
    const records = [
      rec(d(2026, 7, 16), { weight: 9000 }),
      rec(d(2026, 7, 15, 8), { weight: 5000 }),
      rec(d(2026, 7, 10), { weight: 4000 }),
    ];
    expect(feedTarget(d(2026, 7, 15), records)?.weight).toBe(5000);
  });
});
