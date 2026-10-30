/**
 * 寶寶資料的欄位驗證，web（備份檔、同步）與伺服器共用同一份規則。
 *
 * 零依賴：伺服器直接 import 這個檔案，不能牽進 web 的任何東西。
 * 時間欄位的格式不同（備份檔是 ISO 8601 字串、同步協定是 epoch ms），
 * 所以時間解析由呼叫端以 ParseTime 傳入，其餘規則兩邊完全一樣。
 */

// 型別刻意與 web/src/logic/types.ts、vaccineLog.ts 結構相同（那邊的值可直接賦給這邊）。
export type Amount = 'few' | 'medium' | 'many';
export type SleepEvent = 'start' | 'end';
export type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Sex = 'male' | 'female';

export interface ProfileData {
  id: string;
  name: string;
  birthDate: number;
  sex?: Sex;
}

export interface RecordData {
  id: string;
  babyId: string;
  timestamp: number;
  feedAmount?: number;
  stoolColor?: number;
  stoolAmount?: Amount;
  stoolShape?: BristolType;
  hasUrine: boolean;
  urineAmount?: Amount;
  sleep?: SleepEvent;
  temperature?: number;
  weight?: number;
  height?: number;
  headCircumference?: number;
  note?: string;
}

export interface VaccineDoseRecord {
  key: string;
  babyId: string;
  vaccineId: string;
  doseLabel: string;
  date: number;
}

export type FoodUnit = '匙' | 'ml' | 'g';
export type Reaction = '紅疹' | '腹瀉' | '嘔吐' | '便秘' | '脹氣';
export type FoodStatus = 'untried' | 'tried' | 'reaction';

export interface FoodRecord {
  id: string;
  babyId: string;
  timestamp: number;
  foods: string[];
  firstFoods: string[];
  amount?: { value: number; unit: FoodUnit };
  reactions: Reaction[];
  note?: string;
}

export interface FoodMark {
  key: string;
  babyId: string;
  food: string;
  status: FoodStatus;
}

export type EntityKind = 'profile' | 'record' | 'vaccineDose' | 'foodRecord' | 'foodMark';
export type Entity = ProfileData | RecordData | VaccineDoseRecord | FoodRecord | FoodMark;

export type ParseTime = (v: unknown, where: string, field: string) => number;

type Raw = Record<string, unknown>;

export const ENTITY_KINDS: readonly EntityKind[] = ['profile', 'record', 'vaccineDose', 'foodRecord', 'foodMark'];
const KINDS: readonly string[] = ENTITY_KINDS;
export const FOOD_UNITS: readonly FoodUnit[] = ['匙', 'ml', 'g'];
export const REACTIONS: readonly Reaction[] = ['紅疹', '腹瀉', '嘔吐', '便秘', '脹氣'];
const FOOD_STATUSES: readonly string[] = ['untried', 'tried', 'reaction'];
const AMOUNTS: readonly string[] = ['few', 'medium', 'many'];
const SLEEP_EVENTS: readonly string[] = ['start', 'end'];
const SEXES: readonly string[] = ['male', 'female'];

// 長度與數值上限：擋掉會一路傳到另一支手機、再進圖表運算的離譜值（例如 weight: 1e308）。
const MAX_ID = 200;
export const MAX_NAME = 200;
export const MAX_NOTE = 2000; // UI 的 maxLength 也用這些常數，才不會產生伺服器永遠拒收的列
export const MAX_FOOD_NAME = 20;
const MAX_FOODS_PER_RECORD = 50;
const MAX_FOOD_AMOUNT = 10_000;
const RANGES = {
  temperature: [20, 50], // °C
  weight: [0, 200_000], // g
  height: [0, 300], // cm
  headCircumference: [0, 150], // cm
} as const;

// updatedAt 的容許範圍：往前 10 年（手機久未連線）、往後 5 分鐘（時鐘誤差）。
const MAX_PAST_MS = 10 * 365.25 * 24 * 3600 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

function fail(where: string, msg: string): never {
  throw new Error(`${where}：${msg}`);
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** 同步協定的 ParseTime：epoch 毫秒，必須是 JS Date 可表示的有限數字。 */
export const parseEpochMs: ParseTime = (v, where, field) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 8.64e15) fail(where, `${field} 不是有效的時間`);
  return v;
};

/**
 * LWW 以 updatedAt 大者勝，所以一筆 updatedAt = 8.64e15 的刪除會成為任何正常編輯都蓋不掉的墓碑，
 * 並同步到兩支手機。手機時鐘錯誤或秒/毫秒單位搞混就會產生，因此寫入前一律擋掉。
 * 在伺服器上執行，且在 updatedAt 已依 clientNow 平移到伺服器時間軸之後：範圍對的是伺服器的 now，與手機時鐘快慢無關。
 */
export function assertSyncTimestamp(updatedAt: unknown, now: number): number {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) throw new Error('updatedAt 不是有效的時間');
  if (updatedAt < now - MAX_PAST_MS || updatedAt > now + MAX_FUTURE_MS) throw new Error('updatedAt 超出合理範圍');
  return updatedAt;
}

function reqId(v: unknown, where: string, field: string): string {
  if (typeof v !== 'string' || v === '') fail(where, `缺少 ${field}`);
  if (v.length > MAX_ID) fail(where, `${field} 超過 ${MAX_ID} 字`);
  return v;
}

function optAmount(o: Raw, key: string, where: string): Amount | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !AMOUNTS.includes(v)) fail(where, `${key} 不合法`);
  return v as Amount;
}

function optNumber(o: Raw, key: string, where: string): number | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `${key} 不是數字`);
  return v;
}

function optRanged(o: Raw, key: keyof typeof RANGES, where: string): number | undefined {
  const v = optNumber(o, key, where);
  const [min, max] = RANGES[key];
  if (v !== undefined && (v < min || v > max)) fail(where, `${key} 需介於 ${min}–${max}`);
  return v;
}

export function validateProfile(raw: unknown, where: string, parseTime: ParseTime): ProfileData {
  if (raw === null || typeof raw !== 'object') fail(where, '寶寶資料不是物件');
  const o = raw as Raw;
  const id = reqId(o.id, where, 'id');
  if (typeof o.name !== 'string') fail(where, '缺少名字');
  if (o.name.length > MAX_NAME) fail(where, `名字超過 ${MAX_NAME} 字`);
  const sex = o.sex === undefined || o.sex === null ? undefined : o.sex;
  if (sex !== undefined && (typeof sex !== 'string' || !SEXES.includes(sex))) fail(where, 'sex 不合法');
  return stripUndefined({
    id: id.toLowerCase(),
    name: o.name,
    birthDate: parseTime(o.birthDate, where, 'birthDate'),
    sex: sex as Sex | undefined,
  }) as ProfileData;
}

export function validateRecord(
  raw: unknown,
  where: string,
  parseTime: ParseTime,
  forcedBabyId?: string,
): RecordData {
  if (raw === null || typeof raw !== 'object') fail(where, '記錄不是物件');
  const o = raw as Raw;
  const id = reqId(o.id, where, 'id');
  const babyId = reqId(forcedBabyId ?? o.babyId, where, 'babyId').toLowerCase();
  if (typeof o.hasUrine !== 'boolean') fail(where, '缺少 hasUrine');

  const stoolColor = optNumber(o, 'stoolColor', where);
  if (stoolColor !== undefined && (!Number.isInteger(stoolColor) || stoolColor < 1 || stoolColor > 9))
    fail(where, 'stoolColor 需為 1–9');
  const stoolShape = optNumber(o, 'stoolShape', where);
  if (stoolShape !== undefined && (!Number.isInteger(stoolShape) || stoolShape < 1 || stoolShape > 7))
    fail(where, 'stoolShape 需為 1–7');
  const stoolAmount = optAmount(o, 'stoolAmount', where);
  const urineAmount = optAmount(o, 'urineAmount', where);
  const sleep = o.sleep === undefined || o.sleep === null ? undefined : o.sleep;
  if (sleep !== undefined && (typeof sleep !== 'string' || !SLEEP_EVENTS.includes(sleep)))
    fail(where, 'sleep 不合法');
  const note = o.note === undefined || o.note === null ? undefined : o.note;
  if (note !== undefined && typeof note !== 'string') fail(where, 'note 不是字串');
  if (note !== undefined && note.length > MAX_NOTE) fail(where, `note 超過 ${MAX_NOTE} 字`);

  return stripUndefined({
    id: id.toLowerCase(),
    babyId,
    timestamp: parseTime(o.timestamp, where, 'timestamp'),
    feedAmount: optNumber(o, 'feedAmount', where),
    stoolColor,
    stoolAmount,
    stoolShape: stoolShape as BristolType | undefined,
    hasUrine: o.hasUrine,
    urineAmount,
    sleep: sleep as SleepEvent | undefined,
    temperature: optRanged(o, 'temperature', where),
    weight: optRanged(o, 'weight', where),
    height: optRanged(o, 'height', where),
    headCircumference: optRanged(o, 'headCircumference', where),
    note,
  }) as RecordData;
}

/** 與 web 的 doseRecordKey 同一個格式（web 的測試會互相對照）。 */
function doseKey(babyId: string, vaccineId: string, doseLabel: string): string {
  return `${babyId.toLowerCase()}|${vaccineId}|${doseLabel}`;
}

export function validateDose(raw: unknown, where: string, parseTime: ParseTime): VaccineDoseRecord {
  if (raw === null || typeof raw !== 'object') fail(where, '接種紀錄不是物件');
  const o = raw as Raw;
  const babyId = reqId(o.babyId, where, 'babyId').toLowerCase();
  const vaccineId = reqId(o.vaccineId, where, 'vaccineId');
  const doseLabel = reqId(o.doseLabel, where, 'doseLabel');
  return {
    key: doseKey(babyId, vaccineId, doseLabel),
    babyId,
    vaccineId,
    doseLabel,
    date: parseTime(o.date, where, 'date'),
  };
}

/** 與 web 的 foodMarkKey 同一個格式。食材名稱不可含 |，key 才拆得回來。 */
function foodKey(babyId: string, food: string): string {
  return `${babyId.toLowerCase()}|${food}`;
}

function foodName(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(where, '食材名稱是空的');
  if (v !== v.trim()) fail(where, '食材名稱前後有空白');
  if (v.length > MAX_FOOD_NAME) fail(where, `食材名稱超過 ${MAX_FOOD_NAME} 字`);
  if (v.includes('|')) fail(where, '食材名稱不可含 |');
  return v;
}

function uniqueList<T extends string>(v: unknown, where: string, field: string, each: (x: unknown) => T): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(where, `${field} 不是陣列`);
  const out = v.map(each);
  if (new Set(out).size !== out.length) fail(where, `${field} 有重複`);
  return out;
}

export function validateFoodRecord(raw: unknown, where: string, parseTime: ParseTime): FoodRecord {
  if (raw === null || typeof raw !== 'object') fail(where, '副食品紀錄不是物件');
  const o = raw as Raw;
  const id = reqId(o.id, where, 'id');
  const babyId = reqId(o.babyId, where, 'babyId').toLowerCase();
  if (o.foods === undefined || o.foods === null) fail(where, '缺少食材');
  const foods = uniqueList(o.foods, where, 'foods', (x) => foodName(x, where));
  if (foods.length === 0) fail(where, '缺少食材');
  if (foods.length > MAX_FOODS_PER_RECORD) fail(where, `食材超過 ${MAX_FOODS_PER_RECORD} 項`);
  const firstFoods = uniqueList(o.firstFoods, where, 'firstFoods', (x) => foodName(x, where));
  if (firstFoods.some((f) => !foods.includes(f))) fail(where, 'firstFoods 必須是 foods 的一部分');
  const reactions = uniqueList(o.reactions, where, 'reactions', (x) => {
    if (typeof x !== 'string' || !(REACTIONS as readonly string[]).includes(x)) fail(where, 'reactions 不合法');
    return x as Reaction;
  });

  let amount: FoodRecord['amount'];
  if (o.amount !== undefined && o.amount !== null) {
    if (typeof o.amount !== 'object') fail(where, 'amount 不是物件');
    const a = o.amount as Raw;
    if (typeof a.value !== 'number' || !Number.isFinite(a.value) || a.value <= 0 || a.value > MAX_FOOD_AMOUNT)
      fail(where, `amount.value 需介於 0–${MAX_FOOD_AMOUNT}`);
    if (typeof a.unit !== 'string' || !(FOOD_UNITS as readonly string[]).includes(a.unit)) fail(where, 'amount.unit 不合法');
    amount = { value: a.value, unit: a.unit as FoodUnit };
  }
  const note = o.note === undefined || o.note === null ? undefined : o.note;
  if (note !== undefined && typeof note !== 'string') fail(where, 'note 不是字串');
  if (note !== undefined && note.length > MAX_NOTE) fail(where, `note 超過 ${MAX_NOTE} 字`);

  return stripUndefined({
    id: id.toLowerCase(),
    babyId,
    timestamp: parseTime(o.timestamp, where, 'timestamp'),
    foods,
    firstFoods,
    amount,
    reactions,
    note,
  }) as FoodRecord;
}

export function validateFoodMark(raw: unknown, where: string): FoodMark {
  if (raw === null || typeof raw !== 'object') fail(where, '試敏標記不是物件');
  const o = raw as Raw;
  const babyId = reqId(o.babyId, where, 'babyId').toLowerCase();
  const food = foodName(o.food, where);
  if (typeof o.status !== 'string' || !FOOD_STATUSES.includes(o.status)) fail(where, 'status 不合法');
  return { key: foodKey(babyId, food), babyId, food, status: o.status as FoodStatus };
}

/** 同步的單筆變更入口：除了欄位規則，還要求變更的 id 與資料自己的 id 一致。 */
export function validateEntity(
  kind: unknown,
  id: unknown,
  data: unknown,
  parseTime: ParseTime,
): Entity {
  if (typeof kind !== 'string' || !KINDS.includes(kind)) fail('變更', 'kind 不合法');
  const where = `${kind} ${String(id).slice(0, 40)}`;
  if (typeof id !== 'string') fail(where, 'id 不是字串');

  if (kind === 'vaccineDose') {
    const parts = id.split('|');
    if (parts.length !== 3 || parts.some((p) => p === '')) fail(where, 'id 需為 babyId|vaccineId|doseLabel');
    const dose = validateDose(data, where, parseTime);
    if (dose.key !== id) fail(where, 'id 與資料不一致');
    return dose;
  }
  if (kind === 'foodMark') {
    const mark = validateFoodMark(data, where);
    if (mark.key !== id) fail(where, 'id 與資料不一致');
    return mark;
  }
  if (kind === 'foodRecord') {
    const rec = validateFoodRecord(data, where, parseTime);
    if (rec.id !== id) fail(where, 'id 需等於資料 id 的小寫');
    return rec;
  }
  const entity =
    kind === 'profile' ? validateProfile(data, where, parseTime) : validateRecord(data, where, parseTime);
  if (entity.id !== id) fail(where, 'id 需等於資料 id 的小寫');
  return entity;
}
