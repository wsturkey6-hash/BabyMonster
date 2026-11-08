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

  // JSON 模組匯入會把 "__proto__" 當成原型設定，向量檔測不到；線上走 JSON.parse，它會是自己的鍵。
  it('vaccineBrands 經 JSON.parse 帶 __proto__ 鍵會被拒收', () => {
    const P = 'aaaaaaaa-0000-0000-0000-000000000001';
    const data = JSON.parse(
      `{"id":"${P}","name":"小明","birthDate":0,"vaccineBrands":{"__proto__":{"rotavirus":"rotarix"}}}`,
    );
    expect(() => validateEntity('profile', P, data, parseEpochMs)).toThrow('未知的疫苗');
  });

  it('vaccineBrands 輸出只含已知鍵、原型是 Object.prototype', () => {
    const P = 'aaaaaaaa-0000-0000-0000-000000000001';
    const out = validateEntity('profile', P, JSON.parse(
      `{"id":"${P}","name":"小明","birthDate":0,"vaccineBrands":{"ev71":"envax","rotavirus":null}}`,
    ), parseEpochMs) as { vaccineBrands?: object };
    expect(out.vaccineBrands).toEqual({ ev71: 'envax' });
    expect(Object.getPrototypeOf(out.vaccineBrands)).toBe(Object.prototype);
  });

  it('vaccineBrands 全部為 null 時整個欄位省略', () => {
    const P = 'aaaaaaaa-0000-0000-0000-000000000001';
    const out = validateEntity('profile', P, { id: P, name: '小明', birthDate: 0, vaccineBrands: { rotavirus: null } }, parseEpochMs);
    expect('vaccineBrands' in out).toBe(false);
  });
});
