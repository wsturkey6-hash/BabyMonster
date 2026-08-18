import { dailySummary } from './dailyStats';
import type { RecordData } from './types';

export type TrendMetric = 'stoolCount' | 'urineCount' | 'totalFeed' | 'avgTemperature' | 'avgWeight';

export const TREND_METRIC_NAMES: Record<TrendMetric, string> = {
  stoolCount: '大便次數',
  urineCount: '小便次數',
  totalFeed: '總喝奶量',
  avgTemperature: '平均體溫',
  avgWeight: '平均體重',
};

export const TREND_METRIC_UNITS: Record<TrendMetric, string> = {
  stoolCount: '次',
  urineCount: '次',
  totalFeed: 'ml',
  avgTemperature: '°C',
  avgWeight: 'g',
};

export const TREND_METRIC_INTEGER: Record<TrendMetric, boolean> = {
  stoolCount: true,
  urineCount: true,
  totalFeed: true,
  avgTemperature: false,
  avgWeight: false,
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
      : s.averageWeight;
    return { dayMs, value };
  });
}
