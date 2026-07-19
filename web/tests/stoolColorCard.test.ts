import { describe, expect, it } from 'vitest';
import {
  STOOL_NUMBERS,
  isAbnormalStoolColor,
  stoolColorHex,
  stoolLabel,
  stoolTextHex,
} from '../src/logic/stoolColorCard';

describe('stoolColorCard', () => {
  it('1–6 號為異常、7–9 號正常（邊界 6/7）', () => {
    expect(isAbnormalStoolColor(1)).toBe(true);
    expect(isAbnormalStoolColor(6)).toBe(true);
    expect(isAbnormalStoolColor(7)).toBe(false);
    expect(isAbnormalStoolColor(9)).toBe(false);
  });

  it('九個號碼都有色碼', () => {
    expect(STOOL_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of STOOL_NUMBERS) {
      expect(stoolColorHex(n)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('標籤含異常/正常字樣', () => {
    expect(stoolLabel(3)).toBe('3 號（異常）');
    expect(stoolLabel(8)).toBe('8 號（正常）');
  });

  it('深色卡（8、9）用白字，其餘黑字', () => {
    expect(stoolTextHex(8)).toBe('#ffffff');
    expect(stoolTextHex(9)).toBe('#ffffff');
    expect(stoolTextHex(7)).toBe('#000000');
  });
});
