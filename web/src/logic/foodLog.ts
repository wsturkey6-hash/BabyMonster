/**
 * 副食品紀錄與試敏標記的純邏輯：不碰儲存、不碰畫面。規則照 babyfoodie 的 SPEC.md。
 *
 * 食材狀態：有手動標記就用手動標記（手動選「未嘗試」也會蓋過紀錄）；
 * 否則只要有任何紀錄含這個食材就是「已嘗試」。
 */
import type { FoodMark, FoodRecord, FoodStatus } from 'shared/validateEntity';
import { MAX_FOOD_NAME } from 'shared/validateEntity';
import { isCatalogFood } from './foods';

export type { FoodMark, FoodRecord, FoodStatus, FoodUnit, Reaction } from 'shared/validateEntity';
export { FOOD_UNITS, MAX_FOOD_NAME, REACTIONS } from 'shared/validateEntity';

export const FOOD_STATUS_NAMES: Record<FoodStatus, string> = {
  untried: '未嘗試',
  tried: '已嘗試',
  reaction: '有反應',
};

/** 與 shared/validateEntity 的 foodKey 同一個格式（伺服器用它檢查 id）。 */
export function foodMarkKey(babyId: string, food: string): string {
  return `${babyId.toLowerCase()}|${food}`;
}

export function makeFoodMark(babyId: string, food: string, status: FoodStatus): FoodMark {
  return { key: foodMarkKey(babyId, food), babyId: babyId.toLowerCase(), food, status };
}

/** 食材名稱 → 手動標記。只放同一個寶寶的標記。 */
export type MarksByFood = ReadonlyMap<string, FoodStatus>;

export function marksByFood(marks: readonly FoodMark[]): MarksByFood {
  return new Map(marks.map((m) => [m.food, m.status]));
}

export function foodStatus(food: string, records: readonly FoodRecord[], marks: MarksByFood): FoodStatus {
  const mark = marks.get(food);
  if (mark) return mark;
  return records.some((r) => r.foods.includes(food)) ? 'tried' : 'untried';
}

/**
 * 存檔當下哪些食材算「第一次」。修改既有紀錄時：原本就標第一次、這次還在的照留；
 * 這次新加進來的，排除這筆本身之後還是「未嘗試」才算。
 */
export function computeFirstFoods(
  foods: readonly string[],
  records: readonly FoodRecord[],
  marks: MarksByFood,
  existing?: FoodRecord,
): string[] {
  if (!existing) return foods.filter((f) => foodStatus(f, records, marks) === 'untried');
  const others = records.filter((r) => r.id !== existing.id);
  const kept = existing.firstFoods.filter((f) => foods.includes(f));
  const added = foods.filter((f) => !existing.foods.includes(f) && foodStatus(f, others, marks) === 'untried');
  return [...kept, ...added];
}

/** 新到舊；同時間的不保證順序。 */
export function sortFoodRecords(records: readonly FoodRecord[]): FoodRecord[] {
  return [...records].sort((a, b) => b.timestamp - a.timestamp);
}

/** 最近吃過的食材（新到舊、不重複），給填寫表單的快選列。 */
export function recentFoods(records: readonly FoodRecord[], limit = 8): string[] {
  const out: string[] = [];
  for (const r of sortFoodRecords(records)) {
    for (const f of r.foods) {
      if (out.includes(f)) continue;
      out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * 試敏表「其他」區：紀錄或標記裡出現過、但不在 118 項清單裡的名稱。
 * 不另外存清單（設計文件 §4.3）。有紀錄的依第一次出現的時間排，只有標記的接在後面依名稱排。
 */
export function customFoods(records: readonly FoodRecord[], marks: readonly FoodMark[]): string[] {
  const firstSeen = new Map<string, number>();
  for (const r of records) {
    for (const f of r.foods) {
      if (isCatalogFood(f)) continue;
      const t = firstSeen.get(f);
      if (t === undefined || r.timestamp < t) firstSeen.set(f, r.timestamp);
    }
  }
  const fromRecords = [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
    .map(([f]) => f);
  const markOnly = marks
    .map((m) => m.food)
    .filter((f) => !isCatalogFood(f) && !firstSeen.has(f))
    .sort();
  return [...fromRecords, ...markOnly];
}

/**
 * 有勾反應時，存檔後要詢問哪些食材標成「有反應」：只列出還不是「有反應」的，
 * 預設勾選這次第一次吃的。records 是存檔後的紀錄（含這一筆）。
 */
export function reactionCandidates(
  record: FoodRecord,
  records: readonly FoodRecord[],
  marks: MarksByFood,
): { food: string; checked: boolean }[] {
  if (record.reactions.length === 0) return [];
  return record.foods
    .filter((f) => foodStatus(f, records, marks) !== 'reaction')
    .map((f) => ({ food: f, checked: record.firstFoods.includes(f) }));
}

/** 使用者輸入的自訂食材名稱：去頭尾空白、連續空白合一、拿掉 |（key 的分隔符號），截到上限。 */
export function normalizeFoodName(text: string): string {
  return text.replace(/\|/g, '').trim().replace(/\s+/g, ' ').slice(0, MAX_FOOD_NAME).trim();
}
