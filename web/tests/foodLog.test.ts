import { describe, expect, it } from 'vitest';
import { FOOD_GROUPS, FOOD_NUMBERS, currentMonthGroup, isCatalogFood } from '../src/logic/foods';
import {
  computeFirstFoods, customFoods, foodStatus, makeFoodMark, marksByFood, normalizeFoodName,
  reactionCandidates, recentFoods, type FoodRecord,
} from '../src/logic/foodLog';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const rec = (id: string, ts: number, foods: string[], extra: Partial<FoodRecord> = {}): FoodRecord => ({
  id, babyId: A, timestamp: ts, foods, firstFoods: [], reactions: [], ...extra,
});
const noMarks = marksByFood([]);

describe('試敏表清單', () => {
  it('共 118 項、名稱不重複', () => {
    const names = FOOD_GROUPS.flatMap((g) => g.items.map(([, n]) => n));
    expect(names).toHaveLength(118);
    expect(new Set(names).size).toBe(118);
    expect(FOOD_NUMBERS.size).toBe(118);
  });

  it('各月份項數與 babyfoodie SPEC.md 一致', () => {
    expect(FOOD_GROUPS.map((g) => [g.month, g.items.length])).toEqual([
      [4, 34], [5, 9], [6, 14], [7, 26], [8, 12], [9, 9], [10, 14],
    ]);
  });

  it('同一個月內依編號排列，保留原本就重複與跳過的編號', () => {
    for (const g of FOOD_GROUPS) {
      const nos = g.items.map(([no]) => no);
      expect(nos).toEqual([...nos].sort((a, b) => a - b));
    }
    expect(FOOD_GROUPS[0].items.filter(([no]) => no === 26).map(([, n]) => n)).toEqual(['白蘿蔔', '葡萄', '馬鈴薯']);
    const all = new Set(FOOD_NUMBERS.values());
    for (const skipped of [47, 78, 85, 86]) expect(all.has(skipped)).toBe(false);
    expect(isCatalogFood('青菜')).toBe(false); // 籠統名稱已刪除
    expect(FOOD_NUMBERS.get('瓠瓜')).toBe(57);
  });

  it('目前月齡對應的區：未滿 4 個月不標，10 個月以上標 10', () => {
    expect(currentMonthGroup(3)).toBeNull();
    expect(currentMonthGroup(4)).toBe(4);
    expect(currentMonthGroup(9)).toBe(9);
    expect(currentMonthGroup(15)).toBe(10);
  });
});

describe('食材狀態', () => {
  it('有紀錄就是已嘗試，沒有就是未嘗試', () => {
    const records = [rec('r1', 1, ['米湯'])];
    expect(foodStatus('米湯', records, noMarks)).toBe('tried');
    expect(foodStatus('香蕉', records, noMarks)).toBe('untried');
  });

  it('手動標記優先，連「未嘗試」也會蓋過紀錄', () => {
    const records = [rec('r1', 1, ['米湯', '香蕉'])];
    const marks = marksByFood([makeFoodMark(A, '米湯', 'untried'), makeFoodMark(A, '香蕉', 'reaction')]);
    expect(foodStatus('米湯', records, marks)).toBe('untried');
    expect(foodStatus('香蕉', records, marks)).toBe('reaction');
  });

  it('紀錄刪掉、又沒有標記時變回未嘗試', () => {
    expect(foodStatus('米湯', [], noMarks)).toBe('untried');
  });
});

describe('第一次', () => {
  it('新紀錄：存檔前還是未嘗試的才算；手動標過已嘗試的不算', () => {
    const marks = marksByFood([makeFoodMark(A, '蘋果', 'tried')]);
    expect(computeFirstFoods(['米湯', '香蕉', '蘋果'], [rec('r1', 1, ['米湯'])], marks)).toEqual(['香蕉']);
  });

  it('修改：原本標第一次的保留；新加的排除這筆本身再判斷', () => {
    const existing = rec('r2', 2, ['香蕉'], { firstFoods: ['香蕉'] });
    const records = [rec('r1', 1, ['米湯']), existing];
    expect(computeFirstFoods(['香蕉', '米湯', '蘋果'], records, noMarks, existing)).toEqual(['香蕉', '蘋果']);
    expect(computeFirstFoods(['米湯'], records, noMarks, existing)).toEqual([]);
  });
});

describe('快選與自訂食材', () => {
  it('最近吃過：新到舊、不重複、有上限', () => {
    const records = [rec('r1', 1, ['米湯', '香蕉']), rec('r2', 3, ['蘋果', '米湯']), rec('r3', 2, ['梨子'])];
    expect(recentFoods(records)).toEqual(['蘋果', '米湯', '梨子', '香蕉']);
    expect(recentFoods(records, 2)).toEqual(['蘋果', '米湯']);
  });

  it('其他區：只列清單外的名稱，依第一次出現排，只有標記的接在後面', () => {
    const records = [rec('r1', 5, ['米湯', '鮭魚']), rec('r2', 1, ['南瓜泥']), rec('r3', 9, ['鮭魚'])];
    const marks = [makeFoodMark(A, '優格', 'tried'), makeFoodMark(A, '米湯', 'reaction'), makeFoodMark(A, '鮭魚', 'reaction')];
    expect(customFoods(records, marks)).toEqual(['南瓜泥', '鮭魚', '優格']);
  });

  it('自訂食材名稱正規化', () => {
    expect(normalizeFoodName('  南瓜   泥 ')).toBe('南瓜 泥');
    expect(normalizeFoodName('a|b')).toBe('ab');
    expect(normalizeFoodName('x'.repeat(30))).toHaveLength(20);
  });
});

describe('有反應時的詢問', () => {
  it('沒有勾反應就不問', () => {
    expect(reactionCandidates(rec('r1', 1, ['米湯']), [], noMarks)).toEqual([]);
  });

  it('只列還不是「有反應」的食材，預設勾這次第一次吃的', () => {
    const r = rec('r1', 1, ['米湯', '香蕉', '蘋果'], { firstFoods: ['香蕉'], reactions: ['紅疹'] });
    const marks = marksByFood([makeFoodMark(A, '蘋果', 'reaction')]);
    expect(reactionCandidates(r, [r], marks)).toEqual([
      { food: '米湯', checked: false },
      { food: '香蕉', checked: true },
    ]);
  });
});
