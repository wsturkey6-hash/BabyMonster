import { describe, expect, it } from 'vitest';
import {
  doneMap,
  doseRecordKey,
  makeDoseRecord,
  overdueDoses,
} from '../src/logic/vaccineLog';
import { doseDate, type Vaccine } from '../src/logic/vaccines';

const BABY = 'AAAA1111-2222-3333-4444-555566667777';
const LOWER = BABY.toLowerCase();
const birth = new Date(2026, 6, 22).getTime(); // 2026-07-22

/** 兩支測試用疫苗：A 有 2、4 個月兩劑，B 只有 4 個月一劑（用來驗證同月齡的排序）。 */
const fake: Vaccine[] = [
  {
    id: 'a', name: 'A', en: 'A', description: '測試用疫苗說明文字，長度足夠通過檢查。',
    doses: [
      { label: '第一劑', ageMonths: 2, funding: 'public' },
      { label: '第二劑', ageMonths: 4, funding: 'public' },
    ],
  },
  {
    id: 'b', name: 'B', en: 'B', description: '測試用疫苗說明文字，長度足夠通過檢查。',
    doses: [{ label: '一劑', ageMonths: 4, funding: 'self' }],
  },
];

const names = (ds: ReturnType<typeof overdueDoses>) =>
  ds.map((d) => `${d.vaccine.id}:${d.dose.label}`);

describe('doseRecordKey', () => {
  it('用 babyId|vaccineId|劑次 組成，babyId 一律小寫', () => {
    expect(doseRecordKey(BABY, 'dtap-hib-ipv', '第一劑')).toBe(
      `${LOWER}|dtap-hib-ipv|第一劑`,
    );
  });

  it('大小寫不同的 babyId 會組出同一個 key', () => {
    expect(doseRecordKey(BABY, 'hepb', '第一劑')).toBe(doseRecordKey(LOWER, 'hepb', '第一劑'));
  });
});

describe('makeDoseRecord', () => {
  it('日期切到當地 00:00、babyId 小寫、key 自動組好', () => {
    const r = makeDoseRecord(BABY, 'hepb', '第一劑', new Date(2026, 6, 22, 14, 30).getTime());
    expect(r.date).toBe(new Date(2026, 6, 22).getTime());
    expect(r.babyId).toBe(LOWER);
    expect(r.vaccineId).toBe('hepb');
    expect(r.doseLabel).toBe('第一劑');
    expect(r.key).toBe(doseRecordKey(BABY, 'hepb', '第一劑'));
  });
});

describe('doneMap', () => {
  it('key 對到施打日期', () => {
    const d = new Date(2026, 8, 20).getTime();
    const m = doneMap([makeDoseRecord(BABY, 'a', '第一劑', d)]);
    expect(m.get(doseRecordKey(BABY, 'a', '第一劑'))).toBe(d);
    expect(m.has(doseRecordKey(BABY, 'a', '第二劑'))).toBe(false);
  });
});

describe('overdueDoses', () => {
  const empty = new Map<string, number>();

  it('接種日早於今天又沒紀錄才算逾期', () => {
    const now = new Date(2026, 9, 1).getTime(); // 2026-10-01，2 個月那劑（9/22）已過
    expect(names(overdueDoses(birth, now, BABY, empty, fake))).toEqual(['a:第一劑']);
  });

  it('接種日就是今天不算逾期', () => {
    const onTheDay = doseDate(birth, 2); // 2026-09-22
    expect(overdueDoses(birth, onTheDay, BABY, empty, fake)).toEqual([]);
  });

  it('接種日隔天開始算逾期', () => {
    const nextDay = new Date(2026, 8, 23).getTime();
    expect(names(overdueDoses(birth, nextDay, BABY, empty, fake))).toEqual(['a:第一劑']);
  });

  it('當天稍晚的時間點不會把今天那劑算成逾期', () => {
    const lateOnTheDay = new Date(2026, 8, 22, 23, 59).getTime();
    expect(overdueDoses(birth, lateOnTheDay, BABY, empty, fake)).toEqual([]);
  });

  it('已填日期的劑次不算逾期', () => {
    const now = new Date(2026, 9, 1).getTime();
    const done = doneMap([makeDoseRecord(BABY, 'a', '第一劑', new Date(2026, 8, 25).getTime())]);
    expect(overdueDoses(birth, now, BABY, done, fake)).toEqual([]);
  });

  it('依月齡由小到大排序，同月齡維持疫苗定義順序', () => {
    const now = new Date(2027, 0, 1).getTime();
    expect(names(overdueDoses(birth, now, BABY, empty, fake))).toEqual([
      'a:第一劑', 'a:第二劑', 'b:一劑',
    ]);
  });

  it('別的寶寶的紀錄不算數', () => {
    const now = new Date(2026, 9, 1).getTime();
    const other = doneMap([
      makeDoseRecord('bbbb2222-0000-0000-0000-000000000000', 'a', '第一劑', now),
    ]);
    expect(names(overdueDoses(birth, now, BABY, other, fake))).toEqual(['a:第一劑']);
  });
});
