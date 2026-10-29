import { describe, expect, it } from 'vitest';
import { dayGroupLabel, formatNumber } from '../src/ui/format';

describe('formatNumber（統計值顯示）', () => {
  it('null 顯示破折號', () => {
    expect(formatNumber(null)).toBe('—');
  });
  it('整數不帶小數點', () => {
    expect(formatNumber(360)).toBe('360');
  });
  it('浮點加總誤差修整到一位小數', () => {
    expect(formatNumber(360.70000000000005)).toBe('360.7');
  });
  it('有效小數保留', () => {
    expect(formatNumber(36.5)).toBe('36.5');
  });
  it('digits=0 四捨五入為整數', () => {
    expect(formatNumber(3999.5, 0)).toBe('4000');
  });
});

describe('dayGroupLabel（副食品列表的日期分組）', () => {
  const now = new Date(2026, 8, 19, 9, 0).getTime(); // 2026/9/19（六）
  it('今天、昨天', () => {
    expect(dayGroupLabel(new Date(2026, 8, 19, 0, 1).getTime(), now)).toBe('今天');
    expect(dayGroupLabel(new Date(2026, 8, 18, 23, 59).getTime(), now)).toBe('昨天');
  });
  it('更早的寫成月/日（星期）', () => {
    expect(dayGroupLabel(new Date(2026, 8, 17, 12).getTime(), now)).toBe('9/17（四）');
  });
});
