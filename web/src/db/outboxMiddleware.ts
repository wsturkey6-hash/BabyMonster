import Dexie from 'dexie';
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, Middleware } from 'dexie';
import type { EntityKind, OutboxRow } from './db';

const KINDS: Record<string, EntityKind> = {
  profiles: 'profile',
  records: 'record',
  vaccineDoses: 'vaccineDose',
  foodRecords: 'foodRecord',
  foodMarks: 'foodMark',
};

/**
 * 正在套用遠端資料的 transaction。用「每個 transaction 一個標記」而不是模組層級旗標：
 * 旗標會橫跨 await，套用途中使用者的本機寫入會被一起略過，那筆就永遠不會同步、之後還被伺服器的舊版蓋掉。
 * 鍵是 DBCore 收到的 req.trans（底層 IDBTransaction），與 Dexie.currentTransaction.idbtrans 是同一個物件。
 */
const remoteTrans = new WeakSet<object>();

/** 在 db.transaction 的回呼內呼叫：這個 transaction 的寫入不進 outbox。 */
export function skipOutboxInCurrentTransaction(): void {
  remoteTrans.add(Dexie.currentTransaction.idbtrans);
}

/** 這次寫入影響到哪些 key、各是 put（帶完整資料）還是 delete。 */
function touched(
  req: DBCoreMutateRequest,
  res: DBCoreMutateResponse,
  deletedRangeKeys: unknown[],
): { key: string; data?: unknown }[] {
  if (req.type === 'add' || req.type === 'put') {
    // 失敗的那幾筆沒寫進去，不能記（bulkAdd 遇到重複 key 時 failures 以序號為鍵）
    return req.values.flatMap((data, i) => (res.failures[i] ? [] : [{ key: String(res.results![i]), data }]));
  }
  const keys = req.type === 'delete' ? req.keys : deletedRangeKeys;
  return keys.map((key) => ({ key: String(key) }));
}

export const outboxMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'outbox',
  create(down) {
    return {
      ...down,
      // db.records.put() 開的 transaction 只含 records；不把 outbox / syncState 加進範圍就寫不進去
      transaction(stores, mode, options) {
        const hasData = stores.some((s) => s in KINDS);
        const scope = mode === 'readwrite' && hasData ? [...new Set([...stores, 'outbox', 'syncState'])] : stores;
        return down.transaction(scope, mode, options);
      },
      table(name) {
        const table = down.table(name);
        const kind = KINDS[name];
        if (!kind) return table;
        return { ...table, mutate: (req) => mutateAndRecord(down, table, kind, req) };
      },
    };
  },
};

function mutateAndRecord(
  down: DBCore,
  table: DBCoreTable,
  kind: EntityKind,
  req: DBCoreMutateRequest,
) {
  if (remoteTrans.has(req.trans)) return table.mutate(req);

  // deleteRange 只給範圍，要在刪除前先查出會被刪的 key
  const rangeKeys =
    req.type === 'deleteRange'
      ? table
          .query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })
          .then((r) => r.result)
      : Dexie.Promise.resolve([]);

  return rangeKeys.then((deletedRangeKeys) =>
    table.mutate(req).then((res) => {
      const changes = touched(req, res, deletedRangeKeys);
      if (changes.length === 0) return res;

      const syncState = down.table('syncState');
      const outbox = down.table('outbox');
      return syncState.get({ trans: req.trans, key: 'seq' }).then((row) => {
        const first = (row?.v ?? 0) + 1;
        const now = Date.now();
        // 同一個實體只留最新一筆（主鍵 [kind+id] 覆蓋），seq 換成新值
        const rows: OutboxRow[] = changes.map((c, i) => ({
          kind,
          id: c.key,
          op: c.data === undefined ? 'delete' : 'put',
          ...(c.data === undefined ? {} : { data: c.data as OutboxRow['data'] }),
          updatedAt: now,
          seq: first + i,
        }));
        return syncState
          .mutate({ trans: req.trans, type: 'put', values: [{ k: 'seq', v: first + rows.length - 1 }] })
          .then(() => outbox.mutate({ trans: req.trans, type: 'put', values: rows }))
          .then(() => res);
      });
    }),
  );
}
