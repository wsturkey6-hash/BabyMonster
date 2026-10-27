import Dexie, { type DexieOptions, type Table } from 'dexie';
import type { ProfileData, RecordData } from '../logic/types';
import type { VaccineDoseRecord } from '../logic/vaccineLog';
import { outboxMiddleware } from './outboxMiddleware';

export type EntityKind = 'profile' | 'record' | 'vaccineDose';

/** 待上傳的本機變更。seq 是本機遞增序號，用來保持上傳順序，也用來判斷上傳期間這列有沒有被改過。 */
export interface OutboxRow {
  kind: EntityKind;
  id: string;
  op: 'put' | 'delete';
  data?: ProfileData | RecordData | VaccineDoseRecord;
  updatedAt: number;
  seq: number;
}

/** 同步的雜項狀態：seq（下一個序號的計數器）、cursor、lastSync。 */
export interface SyncStateRow {
  k: string;
  v: number;
}

export class BabyDB extends Dexie {
  profiles!: Table<ProfileData, string>;
  records!: Table<RecordData, string>;
  vaccineDoses!: Table<VaccineDoseRecord, string>;
  outbox!: Table<OutboxRow, [EntityKind, string]>;
  syncState!: Table<SyncStateRow, string>;

  // name / options 只給測試用（模擬兩支手機各自一個資料庫）
  constructor(name = 'babymonster', options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      profiles: 'id',
      records: 'id, babyId, timestamp',
    });
    // v2：新增接種紀錄表。Dexie 只需宣告有變動的表，profiles/records 自動沿用 v1 定義。
    this.version(2).stores({
      vaccineDoses: 'key, babyId',
    });
    this.version(3).stores({
      outbox: '[kind+id], seq',
      syncState: 'k',
    });
    // 所有對三張資料表的寫入都在同一個 transaction 內記進 outbox，之後新增的寫入點也不會漏
    this.use(outboxMiddleware);
  }
}

export const db = new BabyDB();
