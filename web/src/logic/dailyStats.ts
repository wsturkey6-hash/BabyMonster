import type { RecordData } from './types';

export interface DailySummary {
  stoolCount: number;
  urineCount: number;
  totalFeed: number;
  averageTemperature: number | null;
  averageWeight: number | null;
  averageHeight: number | null;
  averageHeadCircumference: number | null;
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
  const heights = dayRecords.map((r) => r.height).filter((v): v is number => v != null);
  const heads = dayRecords.map((r) => r.headCircumference).filter((v): v is number => v != null);

  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

  return {
    stoolCount,
    urineCount,
    totalFeed: feeds.reduce((a, b) => a + b, 0),
    averageTemperature: avg(temps),
    averageWeight: avg(weights),
    averageHeight: avg(heights),
    averageHeadCircumference: avg(heads),
  };
}

/** 每天最少該喝的奶量：體重每公斤 100 ml。 */
export const MIN_FEED_ML_PER_KG = 100;

export interface FeedTarget {
  /** 當天最少該喝的總奶量（ml）。 */
  minimum: number;
  /** 換算用的那筆體重（g）。 */
  weight: number;
  /** 那筆體重的記錄時間。 */
  timestamp: number;
}

/**
 * 當天最少該喝多少奶，用「最近一次填的體重」換算。
 * 先取當天結束前最後一筆體重；若那天之前都還沒量過，就退而用第一筆（之後才量的）體重，
 * 這樣補記體重後，先前那幾天也看得到目標。完全沒有體重記錄時回傳 null。
 */
export function feedTarget(dayMs: number, records: RecordData[]): FeedTarget | null {
  const weighed = records
    .filter((r): r is RecordData & { weight: number } => r.weight != null && r.weight > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (weighed.length === 0) return null;

  const d = new Date(dayMs);
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  let basis = weighed[0];
  for (const r of weighed) {
    if (r.timestamp >= dayEnd) break;
    basis = r;
  }

  return {
    minimum: (basis.weight * MIN_FEED_ML_PER_KG) / 1000, // 先乘再除，避免 5100 g 算出 509.999…
    weight: basis.weight,
    timestamp: basis.timestamp,
  };
}
