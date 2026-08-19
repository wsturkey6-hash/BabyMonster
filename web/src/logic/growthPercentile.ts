import { GROWTH_DAY_MAX, growthTable } from './growthReference.generated';
import type { Sex } from './types';

export type { Sex };

/** 有 WHO 參考標準的三個生長指標。 */
export type GrowthMetric = 'weight' | 'height' | 'headCirc';

export const GROWTH_METRICS: GrowthMetric[] = ['weight', 'height', 'headCirc'];

export const GROWTH_METRIC_NAMES: Record<GrowthMetric, string> = {
  weight: '體重',
  height: '身高',
  headCirc: '頭圍',
};

/** WHO 表的單位：體重 kg、身高與頭圍 cm。記錄裡的體重存 g，取用前要換算。 */
export const GROWTH_METRIC_UNITS: Record<GrowthMetric, string> = {
  weight: 'kg',
  height: 'cm',
  headCirc: 'cm',
};

export interface Lms {
  L: number;
  M: number;
  S: number;
}

/** 取得某指標／性別在指定年齡（天）的 LMS。超出 0…GROWTH_DAY_MAX 回傳 null。 */
export function lmsFor(metric: GrowthMetric, sex: Sex, ageDays: number): Lms | null {
  if (!Number.isFinite(ageDays)) return null;
  const day = Math.floor(ageDays);
  if (day < 0 || day > GROWTH_DAY_MAX) return null;
  const t = growthTable(`${metric}|${sex}`);
  if (!t) return null;
  return { L: t.L[day], M: t.M[day], S: t.S[day] };
}

/** L 幾乎為 0 時改走對數分支，避免 1/L 爆掉。 */
const L_IS_ZERO = 1e-12;

/** 由 Z 分數反推測量值 —— 畫 P3/P15/P50/P85/P97 參考曲線就是用這個。 */
export function valueAtZ(lms: Lms, z: number): number {
  const { L, M, S } = lms;
  if (Math.abs(L) < L_IS_ZERO) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** 由測量值算 Z 分數。 */
export function zScore(lms: Lms, value: number): number {
  const { L, M, S } = lms;
  if (Math.abs(L) < L_IS_ZERO) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

// ---- 常態分布 ----
//
// erfc 用不完全 Gamma 函數的級數／連分數展開（Numerical Recipes 的 gser/gcf），
// 精度接近機器極限。Swift 那邊直接用 Foundation 內建的 erfc，兩者都準到
// 1e-15 等級，因此必然吻合 —— 這比兩平台共用同一個低精度近似式可靠得多。

/** ln Γ(1/2) = ln √π。只需要 a = 1/2 這一個值，所以不必寫通用的 lgamma。 */
const LN_GAMMA_HALF = 0.5723649429247001;
const TINY = 1e-300;
const EPS = 1e-17;

/** 正則化不完全 Gamma 函數 Q(1/2, x)，x ≥ 0。 */
function gammaQHalf(x: number): number {
  const prefix = Math.exp(-x + 0.5 * Math.log(x) - LN_GAMMA_HALF);
  if (x < 1.5) {
    // 級數展開求 P(a,x)，再取 1 − P
    let ap = 0.5;
    let sum = 1 / 0.5;
    let del = sum;
    for (let n = 0; n < 300; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return 1 - sum * prefix;
  }
  // 連分數（修正版 Lentz 演算法）直接求 Q(a,x)
  let b = x + 0.5;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - 0.5);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return prefix * h;
}

export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === 0) return 1;
  const q = gammaQHalf(x * x);
  return x > 0 ? q : 2 - q;
}

/** 標準常態累積分布函數 Φ(z)。 */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  return 0.5 * erfc(-z / Math.SQRT2);
}

// ---- 對外主要 API ----

export interface PercentileResult {
  z: number;
  /** 0–100 */
  percentile: number;
  /** |Z| > 3 時標記，讓 UI 顯示「< 0.1」／「> 99.9」而不是假精確的數字 */
  beyond: 'low' | 'high' | null;
}

export function growthPercentile(
  metric: GrowthMetric,
  sex: Sex,
  ageDays: number,
  value: number,
): PercentileResult | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const lms = lmsFor(metric, sex, ageDays);
  if (!lms) return null;
  const z = zScore(lms, value);
  if (!Number.isFinite(z)) return null;
  return {
    z,
    percentile: normalCdf(z) * 100,
    beyond: z < -3 ? 'low' : z > 3 ? 'high' : null,
  };
}

/**
 * 足歲天數（以日曆日計，不看時分）。
 * WHO 參考表就是以「天」為索引，所以這是最貼近資料來源的算法。
 * 測量早於生日時回傳負數，由呼叫端排除。
 */
export function ageInDays(birthMs: number, atMs: number): number {
  if (!Number.isFinite(birthMs) || !Number.isFinite(atMs)) return NaN;
  const b = new Date(birthMs);
  const a = new Date(atMs);
  const bStart = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  const aStart = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  // round 而非 floor：吸收 DST 造成的 ±1 小時（與 babyAge 一致）
  return Math.round((aStart - bStart) / 86_400_000);
}
