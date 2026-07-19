import Dexie, { type Table } from 'dexie';
import type { ProfileData, RecordData } from '../logic/types';

export class BabyDB extends Dexie {
  profiles!: Table<ProfileData, string>;
  records!: Table<RecordData, string>;

  constructor() {
    super('babymonster');
    this.version(1).stores({
      profiles: 'id',
      records: 'id, babyId, timestamp',
    });
  }
}

export const db = new BabyDB();
