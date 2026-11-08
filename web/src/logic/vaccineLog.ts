/**
 * 疫苗施打紀錄的純邏輯：不碰儲存、不碰畫面。
 *
 * 一筆紀錄 = 寶寶 + 疫苗 + 劑次 + 實際施打日期，key 由前三者組成，
 * 所以同一寶寶的同一劑只會有一筆。key 只存在本機、不寫進備份檔（見 dataTransfer）。
 */
import {
  VACCINES, doseDate, dosesFor, startOfDay, type ScheduledDose, type Vaccine, type VaccineBrands,
} from './vaccines';

export interface VaccineDoseRecord {
  key: string;
  babyId: string;
  vaccineId: string;
  doseLabel: string;
  /** 實際施打日期，當地日期 00:00 */
  date: number;
}

/** babyId 一律小寫：iOS 匯出的 UUID 是大寫，兩邊要對得上。 */
export function doseRecordKey(babyId: string, vaccineId: string, doseLabel: string): string {
  return `${babyId.toLowerCase()}|${vaccineId}|${doseLabel}`;
}

/**
 * 組出一筆紀錄。**不動 date**：切到當地 00:00 只發生在使用者輸入的那一刻
 * （見 repository.setVaccineDose），匯出匯入一律原值進出，
 * 否則跨時區解碼會把日期推移一天。
 */
export function makeDoseRecord(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
  date: number,
): VaccineDoseRecord {
  return {
    key: doseRecordKey(babyId, vaccineId, doseLabel),
    babyId: babyId.toLowerCase(),
    vaccineId,
    doseLabel,
    date,
  };
}

export function doneMap(records: VaccineDoseRecord[]): Map<string, number> {
  return new Map(records.map((r) => [r.key, r.date]));
}

/** 接種日早於今天、又沒有施打紀錄的劑次，依月齡由小到大（同月齡維持疫苗定義順序）。 */
export function overdueDoses(
  birthDate: number,
  now: number,
  babyId: string,
  done: Map<string, number>,
  vaccines: Vaccine[] = VACCINES,
  brands: VaccineBrands = {},
): ScheduledDose[] {
  const today = startOfDay(now);
  const out: ScheduledDose[] = [];
  for (const vaccine of vaccines) {
    for (const dose of dosesFor(vaccine, brands)) {
      if (startOfDay(doseDate(birthDate, dose.ageMonths)) >= today) continue;
      if (done.has(doseRecordKey(babyId, vaccine.id, dose.label))) continue;
      out.push({ vaccine, dose });
    }
  }
  // Array.prototype.sort 在現代 JS 是穩定排序，同月齡會保持推入順序。
  return out.sort((a, b) => a.dose.ageMonths - b.dose.ageMonths);
}

/**
 * 有施打紀錄、但目前廠牌（或還沒選廠牌）的劑次裡沒有的劑次標籤，依各廠牌劑次的先後排列。
 * 例：記過輪狀第三劑後改選羅特律，第三劑就不會出現在清單上；資料還在，畫面要提示。
 */
export function hiddenDoseLabels(
  vaccine: Vaccine,
  brands: VaccineBrands,
  babyId: string,
  done: Map<string, number>,
): string[] {
  if (!vaccine.brands) return [];
  const shown = new Set(dosesFor(vaccine, brands).map((d) => d.label));
  const all = [...vaccine.doses, ...vaccine.brands.flatMap((b) => b.doses)].map((d) => d.label);
  return [...new Set(all)].filter((label) => !shown.has(label) && done.has(doseRecordKey(babyId, vaccine.id, label)));
}
