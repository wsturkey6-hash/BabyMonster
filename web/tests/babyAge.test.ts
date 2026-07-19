import { describe, expect, it } from 'vitest';
import { ageDisplayText, babyAge } from '../src/logic/babyAge';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

describe('babyAge', () => {
  it('生日當天', () => {
    expect(babyAge(d(2026, 1, 15), d(2026, 1, 15))).toEqual({ years: 0, months: 0, days: 0 });
  });
  it('只有天數', () => {
    expect(babyAge(d(2026, 1, 1), d(2026, 1, 11))).toEqual({ years: 0, months: 0, days: 10 });
  });
  it('月又天', () => {
    expect(babyAge(d(2026, 1, 10), d(2026, 3, 15))).toEqual({ years: 0, months: 2, days: 5 });
  });
  it('跨月借位（1/31 → 3/1）', () => {
    const a = babyAge(d(2026, 1, 31), d(2026, 3, 1));
    expect(a.years).toBe(0);
    expect(a.months).toBe(1);
  });
  it('滿兩歲', () => {
    expect(babyAge(d(2024, 5, 20), d(2026, 7, 15))).toEqual({ years: 2, months: 1, days: 25 });
  });
  it('顯示文字', () => {
    expect(ageDisplayText({ years: 1, months: 2, days: 3 })).toBe('1 歲 2 個月又 3 天');
  });
  it('月底 clamp：1/31 → 2/28（非閏年）為滿 1 個月', () => {
    expect(babyAge(d(2026, 1, 31), d(2026, 2, 28))).toEqual({ years: 0, months: 1, days: 0 });
  });
  it('月底 clamp：3/31 → 4/30 為滿 1 個月', () => {
    expect(babyAge(d(2026, 3, 31), d(2026, 4, 30))).toEqual({ years: 0, months: 1, days: 0 });
  });
  it('asOf 早於生日 → 全 0', () => {
    expect(babyAge(d(2026, 5, 1), d(2026, 4, 30))).toEqual({ years: 0, months: 0, days: 0 });
  });
});
