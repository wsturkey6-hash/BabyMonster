import { db } from './db';
import { mergeBabies, type BackupPayloadV2 } from '../logic/dataTransfer';
import { doseRecordKey, makeDoseRecord } from '../logic/vaccineLog';
import type { ProfileData } from '../logic/types';

export async function allData(): Promise<BackupPayloadV2> {
  return {
    profiles: await db.profiles.toArray(),
    records: await db.records.toArray(),
    vaccineDoses: await db.vaccineDoses.toArray(),
  };
}

/** 匯入合併：單一 transaction，任何失敗全回滾。 */
export async function importMerge(incoming: BackupPayloadV2): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
    const local = {
      profiles: await db.profiles.toArray(),
      records: await db.records.toArray(),
      vaccineDoses: await db.vaccineDoses.toArray(),
    };
    const merged = mergeBabies(local, incoming);
    await db.profiles.clear();
    await db.records.clear();
    await db.vaccineDoses.clear();
    await db.profiles.bulkAdd(merged.profiles);
    await db.records.bulkAdd(merged.records);
    await db.vaccineDoses.bulkAdd(merged.vaccineDoses ?? []);
  });
}

/** 刪寶寶＋其全部記錄與接種紀錄（手動 cascade）。 */
export async function deleteBabyCascade(babyId: string): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
    await db.records.where('babyId').equals(babyId).delete();
    await db.vaccineDoses.where('babyId').equals(babyId).delete();
    await db.profiles.delete(babyId);
  });
}

/** 記錄某一劑的施打日期（同一劑重複寫入為覆蓋）。 */
export async function setVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
  date: number,
): Promise<void> {
  await db.vaccineDoses.put(makeDoseRecord(babyId, vaccineId, doseLabel, date));
}

/** 把某一劑改回「尚未施打」。 */
export async function clearVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
): Promise<void> {
  await db.vaccineDoses.delete(doseRecordKey(babyId, vaccineId, doseLabel));
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
