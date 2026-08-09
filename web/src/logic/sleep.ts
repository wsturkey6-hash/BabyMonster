import type { RecordData } from './types';

export interface SleepInterval {
  start: number; // epoch ms
  end: number; // epoch ms
}

const localDayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const nextLocalDayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/**
 * 依時間由早到晚配對入睡／起床。
 * 已經有一段開著時的重複「入睡」會被忽略（以最早那次為準）；
 * 沒有對應入睡的「起床」也忽略；最後還開著的那段（還在睡或忘了記）不產生區間。
 */
export function sleepIntervals(records: RecordData[]): SleepInterval[] {
  const events = records
    .filter((r) => r.sleep !== undefined)
    .sort((a, b) => a.timestamp - b.timestamp);

  const intervals: SleepInterval[] = [];
  let openStart: number | null = null;

  for (const e of events) {
    if (e.sleep === 'start') {
      if (openStart === null) openStart = e.timestamp;
    } else if (openStart !== null) {
      intervals.push({ start: openStart, end: e.timestamp });
      openStart = null;
    }
  }
  return intervals;
}

/** 選定當天 [00:00, 隔天 00:00) 與各段睡眠的重疊分鐘數總和（跨夜以午夜切分）。 */
export function dailySleepMinutes(dayMs: number, records: RecordData[]): number {
  const dayStart = localDayStart(dayMs);
  const dayEnd = nextLocalDayStart(dayMs);

  const overlapMs = sleepIntervals(records).reduce((sum, s) => {
    const from = Math.max(s.start, dayStart);
    const to = Math.min(s.end, dayEnd);
    return sum + Math.max(0, to - from);
  }, 0);

  return Math.round(overlapMs / 60_000);
}
