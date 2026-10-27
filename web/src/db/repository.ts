import { db } from './db';
import { mergeBabies, type BackupPayloadV2 } from '../logic/dataTransfer';
import { doseRecordKey, makeDoseRecord } from '../logic/vaccineLog';
import { startOfDay } from '../logic/vaccines';
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
    const vaccineDoses = merged.vaccineDoses ?? [];
    // 不再 clear 後重灌（有 outbox 會變成每一列都先刪再增）。bulkPut 遇到重複主鍵會靜默覆蓋，
    // 不像 bulkAdd 會 ConstraintError 而整個回滾，所以寫入前先自己檢查，維持「全進或全不進」。
    assertUniqueKeys(merged.profiles.map((p) => p.id), '寶寶 id');
    assertUniqueKeys(merged.records.map((r) => r.id), '記錄 id');
    assertUniqueKeys(vaccineDoses.map((d) => d.key), '接種紀錄 key');
    // mergeBabies 保留的本機列是同一個物件，只有新增或重對映的列才需要寫
    const isNew = <T>(rows: T[], localRows: T[]) => {
      const kept = new Set(localRows);
      return rows.filter((r) => !kept.has(r));
    };
    await db.profiles.bulkPut(isNew(merged.profiles, local.profiles));
    await db.records.bulkPut(isNew(merged.records, local.records));
    await db.vaccineDoses.bulkPut(isNew(vaccineDoses, local.vaccineDoses));
  });
}

function assertUniqueKeys(keys: string[], label: string): void {
  if (new Set(keys).size !== keys.length) throw new Error(`匯入資料有重複的 ${label}`);
}

/** 刪寶寶＋其全部記錄與接種紀錄（手動 cascade）。 */
export async function deleteBabyCascade(babyId: string): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
    await db.records.where('babyId').equals(babyId).delete();
    await db.vaccineDoses.where('babyId').equals(babyId).delete();
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
