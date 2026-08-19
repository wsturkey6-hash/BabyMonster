import {
  GROWTH_METRICS,
  ageInDays,
  growthPercentile,
  lmsFor,
  valueAtZ,
  type GrowthMetric,
  type PercentileResult,
  type Sex,
} from './growthPercentile';
import { GROWTH_DAY_MAX } from './growthReference.generated';
import type { ProfileData, RecordData } from './types';

export { GROWTH_METRICS };
export type { GrowthMetric };

/** 平均一個月的天數（WHO 自己也用這個數字換算月齡）。 */
const DAYS_PER_MONTH = 30.4375;

/** 兒童健康手冊上的五條參考線。z 值由測試釘住，確保與百分位相符。 */
export const REFERENCE_BANDS: { percentile: number; z: number }[] = [
  { percentile: 3, z: -1.8807936081512509 },
  { percentile: 15, z: -1.0364333894937894 },
  { percentile: 50, z: 0 },
  { percentile: 85, z: 1.0364333894937894 },
  { percentile: 97, z: 1.8807936081512504 },
];

/** X 軸上限的候選級距，避免寶寶還小時資料全擠在圖的最左邊。 */
export const CHART_MONTH_STEPS = [3, 6, 12, 24, 36, 60] as const;

export function daysToMonths(days: number): number {
  return days / DAYS_PER_MONTH;
}

export function monthsToDays(months: number): number {
  return Math.round(months * DAYS_PER_MONTH);
}

export function chartMaxMonths(ageDays: number): number {
  const months = daysToMonths(Math.max(0, ageDays));
  return CHART_MONTH_STEPS.find((m) => m >= months) ?? CHART_MONTH_STEPS[CHART_MONTH_STEPS.length - 1];
}

/** 取出記錄裡對應該指標的值，並換算成 WHO 表的單位（體重 g → kg）。 */
export function metricValue(metric: GrowthMetric, r: RecordData): number | undefined {
  switch (metric) {
    case 'weight':
      return r.weight != null ? r.weight / 1000 : undefined;
    case 'height':
      return r.height;
    case 'headCirc':
      return r.headCircumference;
  }
}

export interface GrowthPoint {
  ageDays: number;
  value: number;
}

export interface LatestMeasurement extends GrowthPoint {
  metric: GrowthMetric;
  timestamp: number;
  /** 沒設性別或年齡超出 WHO 範圍時為 null —— 值還是要顯示，只是算不出百分位 */
  result: PercentileResult | null;
}

/**
 * 該指標最新的一筆測量。
 * 三個指標各自取自己最新的記錄，因為身高體重常不是同一天量的。
 */
export function latestMeasurement(
  metric: GrowthMetric,
  profile: ProfileData,
  records: RecordData[],
): LatestMeasurement | null {
  let best: { r: RecordData; value: number; ageDays: number } | null = null;
  for (const r of records) {
    const value = metricValue(metric, r);
    if (value === undefined || !Number.isFinite(value) || value <= 0) continue;
    const days = ageInDays(profile.birthDate, r.timestamp);
    if (!Number.isFinite(days) || days < 0) continue; // 早於生日的記錄不列入
    if (!best || r.timestamp > best.r.timestamp) best = { r, value, ageDays: days };
  }
  if (!best) return null;

  const result =
    profile.sex && best.ageDays <= GROWTH_DAY_MAX
      ? growthPercentile(metric, profile.sex, best.ageDays, best.value)
      : null;

  return {
    metric,
    value: best.value,
    ageDays: best.ageDays,
    timestamp: best.r.timestamp,
    result,
  };
}

/** 歷次測量點，依年齡由小到大；超出 WHO 年齡範圍的點不畫。 */
export function measurementSeries(
  metric: GrowthMetric,
  profile: ProfileData,
  records: RecordData[],
): GrowthPoint[] {
  const points: GrowthPoint[] = [];
  for (const r of records) {
    const value = metricValue(metric, r);
    if (value === undefined || !Number.isFinite(value) || value <= 0) continue;
    const ageDays = ageInDays(profile.birthDate, r.timestamp);
    if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > GROWTH_DAY_MAX) continue;
    points.push({ ageDays, value });
  }
  return points.sort((a, b) => a.ageDays - b.ageDays);
}

export interface ReferenceCurve {
  percentile: number;
  points: GrowthPoint[];
}

/** 目標取樣點數；圖寬有限，再多也看不出差別，卻會拖慢 recharts。 */
const TARGET_SAMPLES = 100;

/**
 * 產生 X 軸 0…maxDays 的五條參考曲線。
 *
 * 取樣點一定包含 day 730 與 731 —— WHO 在滿 2 歲從躺姿身長改成站姿身高，
 * 中位數在那裡陡降 0.67cm，取樣時跳過會把那個轉折抹平。
 */
export function referenceCurves(metric: GrowthMetric, sex: Sex, maxDays: number): ReferenceCurve[] {
  const end = Math.max(0, Math.min(Math.round(maxDays), GROWTH_DAY_MAX));
  const step = Math.max(1, Math.ceil(end / TARGET_SAMPLES));

  const days = new Set<number>([0, end]);
  for (let d = 0; d <= end; d += step) days.add(d);
  if (end >= 731) {
    days.add(730);
    days.add(731);
  }
  const sampled = [...days].sort((a, b) => a - b);

  return REFERENCE_BANDS.map((band) => ({
    percentile: band.percentile,
    points: sampled.flatMap((ageDays) => {
      const lms = lmsFor(metric, sex, ageDays);
      return lms ? [{ ageDays, value: valueAtZ(lms, band.z) }] : [];
    }),
  }));
}
