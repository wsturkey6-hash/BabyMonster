export const STOOL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。 */
export function isAbnormalStoolColor(n: number): boolean {
  return n >= 1 && n <= 6;
}

/** 近似色（實體大便卡為最終判讀依據）。 */
const HEX: Record<number, string> = {
  1: '#e6e0cc', // 灰白/陶土
  2: '#ebe6c7', // 淺灰黃
  3: '#f2edbf', // 淺黃白
  4: '#f5e699', // 淡黃
  5: '#d9db8c', // 淺黃綠
  6: '#b3cc8c', // 淡綠
  7: '#e6b340', // 黃
  8: '#738c40', // 綠
  9: '#734d26', // 棕褐
};

export function stoolColorHex(n: number): string {
  return HEX[n] ?? '#999999';
}

/** 依卡片底色明暗選擇對比較佳的數字顏色。 */
export function stoolTextHex(n: number): string {
  return n === 8 || n === 9 ? '#ffffff' : '#000000';
}

export function stoolLabel(n: number): string {
  return `${n} 號（${isAbnormalStoolColor(n) ? '異常' : '正常'}）`;
}
