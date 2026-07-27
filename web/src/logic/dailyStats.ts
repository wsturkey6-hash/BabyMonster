import type { RecordData } from './types';

export interface DailySummary {
  stoolCount: number;
  urineCount: number;
  totalFeed: number;
  averageTemperature: number | null;
  averageWeight: number | null;
}

export interface DayNote {
  id: string;
  timestamp: number;
  note: string;
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

/** 當天有寫備註的記錄，依時間由早到晚，方便回頭讀完整天發生的事。 */
export function dayNotes(dayMs: number, records: RecordData[]): DayNote[] {
  return records
    .filter((r) => sameLocalDay(r.timestamp, dayMs) && r.note)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((r) => ({ id: r.id, timestamp: r.timestamp, note: r.note as string }));
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
