import { validateDose, validateProfile, validateRecord, type ParseTime } from 'shared/validateEntity';
import type { ProfileData, RecordData } from './types';
import { makeDoseRecord, type VaccineDoseRecord } from './vaccineLog';

export interface BackupPayloadV2 {
  profiles: ProfileData[];
  records: RecordData[];
  /** 選填：舊檔沒有這一段。解碼後一律是陣列（可能為空）。 */
  vaccineDoses?: VaccineDoseRecord[];
}

// ---- ISO 8601（相容性關鍵：Swift JSONDecoder(.iso8601) 不接受毫秒） ----

export function isoFromMs(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error('無效的時間值');
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function msFromIso(iso: string): number {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) throw new Error(`無效的日期格式：${iso}`);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`無效的日期：${iso}`);
  return ms;
}

// ---- encode ----

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeysDeep(o[k])]));
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function encodeV2(p: BackupPayloadV2): string {
  const doses = p.vaccineDoses ?? [];
  const wire = {
    version: 2,
    profiles: p.profiles.map((x) =>
      stripUndefined({ id: x.id, name: x.name, birthDate: isoFromMs(x.birthDate), sex: x.sex }),
    ),
    records: p.records.map((r) =>
      stripUndefined({
        id: r.id,
        babyId: r.babyId,
        timestamp: isoFromMs(r.timestamp),
        feedAmount: r.feedAmount,
        stoolColor: r.stoolColor,
        stoolAmount: r.stoolAmount,
        stoolShape: r.stoolShape,
        hasUrine: r.hasUrine,
        urineAmount: r.urineAmount,
        sleep: r.sleep,
        temperature: r.temperature,
        weight: r.weight,
        height: r.height,
        headCircumference: r.headCircumference,
        note: r.note,
      }),
    ),
    // key 可從其他三個欄位推出，不寫進檔案。空陣列時整個鍵省略，
    // 讓還沒用這個功能的使用者匯出的檔案與舊版逐字節相同。
    ...(doses.length > 0
      ? {
          vaccineDoses: doses.map((d) => ({
            babyId: d.babyId,
            vaccineId: d.vaccineId,
            doseLabel: d.doseLabel,
            date: isoFromMs(d.date),
          })),
        }
      : {}),
  };
  return JSON.stringify(sortKeysDeep(wire), null, 2);
}

// ---- decode + 驗證（整檔拒絕） ----

type Raw = Record<string, unknown>;

// 欄位規則在 shared/validateEntity.ts（伺服器共用）；這裡只負責把 ISO 字串轉成毫秒。
const parseIso: ParseTime = (v) => msFromIso(v as string);

function parseVaccineDoses(raw: unknown): VaccineDoseRecord[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('接種紀錄不是陣列');
  return raw.map((d, i) => validateDose(d, `第 ${i + 1} 筆接種紀錄`, parseIso));
}

export function decodeAny(text: string): BackupPayloadV2 {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error('檔案不是有效的 JSON');
  }
  if (root === null || typeof root !== 'object') throw new Error('無法辨識的備份檔格式');
  const o = root as Raw;

  if (o.version === 2 && Array.isArray(o.profiles) && Array.isArray(o.records)) {
    const profiles = o.profiles.map((p, i) => validateProfile(p, `第 ${i + 1} 個寶寶`, parseIso));
    const records = o.records.map((r, i) => validateRecord(r, `第 ${i + 1} 筆記錄`, parseIso));
    return { profiles, records, vaccineDoses: parseVaccineDoses(o.vaccineDoses) };
  }

  if (o.profile !== undefined && Array.isArray(o.records)) {
    // v1（單寶寶 iOS 匯出檔）：records 全綁定該 profile。
    // 鏡射 iOS decodeIfPresent：檔內有 profile id 就保留，沒有才產生新 id。
    const p = o.profile as Raw;
    if (p === null || typeof p !== 'object' || typeof p.name !== 'string')
      throw new Error('v1 寶寶資料不合法');
    const profile: ProfileData = {
      id: typeof p.id === 'string' && p.id !== '' ? p.id.toLowerCase() : crypto.randomUUID(),
      name: p.name,
      birthDate: msFromIso(p.birthDate as string),
    };
    const records = o.records.map((r, i) => validateRecord(r, `第 ${i + 1} 筆記錄`, parseIso, profile.id));
    return { profiles: [profile], records, vaccineDoses: [] };
  }

  throw new Error('無法辨識的備份檔格式');
}

// ---- 匯入合併（規則見 spec §7.3–7.4） ----

export function mergeBabies(local: BackupPayloadV2, incoming: BackupPayloadV2): BackupPayloadV2 {
  const profiles = [...local.profiles];
  const remap = new Map<string, string>(); // incoming babyId -> local babyId

  for (const p of incoming.profiles) {
    if (local.profiles.some((x) => x.id === p.id)) continue; // id 對中：保留本機
    const byName = local.profiles.find((x) => x.name === p.name);
    if (byName) {
      remap.set(p.id, byName.id); // 名字對中：重對映
    } else {
      profiles.push(p); // 全新寶寶
    }
  }

  const byId = new Map<string, RecordData>();
  for (const r of incoming.records) {
    const mapped = remap.get(r.babyId);
    byId.set(r.id, mapped ? { ...r, babyId: mapped } : r);
  }
  for (const r of local.records) byId.set(r.id, r); // 本機覆蓋 incoming

  const records = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { profiles, records, vaccineDoses: mergeVaccineDoses(local, incoming, remap) };
}

/** key = babyId|vaccineId|劑次，所以依 key 排序等同 spec 要求的三層排序。 */
function mergeVaccineDoses(
  local: BackupPayloadV2,
  incoming: BackupPayloadV2,
  remap: Map<string, string>,
): VaccineDoseRecord[] {
  const byKey = new Map<string, VaccineDoseRecord>();
  for (const d of incoming.vaccineDoses ?? []) {
    const mapped = remap.get(d.babyId);
    const rec = mapped ? makeDoseRecord(mapped, d.vaccineId, d.doseLabel, d.date) : d;
    byKey.set(rec.key, rec);
  }
  for (const d of local.vaccineDoses ?? []) byKey.set(d.key, d); // 本機覆蓋 incoming
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
