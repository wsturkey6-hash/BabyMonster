/**
 * POST /api/sync 的協定核心（設計文件 §4、§4.1）。純函式層：拿到已經 parse 好的 body，
 * 自己不碰 HTTP、不碰 header、不寫 log。
 *
 * 型別以 web/src/sync/sync.ts 的 SyncRequest / SyncResponse / Change / ServerChange 為準，
 * 那支客戶端已經上線，不能為了伺服器改它。
 */
import { ENTITY_KINDS, assertSyncTimestamp, parseEpochMs, validateEntity } from '../../shared/validateEntity';
import type { EntityRow, Store } from './store';

/** 一次請求最多推 500 筆（客戶端的批次大小），拉 1000 筆，單筆 data 上限 64 KB。 */
export const MAX_CHANGES = 500;
export const PULL_LIMIT = 1000;
export const MAX_DATA_BYTES = 64 * 1024;

const KINDS: readonly string[] = ENTITY_KINDS;
/**
 * 沒帶 kinds 的舊版客戶端只認得這三種。它的 tableOf() 把其他種類一律當成接種紀錄，
 * 收到副食品資料會寫壞自己的接種紀錄表，所以絕不能送給它。
 */
const LEGACY_KINDS: readonly string[] = ['profile', 'record', 'vaccineDose'];
const MAX_ID = 200;

export interface Result {
  kind: unknown;
  id: unknown;
  applied: boolean;
  reason?: 'stale' | 'invalid';
}

export interface ServerChange {
  kind: string;
  id: string;
  deleted: boolean;
  data?: unknown;
  updatedAt: number;
  seq: number;
}

export interface SyncResponse {
  cursor: number;
  changes: ServerChange[];
  results: Result[];
  more: boolean;
}

export interface Counts {
  pushed: number;
  applied: number;
  skipped: number;
  pulled: number;
  more: boolean;
}

export type SyncOutcome =
  | { ok: true; response: SyncResponse; counts: Counts }
  /** 結構性錯誤 → HTTP 400。單筆資料的問題一律走 results[]，不在這裡。 */
  | { ok: false; message: string };

interface Prepared {
  kind: string;
  id: string;
  json: string | null;
  deleted: boolean;
  updatedAt: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 一筆變更的驗證，全部在 updatedAt 已經平移到伺服器時間軸之後才做。
 * 任何不合法都丟例外，由呼叫端轉成 { applied: false, reason: 'invalid' }。
 *
 * 存進 DB 的是 validateEntity 回傳的正規化物件，不是原始 data：驗證函式是照明確的欄位清單
 * 重建物件，所以 __proto__、constructor 這些沒列出來的 key 會自然消失。
 */
function prepare(raw: unknown, skew: number, serverNow: number): Prepared {
  if (!isObject(raw)) throw new Error('變更不是物件');
  if (typeof raw.kind !== 'string' || !KINDS.includes(raw.kind)) throw new Error('kind 不合法');
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > MAX_ID) throw new Error('id 不合法');
  if (raw.op !== 'put' && raw.op !== 'delete') throw new Error('op 不合法');

  const sent = parseEpochMs(raw.updatedAt, '變更', 'updatedAt');
  const updatedAt = assertSyncTimestamp(sent + skew, serverNow);

  if (raw.op === 'delete') {
    return { kind: raw.kind, id: raw.id, json: null, deleted: true, updatedAt };
  }
  const normalized = validateEntity(raw.kind, raw.id, raw.data, parseEpochMs);
  const json = JSON.stringify(normalized);
  if (Buffer.byteLength(json, 'utf8') > MAX_DATA_BYTES) throw new Error('data 超過 64 KB');
  return { kind: raw.kind, id: raw.id, json, deleted: false, updatedAt };
}

function toServerChange(r: EntityRow): ServerChange {
  const out: ServerChange = {
    kind: r.kind,
    id: r.id,
    deleted: r.deleted !== 0,
    updatedAt: r.updated_at,
    seq: r.seq,
  };
  // 墓碑不帶 data（客戶端看到沒 data 的 put 會停住 cursor，所以非墓碑一定要帶）
  if (r.data !== null) out.data = JSON.parse(r.data);
  return out;
}

/**
 * 處理一次同步。
 *
 * 0. 先算一次 skew = serverNow - clientNow，每一筆 updatedAt 都換成 updatedAt + skew，
 *    之後的範圍檢查、LWW 比較與寫入的 updated_at 全部只用平移後的值。不夾擠、不因 skew 太大就拒收：
 *    客戶端因此完全不需要知道自己的時鐘是對的，「伺服器永遠不會收」那一類問題也就不存在了。
 * 1. 逐筆處理，每一筆都有自己的 results[]；單筆有問題不會擋住同一批的其他 499 筆。
 * 2. 輸掉 LWW 時把贏家那一列的 seq 推到最新（資料不動）。這條必做：回應只帶 seq > cursor 的列，
 *    輸家若早就拉過贏家，游標已經越過它，不重新宣告贏家就永遠送不到，兩支手機永久無聲不一致。
 * 3. 回傳的 cursor 等於這一批最大的 seq，不是全域最大。
 */
export function applySync(
  store: Store,
  body: unknown,
  serverNow: number,
  updatedBy: string | null,
): SyncOutcome {
  if (!isObject(body)) return { ok: false, message: '請求本體不是物件' };
  const { cursor, changes, clientNow, kinds } = body;
  if (!Array.isArray(changes)) return { ok: false, message: 'changes 必須是陣列' };
  if (changes.length > MAX_CHANGES) return { ok: false, message: `changes 一次最多 ${MAX_CHANGES} 筆` };
  if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor < 0) {
    return { ok: false, message: 'cursor 必須是非負數字' };
  }
  if (typeof clientNow !== 'number' || !Number.isFinite(clientNow)) {
    return { ok: false, message: 'clientNow 必須是數字' };
  }

  if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some((k) => typeof k !== 'string'))) {
    return { ok: false, message: 'kinds 必須是字串陣列' };
  }
  const accepted: readonly string[] = kinds ?? LEGACY_KINDS;

  const skew = serverNow - clientNow;
  const results: Result[] = [];
  let applied = 0;

  const rows = store.transaction(() => {
    for (const raw of changes) {
      // kind/id 原樣回報：客戶端是用 `${kind}/${id}` 對照 outbox 的，對不上就會把這一列當成已處理而刪掉
      const echo = isObject(raw) ? { kind: raw.kind, id: raw.id } : { kind: undefined, id: undefined };
      let p: Prepared;
      try {
        p = prepare(raw, skew, serverNow);
      } catch {
        // 例外訊息裡會有 id 等內容，不往 log 送
        results.push({ ...echo, applied: false, reason: 'invalid' });
        continue;
      }
      const cur = store.get(p.kind, p.id);
      if (cur !== undefined && p.updatedAt < cur.updated_at) {
        store.bumpSeq(p.kind, p.id, store.nextSeq());
        results.push({ kind: p.kind, id: p.id, applied: false, reason: 'stale' });
        continue;
      }
      // 時間相同時後到的贏（>=），刪除寫成墓碑而不是真的刪掉那一列
      store.write({
        kind: p.kind,
        id: p.id,
        json: p.json,
        deleted: p.deleted,
        updatedAt: p.updatedAt,
        updatedBy,
        seq: store.nextSeq(),
        receivedAt: serverNow,
      });
      results.push({ kind: p.kind, id: p.id, applied: true });
      applied++;
    }
    // 多抓一筆用來判斷還有沒有下一批
    return store.since(cursor, PULL_LIMIT + 1);
  });

  const more = rows.length > PULL_LIMIT;
  const page = more ? rows.slice(0, PULL_LIMIT) : rows;
  const outCursor = page.length > 0 ? page[page.length - 1].seq : cursor;
  // 游標照樣越過沒送出的種類：客戶端本來就收不了，等它升級後會自己從 0 重拉一次
  const sent = page.filter((r) => accepted.includes(r.kind));

  return {
    ok: true,
    response: { cursor: outCursor, changes: sent.map(toServerChange), results, more },
    counts: { pushed: changes.length, applied, skipped: changes.length - applied, pulled: sent.length, more },
  };
}
