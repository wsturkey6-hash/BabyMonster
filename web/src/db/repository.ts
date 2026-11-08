import { db } from './db';
import { mergeBabies, type BackupPayloadV2 } from '../logic/dataTransfer';
import { doseRecordKey, makeDoseRecord } from '../logic/vaccineLog';
import { startOfDay } from '../logic/vaccines';
import { makeFoodMark, type FoodRecord, type FoodStatus } from '../logic/foodLog';
import type { ProfileData } from '../logic/types';
import type { BrandedVaccineId, VaccineBrands } from 'shared/validateEntity';

export async function allData(): Promise<BackupPayloadV2> {
  return {
    profiles: await db.profiles.toArray(),
    records: await db.records.toArray(),
    vaccineDoses: await db.vaccineDoses.toArray(),
    foodRecords: await db.foodRecords.toArray(),
    foodMarks: await db.foodMarks.toArray(),
  };
}

/** 匯入合併：單一 transaction，任何失敗全回滾。 */
export async function importMerge(incoming: BackupPayloadV2): Promise<void> {
  const tables = [db.profiles, db.records, db.vaccineDoses, db.foodRecords, db.foodMarks];
  await db.transaction('rw', tables, async () => {
    const local = {
      profiles: await db.profiles.toArray(),
      records: await db.records.toArray(),
      vaccineDoses: await db.vaccineDoses.toArray(),
      foodRecords: await db.foodRecords.toArray(),
      foodMarks: await db.foodMarks.toArray(),
    };
    const merged = mergeBabies(local, incoming);
    const vaccineDoses = merged.vaccineDoses ?? [];
    const foodRecords = merged.foodRecords ?? [];
    const foodMarks = merged.foodMarks ?? [];
    // 不再 clear 後重灌（有 outbox 會變成每一列都先刪再增）。bulkPut 遇到重複主鍵會靜默覆蓋，
    // 不像 bulkAdd 會 ConstraintError 而整個回滾，所以寫入前先自己檢查，維持「全進或全不進」。
    assertUniqueKeys(merged.profiles.map((p) => p.id), '寶寶 id');
    assertUniqueKeys(merged.records.map((r) => r.id), '記錄 id');
    assertUniqueKeys(vaccineDoses.map((d) => d.key), '接種紀錄 key');
    assertUniqueKeys(foodRecords.map((r) => r.id), '副食品紀錄 id');
    assertUniqueKeys(foodMarks.map((m) => m.key), '試敏標記 key');
    // mergeBabies 保留的本機列是同一個物件，只有新增或重對映的列才需要寫
    const isNew = <T>(rows: T[], localRows: T[]) => {
      const kept = new Set(localRows);
      return rows.filter((r) => !kept.has(r));
    };
    await db.profiles.bulkPut(isNew(merged.profiles, local.profiles));
    await db.records.bulkPut(isNew(merged.records, local.records));
    await db.vaccineDoses.bulkPut(isNew(vaccineDoses, local.vaccineDoses));
    await db.foodRecords.bulkPut(isNew(foodRecords, local.foodRecords));
    await db.foodMarks.bulkPut(isNew(foodMarks, local.foodMarks));
  });
}

function assertUniqueKeys(keys: string[], label: string): void {
  if (new Set(keys).size !== keys.length) throw new Error(`匯入資料有重複的 ${label}`);
}

/** 刪寶寶＋其全部記錄、接種紀錄與副食品資料（手動 cascade）。 */
export async function deleteBabyCascade(babyId: string): Promise<void> {
  const tables = [db.profiles, db.records, db.vaccineDoses, db.foodRecords, db.foodMarks];
  await db.transaction('rw', tables, async () => {
    await db.records.where('babyId').equals(babyId).delete();
    await db.vaccineDoses.where('babyId').equals(babyId).delete();
    await db.foodRecords.where('babyId').equals(babyId).delete();
    await db.foodMarks.where('babyId').equals(babyId).delete();
    await db.profiles.delete(babyId);
  });
}

/** 記錄某一劑的施打日期（同一劑重複寫入為覆蓋）。日期在這裡切到當地 00:00。 */
export async function setVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
  date: number,
): Promise<void> {
  await db.vaccineDoses.put(makeDoseRecord(babyId, vaccineId, doseLabel, startOfDay(date)));
}

/** 把某一劑改回「尚未施打」。 */
export async function clearVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
): Promise<void> {
  await db.vaccineDoses.delete(doseRecordKey(babyId, vaccineId, doseLabel));
}

/**
 * 設定或清除某支疫苗選用的廠牌（brandId 為 null 代表清除）。
 * 從已知鍵重新組出整個物件再 put：清除是刪掉鍵、絕不存 null，全空就整個欄位拿掉，
 * 不用 'vaccineBrands.xxx' 這種點號路徑。
 */
export async function setVaccineBrand<K extends BrandedVaccineId>(
  babyId: string,
  vaccineId: K,
  brandId: VaccineBrands[K] | null,
): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const p = await db.profiles.get(babyId);
    if (!p) return;
    const merged: VaccineBrands = { rotavirus: p.vaccineBrands?.rotavirus, ev71: p.vaccineBrands?.ev71 };
    merged[vaccineId] = brandId ?? undefined;
    const brands = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== undefined),
    ) as VaccineBrands;
    const { vaccineBrands: _old, ...rest } = p;
    await db.profiles.put(Object.keys(brands).length > 0 ? { ...rest, vaccineBrands: brands } : rest);
  });
}

/** 新增或修改一筆副食品紀錄。 */
export async function saveFoodRecord(record: FoodRecord): Promise<void> {
  await db.foodRecords.put(record);
}

export async function deleteFoodRecord(id: string): Promise<void> {
  await db.foodRecords.delete(id);
}

/** 在試敏表上手動設定食材狀態（同一食材重複寫入為覆蓋）。 */
export async function setFoodMarks(babyId: string, foods: readonly string[], status: FoodStatus): Promise<void> {
  await db.foodMarks.bulkPut(foods.map((f) => makeFoodMark(babyId, f, status)));
}

/** 無寶寶時自動建立的預設寶寶（名字 BabyMonster、生日 = 今天）。 */
export async function createDefaultBaby(): Promise<ProfileData> {
  const t = new Date();
  const p: ProfileData = {
    id: crypto.randomUUID(),
    name: 'BabyMonster',
    birthDate: new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(),
  };
  await db.profiles.add(p);
  return p;
}

/** 解析當前寶寶：存的 id 找不到 → 第一個寶寶；沒寶寶 → null。 */
export function resolveCurrentBaby(
  profiles: ProfileData[],
  storedId: string | null,
): ProfileData | null {
  return profiles.find((p) => p.id === storedId) ?? profiles[0] ?? null;
}

const CURRENT_BABY_KEY = 'currentBabyId';

export function loadCurrentBabyId(): string | null {
  return localStorage.getItem(CURRENT_BABY_KEY);
}

export function saveCurrentBabyId(id: string): void {
  localStorage.setItem(CURRENT_BABY_KEY, id);
}
