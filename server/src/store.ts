/**
 * SQLite 存取層（設計文件 §3.2）。
 *
 * 全部走 better-sqlite3 的 prepared statement 加綁定參數，沒有任何一行 SQL 是用樣板字串拼出來的；
 * LIMIT 也是綁定參數。SQL 一律寫成單引號字串陣列再 join，連「看起來像字串插值」的寫法都不留。
 */
import Database from 'better-sqlite3';
import type { Database as Db, Statement } from 'better-sqlite3';

/** 一列實體。欄位名沿用 SQLite 的 snake_case，免得在兩種命名之間轉來轉去。 */
export interface EntityRow {
  kind: string;
  id: string;
  data: string | null;
  deleted: number;
  updated_at: number;
  updated_by: string | null;
  seq: number;
  /** 伺服器自己的時鐘，只做事後追查，不參與 LWW（回應不帶這個欄位）。 */
  received_at: number;
}

/** 要寫進 entities 的一列。received_at 是伺服器自己的時鐘，只做事後追查，不參與 LWW。 */
export interface WriteRow {
  kind: string;
  id: string;
  json: string | null;
  deleted: boolean;
  updatedAt: number;
  updatedBy: string | null;
  seq: number;
  receivedAt: number;
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS entities (',
  '  kind        TEXT    NOT NULL,',
  '  id          TEXT    NOT NULL,',
  '  data        TEXT,',
  '  deleted     INTEGER NOT NULL DEFAULT 0,',
  '  updated_at  INTEGER NOT NULL,',
  '  updated_by  TEXT,',
  '  seq         INTEGER NOT NULL,',
  '  received_at INTEGER NOT NULL,',
  '  PRIMARY KEY (kind, id)',
  ');',
  'CREATE INDEX IF NOT EXISTS entities_seq ON entities(seq);',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);',
  "INSERT OR IGNORE INTO meta (k, v) VALUES ('schema', '1');",
  "INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', '0');",
].join('\n');

const SQL = {
  get: 'SELECT updated_at, deleted, seq FROM entities WHERE kind = ? AND id = ?',
  write: [
    'INSERT INTO entities (kind, id, data, deleted, updated_at, updated_by, seq, received_at)',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'ON CONFLICT(kind, id) DO UPDATE SET',
    '  data = excluded.data,',
    '  deleted = excluded.deleted,',
    '  updated_at = excluded.updated_at,',
    '  updated_by = excluded.updated_by,',
    '  seq = excluded.seq,',
    '  received_at = excluded.received_at',
  ].join('\n'),
  // 只換序號，資料與 received_at 都不動（這一列的內容並沒有被誰寫過）
  bump: 'UPDATE entities SET seq = ? WHERE kind = ? AND id = ?',
  since: [
    'SELECT kind, id, data, deleted, updated_at, updated_by, seq, received_at',
    'FROM entities WHERE seq > ? ORDER BY seq ASC LIMIT ?',
  ].join('\n'),
  nextSeq: [
    "UPDATE meta SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT) WHERE k = 'seq'",
    'RETURNING CAST(v AS INTEGER) AS seq',
  ].join('\n'),
} as const;

export class Store {
  private readonly db: Db;
  private readonly stGet: Statement;
  private readonly stWrite: Statement;
  private readonly stBump: Statement;
  private readonly stSince: Statement;
  private readonly stNextSeq: Statement;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA);
    this.stGet = this.db.prepare(SQL.get);
    this.stWrite = this.db.prepare(SQL.write);
    this.stBump = this.db.prepare(SQL.bump);
    this.stSince = this.db.prepare(SQL.since);
    this.stNextSeq = this.db.prepare(SQL.nextSeq);
  }

  get(kind: string, id: string): { updated_at: number; deleted: number; seq: number } | undefined {
    return this.stGet.get(kind, id) as { updated_at: number; deleted: number; seq: number } | undefined;
  }

  /** 伺服器指派的下一個 seq。寫在 meta 裡，重啟後不會重頭來。 */
  nextSeq(): number {
    return (this.stNextSeq.get() as { seq: number }).seq;
  }

  write(r: WriteRow): void {
    this.stWrite.run(r.kind, r.id, r.json, r.deleted ? 1 : 0, r.updatedAt, r.updatedBy, r.seq, r.receivedAt);
  }

  bumpSeq(kind: string, id: string, seq: number): void {
    this.stBump.run(seq, kind, id);
  }

  since(cursor: number, limit: number): EntityRow[] {
    return this.stSince.all(cursor, limit) as EntityRow[];
  }

  /** 推送與拉取在同一個 transaction 內（設計文件 §4.1）。 */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
