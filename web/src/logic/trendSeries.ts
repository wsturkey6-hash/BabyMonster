import { dailySummary } from './dailyStats';
import type { RecordData } from './types';

export type TrendMetric =
  | 'stoolCount'
  | 'urineCount'
  | 'totalFeed'
  | 'avgTemperature'
  | 'avgWeight'
  | 'avgHeight'
  | 'avgHeadCirc';

export const TREND_METRIC_NAMES: Record<TrendMetric, string> = {
  stoolCount: '大便次數',
  urineCount: '小便次數',
  totalFeed: '總喝奶量',
  avgTemperature: '平均體溫',
  avgWeight: '平均體重',
  avgHeight: '平均身高',
  avgHeadCirc: '平均頭圍',
};

export const TREND_METRIC_UNITS: Record<TrendMetric, string> = {
  stoolCount: '次',
  urineCount: '次',
  totalFeed: 'ml',
  avgTemperature: '°C',
  avgWeight: 'g',
  avgHeight: 'cm',
  avgHeadCirc: 'cm',
};

/**
 * 缺值時要不要把前後兩點連起來。
 *
 * 體重／身高／頭圍是「狀態量」—— 沒量不代表歸零，中間連起來才看得出成長。
 * 次數與累計量則相反：那天沒記錄就是沒記錄，連起來會憑空捏造資料。
 * 體溫雖然也是狀態量，但缺口通常代表「沒發燒所以沒量」，連過去會誤導。
 */
export const TREND_METRIC_CONNECT_GAPS: Record<TrendMetric, boolean> = {
  stoolCount: false,
  urineCount: false,
  totalFeed: false,
  avgTemperature: false,
  avgWeight: true,
  avgHeight: true,
  avgHeadCirc: true,
};

export const TREND_METRIC_INTEGER: Record<TrendMetric, boolean> = {
  stoolCount: true,
  urineCount: true,
  totalFeed: true,
  avgTemperature: false,
  // 身高、頭圍以 0.1 cm 為單位記錄，跟體溫體重一樣要保留小數
  avgWeight: false,
  avgHeight: false,
  avgHeadCirc: false,
};

export interface TrendPoint {
  dayMs: number;
  value: number | null;
}

export function trendSeries(
  metric: TrendMetric,
  days: number,
  endingOnMs: number,
  records: RecordData[],
): TrendPoint[] {
  if (days <= 0) return [];
  const end = new Date(endingOnMs);
  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const dayMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset).getTime();
    const s = dailySummary(dayMs, records);
    const value =
      metric === 'stoolCount' ? s.stoolCount
      : metric === 'urineCount' ? s.urineCount
      : metric === 'totalFeed' ? s.totalFeed
      : metric === 'avgTemperature' ? s.averageTemperature
      : metric === 'avgWeight' ? s.averageWeight
      : metric === 'avgHeight' ? s.averageHeight
      : s.averageHeadCircumference;
    return { dayMs, value };
  });
}
