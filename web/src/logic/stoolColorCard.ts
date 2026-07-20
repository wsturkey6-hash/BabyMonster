export const STOOL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。 */
export function isAbnormalStoolColor(n: number): boolean {
  return n >= 1 && n <= 6;
}

/** 近似色，依實體大便卡照片取樣（實體卡為最終判讀依據）。 */
const HEX: Record<number, string> = {
  1: '#f0e8d1', // 淡奶油白
  2: '#eaddc8', // 淺米灰
  3: '#f4e4bd', // 奶油黃
  4: '#ece289', // 淺亮黃
  5: '#e9d2a0', // 淺卡其
  6: '#f1e3d3', // 淡粉白
  7: '#f3c42d', // 金黃
  8: '#e8a01d', // 橘黃
  9: '#a5a233', // 黃綠
};

export function stoolColorHex(n: number): string {
  return HEX[n] ?? '#999999';
}

/** 實卡九色皆為中亮色，黑字對比全數 ≥ 4.5:1。 */
export function stoolTextHex(_n: number): string {
  return '#000000';
}

export function stoolLabel(n: number): string {
  return `${n} 號（${isAbnormalStoolColor(n) ? '異常' : '正常'}）`;
}
