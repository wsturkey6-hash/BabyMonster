import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GROWTH_METRICS,
  ageInDays,
  growthPercentile,
  lmsFor,
  normalCdf,
  valueAtZ,
  zScore,
  type GrowthMetric,
  type Sex,
} from '../src/logic/growthPercentile';
import { GROWTH_DAY_MAX } from '../src/logic/growthReference.generated';

const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

describe('normalCdf', () => {
  it('對照已知值', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1.959963985)).toBeCloseTo(0.975, 7);
    expect(normalCdf(-1.959963985)).toBeCloseTo(0.025, 7);
    expect(normalCdf(1)).toBeCloseTo(0.841344746, 7);
    expect(normalCdf(-3)).toBeCloseTo(0.001349898, 7);
  });

  it('對稱且單調', () => {
    for (let z = -4; z <= 4; z += 0.25) {
      expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 7);
    }
    let prev = -1;
    for (let z = -5; z <= 5; z += 0.1) {
      const v = normalCdf(z);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('極端值收斂到 0 與 1', () => {
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
  });
});

describe('LMS 換算', () => {
  it('L=0 走對數分支', () => {
    const lms = { L: 0, M: 10, S: 0.1 };
    expect(valueAtZ(lms, 0)).toBeCloseTo(10, 12);
    expect(valueAtZ(lms, 1)).toBeCloseTo(10 * Math.exp(0.1), 12);
    expect(zScore(lms, 10 * Math.exp(0.1))).toBeCloseTo(1, 12);
  });

  it('Z 與值雙向往返', () => {
    const lms = { L: -0.3521, M: 8.9481, S: 0.12204 };
    for (const z of [-3, -1.5, 0, 0.7, 2.4]) {
      expect(zScore(lms, valueAtZ(lms, z))).toBeCloseTo(z, 10);
    }
  });

  it('Z=0 時就是中位數 M', () => {
    expect(valueAtZ({ L: -0.3521, M: 8.9481, S: 0.12204 }, 0)).toBeCloseTo(8.9481, 12);
  });
});

describe('lmsFor', () => {
  it('超出 0..GROWTH_DAY_MAX 回傳 null', () => {
    expect(lmsFor('weight', 'male', -1)).toBeNull();
    expect(lmsFor('weight', 'male', GROWTH_DAY_MAX + 1)).toBeNull();
    expect(lmsFor('weight', 'male', 0)).not.toBeNull();
    expect(lmsFor('weight', 'male', GROWTH_DAY_MAX)).not.toBeNull();
  });

  it('三個指標、兩種性別都有資料', () => {
    for (const metric of GROWTH_METRICS) {
      for (const sex of ['male', 'female'] as Sex[]) {
        expect(lmsFor(metric, sex, 100), `${metric}/${sex}`).not.toBeNull();
      }
    }
  });

  it('男寶出生體重中位數 3.3464 kg、身長 49.8842 cm、頭圍 34.4618 cm', () => {
    expect(lmsFor('weight', 'male', 0)!.M).toBeCloseTo(3.3464, 4);
    expect(lmsFor('height', 'male', 0)!.M).toBeCloseTo(49.8842, 4);
    expect(lmsFor('headCirc', 'male', 0)!.M).toBeCloseTo(34.4618, 4);
  });

  it('day 730→731 身高中位數陡降約 0.67cm（WHO 躺姿改站姿）', () => {
    const a = lmsFor('height', 'male', 730)!.M;
    const b = lmsFor('height', 'male', 731)!.M;
    expect(a - b).toBeCloseTo(0.6715, 3);
  });
});

describe('對照 WHO 自家發布的 SD 欄位', () => {
  const { tolerance, cases } = readJson('../../data/who-growth-verification.json') as {
    tolerance: number;
    cases: { metric: GrowthMetric; sex: Sex; day: number; z: number; expected: number }[];
  };

  // WHO 的 SD 欄位印成 3 位小數，但 M 本身給到 4 位。第 4 位正好是 5 時（例如
  // weight/male day 500 的 M=10.6125 印成 10.612）差距正好等於容差，浮點誤差會
  // 讓它些微超過，所以比較時補一點 slack。
  const SLACK = 1e-9;

  it(`全部 ${cases.length} 筆都落在容差 ${0.0005} 內`, () => {
    expect(cases.length).toBeGreaterThan(600);
    const bad: string[] = [];
    for (const c of cases) {
      const lms = lmsFor(c.metric, c.sex, c.day);
      expect(lms, `${c.metric}/${c.sex} day ${c.day}`).not.toBeNull();
      const got = valueAtZ(lms!, c.z);
      if (Math.abs(got - c.expected) > tolerance + SLACK) {
        bad.push(`${c.metric}/${c.sex} day ${c.day} z ${c.z}: ${got} vs ${c.expected}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('跨平台一致性向量', () => {
  const { zTolerance, percentileTolerance, cases } = readJson(
    '../../data/growth-percentile-vectors.json',
  ) as {
    zTolerance: number;
    percentileTolerance: number;
    cases: { metric: GrowthMetric; sex: Sex; ageDays: number; value: number; z: number; percentile: number }[];
  };

  it(`全部 ${cases.length} 筆的 z 與百分位都相符`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const r = growthPercentile(c.metric, c.sex, c.ageDays, c.value);
      if (!r) {
        bad.push(`${c.metric}/${c.sex} day ${c.ageDays}: 回傳 null`);
        continue;
      }
      if (Math.abs(r.z - c.z) > zTolerance) {
        bad.push(`${c.metric}/${c.sex} day ${c.ageDays} z: ${r.z} vs ${c.z}`);
      }
      if (Math.abs(r.percentile - c.percentile) > percentileTolerance) {
        bad.push(`${c.metric}/${c.sex} day ${c.ageDays} p: ${r.percentile} vs ${c.percentile}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('growthPercentile', () => {
  it('中位數對應第 50 百分位', () => {
    const m = lmsFor('weight', 'female', 365)!.M;
    const r = growthPercentile('weight', 'female', 365, m)!;
    expect(r.percentile).toBeCloseTo(50, 6);
    expect(r.z).toBeCloseTo(0, 9);
    expect(r.beyond).toBeNull();
  });

  it('超出年齡範圍回傳 null', () => {
    expect(growthPercentile('weight', 'male', GROWTH_DAY_MAX + 1, 20)).toBeNull();
    expect(growthPercentile('weight', 'male', -1, 3)).toBeNull();
  });

  it('|Z| > 3 標記為 low / high，但仍回傳真實數值', () => {
    const lms = lmsFor('weight', 'male', 365)!;
    const low = growthPercentile('weight', 'male', 365, valueAtZ(lms, -3.5))!;
    expect(low.beyond).toBe('low');
    expect(low.z).toBeCloseTo(-3.5, 6);

    const high = growthPercentile('weight', 'male', 365, valueAtZ(lms, 3.5))!;
    expect(high.beyond).toBe('high');

    expect(growthPercentile('weight', 'male', 365, valueAtZ(lms, 2.9))!.beyond).toBeNull();
  });

  it('非正數或非有限的測量值回傳 null', () => {
    for (const v of [0, -5, NaN, Infinity]) {
      expect(growthPercentile('weight', 'male', 365, v), String(v)).toBeNull();
    }
  });

  it('L≠0 時測量值低到讓底數為負 → 回傳 null 而非 NaN', () => {
    // weight 的 L 為負，X 極小時 (X/M)^L 會爆掉；確保不會吐出 NaN
    const r = growthPercentile('weight', 'male', 365, 1e-9);
    expect(r === null || Number.isFinite(r.z)).toBe(true);
  });
});

describe('ageInDays', () => {
  const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();

  it('同一天為 0', () => {
    expect(ageInDays(at(2026, 3, 10, 6), at(2026, 3, 10, 23))).toBe(0);
  });

  it('逐日遞增', () => {
    expect(ageInDays(at(2026, 3, 10), at(2026, 3, 11))).toBe(1);
    expect(ageInDays(at(2026, 3, 10), at(2026, 4, 10))).toBe(31);
  });

  it('跨閏年 2 月正確', () => {
    expect(ageInDays(at(2024, 2, 28), at(2024, 3, 1))).toBe(2);
  });

  it('測量早於生日回傳負數（呼叫端據此排除）', () => {
    expect(ageInDays(at(2026, 3, 10), at(2026, 3, 9))).toBe(-1);
  });

  it('只看日曆日，不受時分影響', () => {
    expect(ageInDays(at(2026, 3, 10, 23), at(2026, 3, 11, 1))).toBe(1);
  });
});
