export interface BabyAge {
  years: number;
  months: number;
  days: number;
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** 語意對齊 Swift Calendar.dateComponents([.year,.month,.day]，from:to:)。 */
export function babyAge(birthMs: number, asOfMs: number): BabyAge {
  const b = new Date(birthMs);
  const a = new Date(asOfMs);

  let totalMonths = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (a.getDate() < b.getDate()) totalMonths -= 1;
  if (totalMonths < 0) return { years: 0, months: 0, days: 0 };

  const anchorY = b.getFullYear() + Math.floor((b.getMonth() + totalMonths) / 12);
  const anchorM = (b.getMonth() + totalMonths) % 12;
  const anchorD = Math.min(b.getDate(), daysInMonth(anchorY, anchorM)); // 月底 clamp
  const anchor = new Date(anchorY, anchorM, anchorD).getTime();
  const asOfStart = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  // round 而非 floor：吸收 DST 造成的 ±1 小時
  const days = Math.max(0, Math.round((asOfStart - anchor) / 86_400_000));

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days };
}

export function ageDisplayText(a: BabyAge): string {
  return `${a.years} 歲 ${a.months} 個月又 ${a.days} 天`;
}
