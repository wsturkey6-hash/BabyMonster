import { describe, expect, it } from 'vitest';
import {
  CHART_MONTH_STEPS,
  REFERENCE_BANDS,
  bandLabel,
  chartMaxMonths,
  daysToMonths,
  formatPercentile,
  latestMeasurement,
  measurementSeries,
  metricValue,
  referenceCurves,
} from '../src/logic/growthChart';
import { GROWTH_DAY_MAX } from '../src/logic/growthReference.generated';
import { normalCdf } from '../src/logic/growthPercentile';
import type { ProfileData, RecordData } from '../src/logic/types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

const baby: ProfileData = {
  id: 'b1',
  name: '寶寶',
  birthDate: at(2025, 9, 1, 0),
  sex: 'male',
};

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('REFERENCE_BANDS', () => {
  it('五條參考線的 z 值確實對應各自的百分位', () => {
    expect(REFERENCE_BANDS).toHaveLength(5);
    for (const b of REFERENCE_BANDS) {
      expect(normalCdf(b.z) * 100, `P${b.percentile}`).toBeCloseTo(b.percentile, 9);
    }
  });

  it('由低到高排列', () => {
    const ps = REFERENCE_BANDS.map((b) => b.percentile);
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
    expect(ps).toEqual([3, 15, 50, 85, 97]);
  });
});

describe('metricValue', () => {
  it('體重由公克換算成公斤（WHO 表的單位）', () => {
    expect(metricValue('weight', rec(0, { weight: 7250 }))).toBe(7.25);
  });

  it('身高與頭圍直接用 cm', () => {
    expect(metricValue('height', rec(0, { height: 68.5 }))).toBe(68.5);
    expect(metricValue('headCirc', rec(0, { headCircumference: 44.2 }))).toBe(44.2);
  });

  it('沒有該欄位時回傳 undefined', () => {
    expect(metricValue('weight', rec(0))).toBeUndefined();
    expect(metricValue('height', rec(0, { weight: 7000 }))).toBeUndefined();
  });
});

describe('daysToMonths / chartMaxMonths', () => {
  it('天數換算成月齡', () => {
    expect(daysToMonths(0)).toBe(0);
    expect(daysToMonths(365)).toBeCloseTo(11.99, 1);
    expect(daysToMonths(1856)).toBeCloseTo(60.98, 1);
  });

  it('取級距中第一個 ≥ 目前月齡者', () => {
    expect(chartMaxMonths(0)).toBe(3);
    expect(chartMaxMonths(60)).toBe(3); // 約 2 個月
    expect(chartMaxMonths(150)).toBe(6); // 約 4.9 個月
    expect(chartMaxMonths(250)).toBe(12); // 約 8.2 個月
    expect(chartMaxMonths(400)).toBe(24); // 約 13 個月
    expect(chartMaxMonths(800)).toBe(36); // 約 26 個月
    expect(chartMaxMonths(1856)).toBe(60);
  });

  it('超出級距上限時夾在 60', () => {
    expect(chartMaxMonths(99999)).toBe(60);
    expect(CHART_MONTH_STEPS[CHART_MONTH_STEPS.length - 1]).toBe(60);
  });
});

describe('latestMeasurement', () => {
  it('取最新一筆有該指標的記錄，並算出百分位', () => {
    const records = [
      rec(at(2025, 10, 1), { weight: 4200 }),
      rec(at(2025, 12, 1), { weight: 6100 }),
      rec(at(2025, 11, 1), { weight: 5300 }),
    ];
    const m = latestMeasurement('weight', baby, records)!;
    expect(m.value).toBe(6.1);
    expect(m.timestamp).toBe(at(2025, 12, 1));
    expect(m.ageDays).toBe(91);
    expect(m.result).not.toBeNull();
    expect(m.result!.percentile).toBeGreaterThan(0);
    expect(m.result!.percentile).toBeLessThan(100);
  });

  it('不同指標各自取自己最新的那筆（可能不同天）', () => {
    const records = [
      rec(at(2025, 12, 1), { weight: 6100, height: 60 }),
      rec(at(2026, 1, 15), { weight: 6800 }),
    ];
    expect(latestMeasurement('weight', baby, records)!.timestamp).toBe(at(2026, 1, 15));
    expect(latestMeasurement('height', baby, records)!.timestamp).toBe(at(2025, 12, 1));
  });

  it('沒有任何該指標的記錄時回傳 null', () => {
    expect(latestMeasurement('headCirc', baby, [rec(at(2025, 12, 1), { weight: 6100 })])).toBeNull();
    expect(latestMeasurement('weight', baby, [])).toBeNull();
  });

  it('沒設定性別時回傳測量值但 result 為 null', () => {
    const noSex: ProfileData = { ...baby, sex: undefined };
    const m = latestMeasurement('weight', noSex, [rec(at(2025, 12, 1), { weight: 6100 })])!;
    expect(m.value).toBe(6.1);
    expect(m.result).toBeNull();
  });

  it('測量早於生日的記錄不列入', () => {
    const records = [rec(at(2025, 8, 20), { weight: 3200 })];
    expect(latestMeasurement('weight', baby, records)).toBeNull();
  });

  it('超過 5 歲的測量仍回傳值，但 result 為 null（超出 WHO 範圍）', () => {
    const m = latestMeasurement('weight', baby, [rec(at(2031, 9, 1), { weight: 20000 })])!;
    expect(m.value).toBe(20);
    expect(m.ageDays).toBeGreaterThan(GROWTH_DAY_MAX);
    expect(m.result).toBeNull();
  });
});

describe('measurementSeries', () => {
  it('依年齡由小到大排序，只留有該指標的記錄', () => {
    const records = [
      rec(at(2025, 12, 1), { weight: 6100 }),
      rec(at(2025, 10, 1), { weight: 4200 }),
      rec(at(2025, 11, 1), { height: 57 }),
    ];
    const s = measurementSeries('weight', baby, records);
    expect(s.map((p) => p.value)).toEqual([4.2, 6.1]);
    expect(s[0].ageDays).toBeLessThan(s[1].ageDays);
  });

  it('排除早於生日與超出 WHO 範圍的點', () => {
    const records = [
      rec(at(2025, 8, 1), { weight: 3000 }),
      rec(at(2025, 12, 1), { weight: 6100 }),
      rec(at(2031, 9, 1), { weight: 20000 }),
    ];
    expect(measurementSeries('weight', baby, records).map((p) => p.value)).toEqual([6.1]);
  });

  it('沒有記錄時回傳空陣列', () => {
    expect(measurementSeries('weight', baby, [])).toEqual([]);
  });
});

describe('referenceCurves', () => {
  it('五條曲線，每條的點數相同且落在 0..maxDays', () => {
    const curves = referenceCurves('weight', 'male', 365);
    expect(curves).toHaveLength(5);
    const n = curves[0].points.length;
    for (const c of curves) {
      expect(c.points).toHaveLength(n);
      expect(c.points[0].ageDays).toBe(0);
      expect(c.points[c.points.length - 1].ageDays).toBe(365);
    }
  });

  it('同一年齡下，百分位越高數值越大', () => {
    const curves = referenceCurves('weight', 'male', 365);
    for (let i = 0; i < curves[0].points.length; i++) {
      for (let k = 1; k < curves.length; k++) {
        expect(curves[k].points[i].value).toBeGreaterThan(curves[k - 1].points[i].value);
      }
    }
  });

  it('P50 曲線就是 WHO 的中位數 M', () => {
    const p50 = referenceCurves('height', 'female', 200).find((c) => c.percentile === 50)!;
    const first = p50.points[0];
    expect(first.value).toBeCloseTo(49.1477, 4); // 女寶出生身長中位數
  });

  it('涵蓋 day 730/731 時保留那個不連續點', () => {
    const c = referenceCurves('height', 'male', 1000).find((x) => x.percentile === 50)!;
    const days = c.points.map((p) => p.ageDays);
    expect(days).toContain(730);
    expect(days).toContain(731);
    const v730 = c.points.find((p) => p.ageDays === 730)!.value;
    const v731 = c.points.find((p) => p.ageDays === 731)!.value;
    expect(v730 - v731).toBeCloseTo(0.6715, 3);
  });

  it('maxDays 超出 WHO 範圍時夾住', () => {
    const c = referenceCurves('weight', 'male', 99999)[0];
    expect(c.points[c.points.length - 1].ageDays).toBe(GROWTH_DAY_MAX);
  });

  it('點數不至於多到拖垮圖表', () => {
    for (const maxDays of [90, 365, 1856]) {
      const c = referenceCurves('weight', 'male', maxDays)[0];
      expect(c.points.length).toBeLessThanOrEqual(130);
      expect(c.points.length).toBeGreaterThan(10);
    }
  });
});

describe('formatPercentile', () => {
  const r = (percentile: number, beyond: 'low' | 'high' | null = null) => ({ z: 0, percentile, beyond });

  it('一般範圍取整數', () => {
    expect(formatPercentile(r(50))).toBe('50');
    expect(formatPercentile(r(18.6))).toBe('19');
  });

  it('兩端一位小數，免得都顯示成 1 或 99', () => {
    expect(formatPercentile(r(0.4))).toBe('0.4');
    expect(formatPercentile(r(99.5))).toBe('99.5');
  });

  it('超出 |Z|>3 時不報假精度', () => {
    expect(formatPercentile(r(0.02, 'low'))).toBe('< 0.1');
    expect(formatPercentile(r(99.98, 'high'))).toBe('> 99.9');
  });
});

describe('bandLabel', () => {
  const label = (percentile: number) => bandLabel({ z: 0, percentile, beyond: null });

  /**
   * 圖上畫了五條參考線（3/15/50/85/97），標籤就必須切成對應的六段。
   * 曾經把 15–85 併成一段「中段」，結果第 19 與第 52 百分位顯示成同一個區間，
   * 跟圖上看到的落點對不起來。
   */
  it('五條參考線切出六個區間', () => {
    expect(label(1)).toBe('低於第 3 百分位');
    expect(label(10)).toBe('第 3–15 百分位');
    expect(label(19)).toBe('第 15–50 百分位');
    expect(label(52)).toBe('第 50–85 百分位');
    expect(label(90)).toBe('第 85–97 百分位');
    expect(label(99)).toBe('高於第 97 百分位');
  });

  it('每條參考線本身歸入它開啟的那一段', () => {
    expect(label(3)).toBe('第 3–15 百分位');
    expect(label(15)).toBe('第 15–50 百分位');
    expect(label(50)).toBe('第 50–85 百分位');
    expect(label(85)).toBe('第 50–85 百分位');
    expect(label(97)).toBe('第 85–97 百分位');
  });

  it('六段互不重疊也不留空隙', () => {
    const seen = new Set<string>();
    let prev = label(0);
    seen.add(prev);
    for (let p = 0; p <= 100; p += 0.05) {
      const cur = label(p);
      if (cur !== prev) {
        expect(seen.has(cur), `${cur} 在 ${p} 又出現一次`).toBe(false);
        seen.add(cur);
        prev = cur;
      }
    }
    expect(seen.size).toBe(6);
  });
});
