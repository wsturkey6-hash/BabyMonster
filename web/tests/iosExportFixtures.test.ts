import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeAny, encodeV2 } from '../src/logic/dataTransfer';

// fixture 由 repo 內真正的 iOS 程式碼（Models + DataTransfer, JSONEncoder
// .prettyPrinted/.sortedKeys/.iso8601）編譯產生，驗證 iOS → web 匯入相容性。
// 特徵：大寫 UUID、"key" : value 排版、無毫秒日期、nil 欄位整個省略。

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const BABY_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const BABY_B = 'bbbbbbbb-5555-6666-7777-888888888888';

describe('iOS 實匯出檔（v2 多寶寶）', () => {
  const v2 = decodeAny(fixture('ios-v2-export.json'));

  it('寶寶全數匯入且 UUID 正規化為小寫', () => {
    expect(v2.profiles.map((p) => p.id)).toEqual([BABY_A, BABY_B]);
    expect(v2.profiles.map((p) => p.name)).toEqual(['小寶', '二寶']);
    expect(v2.profiles[0].birthDate).toBe(Date.UTC(2025, 10, 2));
  });

  it('完整記錄的所有欄位都正確解析', () => {
    const r = v2.records[0];
    expect(r).toEqual({
      id: '11111111-aaaa-bbbb-cccc-dddddddddddd',
      babyId: BABY_A,
      timestamp: Date.UTC(2026, 6, 18, 4, 56),
      feedAmount: 120,
      stoolColor: 7,
      stoolAmount: 'medium',
      stoolShape: 4,
      hasUrine: true,
      temperature: 36.5,
      weight: 4321,
      note: '備註：喝完睡著',
    });
  });

  it('最小記錄（選填欄位省略）不會補出 undefined 鍵', () => {
    const r = v2.records[1];
    expect(Object.keys(r).sort()).toEqual(['babyId', 'hasUrine', 'id', 'timestamp']);
    expect(r.babyId).toBe(BABY_B);
    expect(r.hasUrine).toBe(false);
  });
});

describe('iOS 實匯出檔（v1 單寶寶）', () => {
  it('保留檔內 profile id（鏡射 iOS decodeIfPresent 行為）並綁定所有記錄', () => {
    const v1 = decodeAny(fixture('ios-v1-export.json'));
    expect(v1.profiles).toHaveLength(1);
    expect(v1.profiles[0].id).toBe(BABY_A);
    expect(v1.records).toHaveLength(1);
    expect(v1.records[0].babyId).toBe(BABY_A);
  });

  it('舊 v1 檔（profile 無 id）仍會產生新 id 並綁定記錄', () => {
    const legacy = fixture('ios-v1-export.json').replace(/"id" : "AAAAAAAA-[^"]*",\n/, '');
    const v1 = decodeAny(legacy);
    expect(v1.profiles[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(v1.records[0].babyId).toBe(v1.profiles[0].id);
  });
});

describe('iOS 實匯出檔（含接種紀錄）', () => {
  const raw = fixture('ios-v2-export-vaccines.json');
  const p = decodeAny(raw);

  it('接種紀錄全數解析，babyId 由大寫 UUID 正規化為小寫', () => {
    expect(p.vaccineDoses).toHaveLength(3);
    expect(p.vaccineDoses!.map((d) => d.babyId)).toEqual([BABY_A, BABY_A, BABY_B]);
    expect(p.vaccineDoses!.map((d) => `${d.vaccineId}|${d.doseLabel}`)).toEqual([
      'hepb|第一劑', 'dtap-hib-ipv|第二劑', 'bcg|一劑',
    ]);
  });

  it('key 由 babyId|vaccineId|劑次 重新組出來', () => {
    expect(p.vaccineDoses![0].key).toBe(`${BABY_A}|hepb|第一劑`);
  });

  // 只比對值：Swift JSONEncoder 排版是 "key" : value，JS 是 "key": value，
  // 差在空格不在內容。唯一的內容差異是 UUID 大小寫（web 一律正規化為小寫，
  // 見 parseProfile/parseRecord），所以比對前先把原檔的 id 也轉小寫。
  // 因為解碼不再對日期做時區正規化，這條在任何執行時區都成立。
  it('再編碼回去與 iOS 原檔內容相同（雙向相容，且不受執行時區影響）', () => {
    const original = JSON.parse(raw);
    for (const x of original.profiles) x.id = x.id.toLowerCase();
    for (const d of original.vaccineDoses) d.babyId = d.babyId.toLowerCase();
    expect(JSON.parse(encodeV2(p))).toEqual(original);
  });
});
