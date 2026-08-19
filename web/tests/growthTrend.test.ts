import { describe, expect, it } from 'vitest';
import { dailySummary } from '../src/logic/dailyStats';
import {
  TREND_METRIC_CONNECT_GAPS,
  TREND_METRIC_NAMES,
  TREND_METRIC_UNITS,
  trendSeries,
  type TrendMetric,
} from '../src/logic/trendSeries';
import type { RecordData } from '../src/logic/types';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('dailySummary：身高與頭圍', () => {
  it('沒有記錄時為 null', () => {
    const s = dailySummary(d(2026, 7, 15), []);
    expect(s.averageHeight).toBeNull();
    expect(s.averageHeadCircumference).toBeNull();
  });

  it('同一天量多次取平均', () => {
    const records = [
      rec(d(2026, 7, 15, 8), { height: 68, headCircumference: 44 }),
      rec(d(2026, 7, 15, 20), { height: 69, headCircumference: 45 }),
    ];
    const s = dailySummary(d(2026, 7, 15), records);
    expect(s.averageHeight).toBe(68.5);
    expect(s.averageHeadCircumference).toBe(44.5);
  });

  it('只算當天的記錄', () => {
    const records = [
      rec(d(2026, 7, 14), { height: 60 }),
      rec(d(2026, 7, 15), { height: 68 }),
    ];
    expect(dailySummary(d(2026, 7, 15), records).averageHeight).toBe(68);
  });

  it('身高與頭圍互不影響', () => {
    const s = dailySummary(d(2026, 7, 15), [rec(d(2026, 7, 15), { height: 68 })]);
    expect(s.averageHeight).toBe(68);
    expect(s.averageHeadCircumference).toBeNull();
  });
});

describe('trendSeries：新增的兩個指標', () => {
  it('平均身高逐日輸出，缺值為 null', () => {
    const records = [rec(d(2026, 7, 14), { height: 68 })];
    const s = trendSeries('avgHeight', 3, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([null, 68, null]);
  });

  it('平均頭圍逐日輸出', () => {
    const records = [rec(d(2026, 7, 15), { headCircumference: 44.5 })];
    const s = trendSeries('avgHeadCirc', 2, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([null, 44.5]);
  });

  it('身高與體重不會互相汙染', () => {
    const records = [rec(d(2026, 7, 15), { weight: 7000, height: 68 })];
    expect(trendSeries('avgWeight', 1, d(2026, 7, 15), records)[0].value).toBe(7000);
    expect(trendSeries('avgHeight', 1, d(2026, 7, 15), records)[0].value).toBe(68);
    expect(trendSeries('avgHeadCirc', 1, d(2026, 7, 15), records)[0].value).toBeNull();
  });
});

describe('指標中繼資料完整', () => {
  const METRICS = Object.keys(TREND_METRIC_NAMES) as TrendMetric[];

  it('七個指標都有名稱、單位、連線設定', () => {
    expect(METRICS).toHaveLength(7);
    for (const m of METRICS) {
      expect(TREND_METRIC_NAMES[m], m).toBeTruthy();
      expect(TREND_METRIC_UNITS[m], m).toBeTruthy();
      expect(typeof TREND_METRIC_CONNECT_GAPS[m], m).toBe('boolean');
    }
  });

  it('只有體重／身高／頭圍會連接缺口', () => {
    const connected = METRICS.filter((m) => TREND_METRIC_CONNECT_GAPS[m]);
    expect(connected.sort()).toEqual(['avgHeadCirc', 'avgHeight', 'avgWeight']);
  });
});
