import Dexie, { type Table } from 'dexie';
import { db as defaultDb, type BabyDB, type EntityKind, type OutboxRow } from '../db/db';
import { skipOutboxInCurrentTransaction } from '../db/outboxMiddleware';

const BATCH = 500;
// 伺服器在 parse 之前就擋 2 MB，所以只限筆數不夠：500 筆各帶一段接近上限的備註
// （2000 字中文 ≈ 6 KB）就會組出一個過大的 body，而每一輪都會重建同一個 body、
// 每一輪都被回 413，從此永久停擺。留 0.5 MB 餘裕給外框與多位元組字元。
const MAX_PUSH_BYTES = 1_500_000;
const BYTES = new TextEncoder();
// 迴圈上限：正常情況下每輪都有實質進展（送出或拉到東西）會自然結束；這只是保險，
// 撞到就乾淨地結束這一輪，下次觸發再繼續，不丟錯也不卡死。
const MAX_ROUNDS = 50;

export interface Change {
  kind: EntityKind;
  id: string;
  op: 'put' | 'delete';
  data?: OutboxRow['data'];
  updatedAt: number;
}

/**
 * POST /api/sync 的請求本體。
 * clientNow 是送出請求當下這支手機的 Date.now()：伺服器用 skew = serverNow - clientNow
 * 把每筆 updatedAt 平移到伺服器的時間軸，再做範圍檢查、LWW 比較與儲存，兩支手機才是用同一個時鐘比較。
 * 編輯時間與送出時間都來自同一支手機的 Date.now()，所以離線好幾個小時才送出也能正確平移；
 * 因此它必須在送出時取，不能在寫入時取。
 */
export interface SyncRequest {
  cursor: number;
  changes: Change[];
  clientNow: number;
}

export interface ServerChange {
  kind: EntityKind;
  id: string;
  deleted: boolean;
  data?: OutboxRow['data'];
  updatedAt: number;
  seq: number;
}

export interface SyncResponse {
  /**
   * 契約：必須等於這批 changes 裡最大的 seq（空批次則帶原 cursor），不可是全域最大 seq。
   * 客戶端不信任它：實際存的 cursor 不會超過這批真正收到的最大 seq，也不會倒退。
   */
  cursor: number;
  changes: ServerChange[];
  /**
   * 伺服器對每筆上傳的處理結果；applied: false 代表輸給 LWW 或被拒絕，不是錯誤但資料沒寫進去。
   * reason 只是參考資訊，客戶端不依它分流：'stale' 是輸給較新的版本；贏家只有在伺服器拒絕時把它的 seq 推到最新才會再經由 changes 送回來（見 ackSent），這是對伺服器的要求，不是協定自然保證；'invalid' 是永遠寫不進去，正常使用下不該出現（時間已由伺服器平移，內容長度由 UI 擋住），出現就是程式錯誤。
   * 沒帶 reason 一律當 'stale'。
   */
  results?: { kind: EntityKind; id: string; applied: boolean; reason?: 'stale' | 'invalid' }[];
  /** 還有下一批可拉 */
  more?: boolean;
}

/** 存取控管的 session 過期時回的是導向登入頁的 HTML，不是 JSON。 */
export class NeedsLoginError extends Error {
  constructor() {
    super('Access session expired');
    this.name = 'NeedsLoginError';
  }
}

/** 伺服器有回應、但回 4xx：請求本身有問題（我們自己的 bug），不是伺服器掛了，也不是使用者的錯。 */
export class RequestError extends Error {
  constructor(readonly status: number) {
    super(`同步請求被拒絕（HTTP ${status}）`);
    this.name = 'RequestError';
  }
}

async function stateValue(db: BabyDB, k: string): Promise<number | undefined> {
  return (await db.syncState.get(k))?.v;
}

function tableOf(db: BabyDB, kind: EntityKind) {
  return kind === 'profile' ? db.profiles : kind === 'record' ? db.records : db.vaccineDoses;
}

/**
 * 套用伺服器傳回的變更。整批在同一個 transaction 內：
 * 先看 outbox 再寫，所以「本機還有未上傳的變更」的實體一定略過（本機優先，下一輪才會上傳）。
 * cursor 只推進到第一筆被略過的變更之前：伺服器只送 seq 大於 cursor 的變更，
 * 越過略過的那筆就永遠收不到它，等本機變更送出後兩支手機會停在不同版本。
 * 回傳這次真正推進了 cursor 的套用筆數（不含略過的、也不含 cursor 沒越過而會被重送的），給 syncOnce 判斷進展：伺服器有送東西回來不等於我們套用了東西。
 */
export async function applyRemote(db: BabyDB, changes: ServerChange[], cursor: number): Promise<number> {
  // Dexie 的巢狀 transaction 沿用外層的 idbtrans，標記會落在呼叫者的 transaction 上，
  // 讓它之後的每一筆本機寫入都不進 outbox（靜默遺失），所以寧可直接丟錯
  if (Dexie.currentTransaction) throw new Error('applyRemote 不可在 transaction 內呼叫');
  return db.transaction('rw', [db.profiles, db.records, db.vaccineDoses, db.outbox, db.syncState], async () => {
    skipOutboxInCurrentTransaction();
    const applied: number[] = [];
    const stored = (await db.syncState.get('cursor'))?.v ?? 0;
    const sorted = [...changes].sort((a, b) => a.seq - b.seq);
    // 不信任伺服器的 cursor：超過這批實際收到的最大 seq，就會永遠跳過中間沒送來的變更
    let next = sorted.length ? Math.min(cursor, sorted[sorted.length - 1].seq) : stored;
    for (const c of sorted) {
      if (await db.outbox.get([c.kind, c.id])) {
        next = Math.min(next, c.seq - 1);
        continue;
      }
      const table = tableOf(db, c.kind) as Table<unknown, string>;
      if (c.deleted) await table.delete(c.id);
      else if (c.data) await table.put(c.data);
      else {
        // 沒帶 data 的 put 什麼也沒寫。cursor 要跟著停在它之前，否則這一筆就被永久跳過、
        // 伺服器再也不會重送——那正是「游標越過沒套用的變更」這個最早的災難。
        // 合規的伺服器不會送出這種列（data 只有墓碑才是空的），純粹是保險。
        next = Math.min(next, c.seq - 1);
        continue;
      }
      applied.push(c.seq);
    }
    const final = Math.max(stored, next); // 永不倒退
    await db.syncState.put({ k: 'cursor', v: final });
    // 只算 cursor 已越過的：停在略過那筆之前的 cursor 之後，伺服器下一輪還會重送排在它後面的變更
    //（內容雖然已寫入，卻是同一批重複套用），那不是新進展，算進去一樣會空轉到 MAX_ROUNDS
    return applied.filter((seq) => seq > stored && seq <= final).length;
  });
}

/**
 * 刪掉已送出的列，但只刪 seq 沒變的：上傳期間又被改過的列 seq 較大，要留給下一輪。
 * 伺服器回報沒寫入、且原因不是 stale 的列（invalid）要留著：丟掉的話本機留著新值、
 * 另一支手機與伺服器留著舊值，outbox 清空、沒有任何警告，永久分歧。留著的代價是
 * 一段有界、看得到的停擺（狀態列會說同步出了問題），資料不會掉；對寶寶的健康紀錄，寧可看得到也不要無聲。
 * stale 的列照丟（輸了就是輸了），但只在伺服器配合時才安全：伺服器必須在拒絕時把贏家的 seq 推到最新（資料不變），
 * 否則贏家的 seq 若已落在輸家的 cursor 之後就永遠不會再送來，輸家永久停在自己輸掉的版本。
 * 回傳實際刪掉幾列，給 syncOnce 判斷這一輪有沒有進展。
 */
async function ackSent(db: BabyDB, sent: OutboxRow[], results: SyncResponse['results']): Promise<number> {
  const keep = new Set(
    (results ?? []).filter((r) => !r.applied && (r.reason ?? 'stale') !== 'stale').map((r) => `${r.kind}/${r.id}`),
  );
  let acked = 0;
  await db.transaction('rw', db.outbox, async () => {
    for (const r of sent) {
      if (keep.has(`${r.kind}/${r.id}`)) continue;
      const cur = await db.outbox.get([r.kind, r.id]);
      if (cur && cur.seq === r.seq) {
        await db.outbox.delete([r.kind, r.id]);
        acked++;
      }
    }
  });
  return acked;
}

/**
 * 同步直到沒有待上傳的變更、也沒有下一批，或這一輪沒有任何進展（沒刪掉任何列、沒套用任何遠端變更、伺服器也沒寫入）。
 * 後者是留著 invalid 列時的出口：outbox 永遠不空，不停下來就會空轉到 MAX_ROUNDS。
 * 回傳 skipped（這次被伺服器略過的筆數）與 kept（因為被拒收而留在 outbox 的筆數）。
 * 判斷「有沒有出問題」要看 kept，不能看 outbox 是否非空：使用者在同步進行中按儲存
 * 也會讓 outbox 非空，那是正常的。
 */
export async function syncOnce(
  db: BabyDB = defaultDb,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<{ skipped: number; kept: number }> {
  let skipped = 0;
  // 因為被拒收而留在 outbox 的筆數。不能用「同步完 outbox 還有東西」來判斷有沒有出問題：
  // 使用者在同步進行中按儲存也會讓 outbox 非空，那是完全正常的，不該對他顯示錯誤。
  let kept = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const queued = await db.outbox.orderBy('seq').limit(BATCH).toArray();
    const cursor = (await stateValue(db, 'cursor')) ?? 0;
    // 每一輪各取一次，夾擠與請求裡的 clientNow 必須是同一個值
    const clientNow = Date.now();
    // 夾到 min(updatedAt, clientNow)：使用者在時鐘偏快時編輯、同步前才把時間修正回來，
    // 那些 updatedAt 相對伺服器會變成未來，超過容許範圍就被拒收（invalid）。夾擠後永遠不會落在未來。
    // 代價是有界的順序誤差：被夾的編輯等於是「送出當下才做的」，可能贏過另一支手機在離線期間做的編輯，
    // 這是收斂後的覆蓋（lost update），不是永久分歧，寧可如此。
    const sent: OutboxRow[] = [];
    const changes: Change[] = [];
    let pushBytes = 0;
    for (const row of queued) {
      const c: Change = {
        kind: row.kind,
        id: row.id,
        op: row.op,
        ...(row.data ? { data: row.data } : {}),
        updatedAt: Math.min(row.updatedAt, clientNow),
      };
      const size = BYTES.encode(JSON.stringify(c)).length + 1; // +1 是陣列裡的逗號
      // 第一筆無論多大都照送：單筆 data 上限 64 KB 遠低於 body 上限，所以一定送得出去，
      // 不會變成「連一筆都送不動」的死結。送不完的留到下一輪，outbox 非空會讓迴圈繼續。
      if (changes.length > 0 && pushBytes + size > MAX_PUSH_BYTES) break;
      pushBytes += size;
      sent.push(row);
      changes.push(c);
    }

    const res = await fetchFn('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cursor, changes, clientNow } satisfies SyncRequest),
    });
    if (!res.headers.get('content-type')?.includes('application/json')) throw new NeedsLoginError();
    if (res.status >= 400 && res.status < 500) throw new RequestError(res.status);
    if (!res.ok) throw new Error(`同步失敗（HTTP ${res.status}）`);
    const body = (await res.json()) as SyncResponse;

    for (const r of body.results ?? []) {
      if (r.applied) continue;
      skipped++;
      // invalid 在正常使用下不該出現；留一行給開發者查，不對使用者承諾什麼
      if ((r.reason ?? 'stale') !== 'stale') {
        kept++;
        console.error(`同步被伺服器拒收（${r.reason}）：${r.kind}/${r.id}`);
      }
    }
    const acked = await ackSent(db, sent, body.results);
    const appliedRemote = await applyRemote(db, body.changes, body.cursor);
    // 進展看實際做了什麼，不看收到多少：被留著的列會讓 applyRemote 一直略過同一筆遠端變更並把 cursor 停在原地，
    // 伺服器每輪都重送同一批；若以「有回傳 changes」當進展，就會空轉到 MAX_ROUNDS 且永遠不收斂
    const progressed = acked > 0 || appliedRemote > 0 || (body.results ?? []).some((r) => r.applied);
    const done = !body.more && (await db.outbox.count()) === 0;
    // 沒進展的一輪不能寫 lastSync：留著被拒收的列時，DB 裡的時間會在下次啟動被讀回去，
    // 狀態卡就會顯示「上次同步：剛剛；待上傳 1 筆」，對一筆永遠送不出去的列謊報。
    // 乾淨結束（沒東西可送也沒下一批）本身就是一次成功的同步，照寫
    if (progressed || done) await db.syncState.put({ k: 'lastSync', v: Date.now() });

    if (done) return { skipped, kept };
    if (!progressed) break;
  }
  return { skipped, kept };
}
