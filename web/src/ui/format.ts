export const pad2 = (n: number) => String(n).padStart(2, '0');

export function ymdCompact(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export function dateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function msFromDateInput(v: string): number {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function datetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  return `${dateInputValue(ms)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function msFromDatetimeLocal(v: string): number {
  return new Date(v).getTime();
}

export function timeHM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 統計值顯示：null → 破折號；捨入到 digits 位並去掉多餘的 .0（避免浮點加總誤差）。 */
export function formatNumber(v: number | null, digits = 1): string {
  if (v === null) return '—';
  return v.toFixed(digits).replace(/\.0$/, '');
}

export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
