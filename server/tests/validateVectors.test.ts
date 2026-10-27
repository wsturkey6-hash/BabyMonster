import { describe, expect, it } from 'vitest';
import { assertSyncTimestamp, parseEpochMs, validateEntity } from '../../shared/validateEntity';
import vectors from '../../shared/tests/fixtures/validateVectors.json';

/**
 * 與 web/tests/validateVectors.test.ts 跑的是同一份向量檔。
 * 任何一邊把規則放寬（例如伺服器自己寫一套比較鬆的檢查），CI 就會紅。
 */
describe('shared/validateEntity 共用向量（伺服器端）', () => {
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

  // web 那邊用 doseRecordKey（在 web/src/logic）對照同一件事；伺服器不依賴 web，所以直接寫死格式
  it('接種紀錄的 key 是 babyId|vaccineId|doseLabel（小寫 babyId）', () => {
    const dose = validateEntity(
      'vaccineDose',
      'aaaaaaaa-0000-0000-0000-000000000001|hepb|第一劑',
      { babyId: 'AAAAAAAA-0000-0000-0000-000000000001', vaccineId: 'hepb', doseLabel: '第一劑', date: 0 },
      parseEpochMs,
    );
    expect((dose as { key: string }).key).toBe('aaaaaaaa-0000-0000-0000-000000000001|hepb|第一劑');
  });
});
