/** 量的多寡刻度，大便量與小便量共用（wire 值 few/medium/many 與 iOS StoolAmount 相同）。 */
export type Amount = 'few' | 'medium' | 'many';

export const AMOUNT_NAMES: Record<Amount, string> = {
  few: '少',
  medium: '中',
  many: '多',
};

/** 睡眠以事件記錄：入睡一筆、起床一筆，配對後才算出時長。 */
export type SleepEvent = 'start' | 'end';

export const SLEEP_EVENT_NAMES: Record<SleepEvent, string> = {
  start: '😴 入睡',
  end: '☀️ 起床',
};

export type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const BRISTOL_NAMES: Record<BristolType, string> = {
  1: '第1型：一顆顆硬塊（難排出）',
  2: '第2型：香腸狀但結塊',
  3: '第3型：香腸狀，表面有裂痕',
  4: '第4型：香腸/蛇狀，光滑柔軟（理想）',
  5: '第5型：柔軟塊狀，邊緣清楚',
  6: '第6型：蓬鬆糊狀，邊緣不規則',
  7: '第7型：水狀，無固體塊（腹瀉）',
};

export interface ProfileData {
  id: string; // UUID
  name: string;
  birthDate: number; // epoch ms
}

export interface RecordData {
  id: string; // UUID
  babyId: string; // UUID
  timestamp: number; // epoch ms
  feedAmount?: number; // ml
  stoolColor?: number; // 1–9
  stoolAmount?: Amount;
  stoolShape?: BristolType;
  hasUrine: boolean;
  urineAmount?: Amount; // 只有 hasUrine 為 true 時才有意義
  sleep?: SleepEvent;
  temperature?: number; // °C
  weight?: number; // g
  note?: string;
}
