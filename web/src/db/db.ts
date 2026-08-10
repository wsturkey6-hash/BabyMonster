import Dexie, { type Table } from 'dexie';
import type { ProfileData, RecordData } from '../logic/types';
import type { VaccineDoseRecord } from '../logic/vaccineLog';

export class BabyDB extends Dexie {
  profiles!: Table<ProfileData, string>;
  records!: Table<RecordData, string>;
  vaccineDoses!: Table<VaccineDoseRecord, string>;

  constructor() {
    super('babymonster');
    this.version(1).stores({
      profiles: 'id',
      records: 'id, babyId, timestamp',
    });
    // v2：新增接種紀錄表。Dexie 只需宣告有變動的表，profiles/records 自動沿用 v1 定義。
    this.version(2).stores({
      vaccineDoses: 'key, babyId',
    });
  }
}

export const db = new BabyDB();
