import { describe, expect, it } from 'vitest';
import { dailySleepMinutes, sleepIntervals } from '../src/logic/sleep';
import type { RecordData } from '../src/logic/types';

const at = (y: number, m: number, day: number, h = 0, min = 0) =>
  new Date(y, m - 1, day, h, min).getTime();

function rec(ts: number, sleep?: 'start' | 'end'): RecordData {
  return {
    id: crypto.randomUUID(),
    babyId: 'b1',
    timestamp: ts,
    hasUrine: false,
    ...(sleep ? { sleep } : {}),
  };
}

describe('sleepIntervals', () => {
  it('入睡配對下一筆起床', () => {
    const records = [rec(at(2026, 7, 26, 20), 'start'), rec(at(2026, 7, 26, 22), 'end')];
    expect(sleepIntervals(records)).toEqual([
      { start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22) },
    ]);
  });

  it('輸入順序打亂也會先依時間排序', () => {
    const records = [rec(at(2026, 7, 26, 22), 'end'), rec(at(2026, 7, 26, 20), 'start')];
    expect(sleepIntervals(records)).toHaveLength(1);
  });

  it('連續兩次入睡，以最早那次為準', () => {
    const records = [
      rec(at(2026, 7, 26, 20), 'start'),
      rec(at(2026, 7, 26, 20, 30), 'start'),
      rec(at(2026, 7, 26, 22), 'end'),
    ];
    expect(sleepIntervals(records)).toEqual([
      { start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22) },
    ]);
  });

  it('沒有對應入睡的起床直接忽略', () => {
    const records = [
      rec(at(2026, 7, 26, 7), 'end'),
      rec(at(2026, 7, 26, 20), 'start'),
      rec(at(2026, 7, 26, 22), 'end'),
    ];
    expect(sleepIntervals(records)).toEqual([
      { start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22) },
    ]);
  });

  it('還沒記起床的那段不產生區間', () => {
    const records = [
      rec(at(2026, 7, 26, 13), 'start'),
      rec(at(2026, 7, 26, 14), 'end'),
      rec(at(2026, 7, 26, 20), 'start'),
    ];
    expect(sleepIntervals(records)).toEqual([
      { start: at(2026, 7, 26, 13), end: at(2026, 7, 26, 14) },
    ]);
  });

  it('沒有睡眠欄位的記錄完全不參與', () => {
    expect(sleepIntervals([rec(at(2026, 7, 26, 8)), rec(at(2026, 7, 26, 9))])).toEqual([]);
  });
});

describe('dailySleepMinutes', () => {
  it('當天睡完的整段都算', () => {
    const records = [rec(at(2026, 7, 26, 13), 'start'), rec(at(2026, 7, 26, 14, 30), 'end')];
    expect(dailySleepMinutes(at(2026, 7, 26), records)).toBe(90);
  });

  it('跨夜的睡眠按午夜切開，分給兩天', () => {
    const records = [rec(at(2026, 7, 26, 20), 'start'), rec(at(2026, 7, 27, 6), 'end')];
    expect(dailySleepMinutes(at(2026, 7, 26), records)).toBe(4 * 60);
    expect(dailySleepMinutes(at(2026, 7, 27), records)).toBe(6 * 60);
  });

  it('橫跨整天的長睡眠，那天算滿 24 小時', () => {
    const records = [rec(at(2026, 7, 26, 22), 'start'), rec(at(2026, 7, 28, 2), 'end')];
    expect(dailySleepMinutes(at(2026, 7, 26), records)).toBe(2 * 60);
    expect(dailySleepMinutes(at(2026, 7, 27), records)).toBe(24 * 60);
    expect(dailySleepMinutes(at(2026, 7, 28), records)).toBe(2 * 60);
  });

  it('同一天多段睡眠會加總', () => {
    const records = [
      rec(at(2026, 7, 26, 9), 'start'),
      rec(at(2026, 7, 26, 10), 'end'),
      rec(at(2026, 7, 26, 13), 'start'),
      rec(at(2026, 7, 26, 15), 'end'),
    ];
    expect(dailySleepMinutes(at(2026, 7, 26), records)).toBe(180);
  });

  it('沒有睡眠記錄回傳 0', () => {
    expect(dailySleepMinutes(at(2026, 7, 26), [])).toBe(0);
    expect(dailySleepMinutes(at(2026, 7, 26), [rec(at(2026, 7, 26, 8))])).toBe(0);
  });

  it('未收尾的睡眠不計入', () => {
    const records = [rec(at(2026, 7, 26, 20), 'start')];
    expect(dailySleepMinutes(at(2026, 7, 26), records)).toBe(0);
  });

  it('選定日期用當天任一時刻都得到同樣結果', () => {
    const records = [rec(at(2026, 7, 26, 20), 'start'), rec(at(2026, 7, 27, 6), 'end')];
    expect(dailySleepMinutes(at(2026, 7, 26, 23, 59), records)).toBe(4 * 60);
  });
});
