import { describe, expect, it } from 'vitest';
import { assertSyncTimestamp, parseEpochMs, validateEntity } from 'shared/validateEntity';
import vectors from '../../shared/tests/fixtures/validateVectors.json';
import { doseRecordKey } from '../src/logic/vaccineLog';

// 這份向量檔 server 端也會跑；兩邊對規則的解讀不同就會在 CI 失敗。
describe('shared/validateEntity 共用向量', () => {
  for (const v of vectors.entities) {
    it(v.name, () => {
      const run = () => validateEntity(v.kind, v.id, v.data, parseEpochMs);
      if (v.error === null) expect(run).not.toThrow();
      else expect(run).toThrow(v.error);
    });
  }

  for (const c of vectors.timestamps.cases) {
    it(`assertSyncTimestamp：${c.name}`, () => {
      const run = () => assertSyncTimestamp(c.updatedAt, vectors.timestamps.now);
      if (c.ok) expect(run).not.toThrow();
      else expect(run).toThrow();
    });
  }

  it('接種紀錄 key 與 web 的 doseRecordKey 格式一致', () => {
    const P = 'AAAAAAAA-0000-0000-0000-000000000001';
    const d = validateEntity('vaccineDose', doseRecordKey(P, 'hepb', '第一劑'), {
      babyId: P, vaccineId: 'hepb', doseLabel: '第一劑', date: 0,
    }, parseEpochMs);
    expect((d as { key: string }).key).toBe(doseRecordKey(P, 'hepb', '第一劑'));
  });
});
