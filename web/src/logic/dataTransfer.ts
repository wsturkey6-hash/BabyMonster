import type { BristolType, ProfileData, RecordData, StoolAmount } from './types';

export interface BackupPayloadV2 {
  profiles: ProfileData[];
  records: RecordData[];
}

// ---- ISO 8601（相容性關鍵：Swift JSONDecoder(.iso8601) 不接受毫秒） ----

export function isoFromMs(ms: number): string {
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
  const wire = {
    version: 2,
    profiles: p.profiles.map((x) => ({ id: x.id, name: x.name, birthDate: isoFromMs(x.birthDate) })),
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
        temperature: r.temperature,
        weight: r.weight,
        note: r.note,
      }),
    ),
  };
  return JSON.stringify(sortKeysDeep(wire), null, 2);
}

// ---- decode + 驗證（整檔拒絕） ----

type Raw = Record<string, unknown>;

const STOOL_AMOUNTS: readonly string[] = ['few', 'medium', 'many'];

function fail(where: string, msg: string): never {
  throw new Error(`${where}：${msg}`);
}

function parseProfile(raw: unknown, where: string): ProfileData {
  if (raw === null || typeof raw !== 'object') fail(where, '寶寶資料不是物件');
  const o = raw as Raw;
  if (typeof o.id !== 'string' || o.id === '') fail(where, '缺少 id');
  if (typeof o.name !== 'string') fail(where, '缺少名字');
  return { id: o.id, name: o.name, birthDate: msFromIso(o.birthDate as string) };
}

function optNumber(o: Raw, key: string, where: string): number | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `${key} 不是數字`);
  return v;
}

function parseRecord(raw: unknown, where: string, forcedBabyId?: string): RecordData {
  if (raw === null || typeof raw !== 'object') fail(where, '記錄不是物件');
  const o = raw as Raw;
  if (typeof o.id !== 'string' || o.id === '') fail(where, '缺少 id');
  const babyId = forcedBabyId ?? o.babyId;
  if (typeof babyId !== 'string' || babyId === '') fail(where, '缺少 babyId');
  if (typeof o.hasUrine !== 'boolean') fail(where, '缺少 hasUrine');

  const stoolColor = optNumber(o, 'stoolColor', where);
  if (stoolColor !== undefined && (!Number.isInteger(stoolColor) || stoolColor < 1 || stoolColor > 9))
    fail(where, 'stoolColor 需為 1–9');
  const stoolShape = optNumber(o, 'stoolShape', where);
  if (stoolShape !== undefined && (!Number.isInteger(stoolShape) || stoolShape < 1 || stoolShape > 7))
    fail(where, 'stoolShape 需為 1–7');
  const stoolAmount = o.stoolAmount === undefined || o.stoolAmount === null ? undefined : o.stoolAmount;
  if (stoolAmount !== undefined && (typeof stoolAmount !== 'string' || !STOOL_AMOUNTS.includes(stoolAmount)))
    fail(where, 'stoolAmount 不合法');
  const note = o.note === undefined || o.note === null ? undefined : o.note;
  if (note !== undefined && typeof note !== 'string') fail(where, 'note 不是字串');

  return stripUndefined({
    id: o.id,
    babyId,
    timestamp: msFromIso(o.timestamp as string),
    feedAmount: optNumber(o, 'feedAmount', where),
    stoolColor,
    stoolAmount: stoolAmount as StoolAmount | undefined,
    stoolShape: stoolShape as BristolType | undefined,
    hasUrine: o.hasUrine,
    temperature: optNumber(o, 'temperature', where),
    weight: optNumber(o, 'weight', where),
    note,
  }) as RecordData;
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
    const profiles = o.profiles.map((p, i) => parseProfile(p, `第 ${i + 1} 個寶寶`));
    const records = o.records.map((r, i) => parseRecord(r, `第 ${i + 1} 筆記錄`));
    return { profiles, records };
  }

  if (o.profile !== undefined && Array.isArray(o.records)) {
    // v1（現行 iOS 匯出檔）：單一 profile 無 id → 產生新 id，records 全綁定
    const p = o.profile as Raw;
    if (p === null || typeof p !== 'object' || typeof p.name !== 'string')
      throw new Error('v1 寶寶資料不合法');
    const profile: ProfileData = {
      id: crypto.randomUUID(),
      name: p.name,
      birthDate: msFromIso(p.birthDate as string),
    };
    const records = o.records.map((r, i) => parseRecord(r, `第 ${i + 1} 筆記錄`, profile.id));
    return { profiles: [profile], records };
  }

  throw new Error('無法辨識的備份檔格式');
}

// ---- 匯入合併（規則見 spec §7.3–7.4） ----

export function mergeBabies(local: BackupPayloadV2, incoming: BackupPayloadV2): BackupPayloadV2 {
  const profiles = [...local.profiles];
  const remap = new Map<string, string>(); // incoming babyId -> local babyId

  for (const p of incoming.profiles) {
    if (profiles.some((x) => x.id === p.id)) continue; // id 對中：保留本機
    const byName = profiles.find((x) => x.name === p.name);
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
  return { profiles, records };
}
