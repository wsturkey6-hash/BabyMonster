import type { RecordData } from './types';

export interface DailySummary {
  stoolCount: number;
  urineCount: number;
  totalFeed: number;
  averageTemperature: number | null;
  averageWeight: number | null;
}

export function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function dailySummary(dayMs: number, records: RecordData[]): DailySummary {
  const dayRecords = records.filter((r) => sameLocalDay(r.timestamp, dayMs));

  const stoolCount = dayRecords.filter((r) => r.stoolColor != null).length;
  const urineCount = dayRecords.filter((r) => r.hasUrine).length;
  const feeds = dayRecords.map((r) => r.feedAmount).filter((v): v is number => v != null);
  const temps = dayRecords.map((r) => r.temperature).filter((v): v is number => v != null);
  const weights = dayRecords.map((r) => r.weight).filter((v): v is number => v != null);

  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

  return {
    stoolCount,
    urineCount,
    totalFeed: feeds.reduce((a, b) => a + b, 0),
    averageTemperature: avg(temps),
    averageWeight: avg(weights),
  };
}
