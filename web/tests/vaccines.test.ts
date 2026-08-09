import { describe, expect, it } from 'vitest';
import {
  VACCINES,
  ageMonthsLabel,
  doseDate,
  nextMilestone,
  scheduleMilestones,
  type Vaccine,
} from '../src/logic/vaccines';

const birth = new Date(2026, 6, 22).getTime(); // 2026-07-22

const byId = (id: string) => VACCINES.find((v) => v.id === id)!;
/** 每劑寫成「月齡:公費|自費」，一眼對照時程表。 */
const plan = (id: string) => byId(id).doses.map((d) => `${d.ageMonths}:${d.funding}`);

describe('公費時程（疾管署 11401 版）', () => {
  it('月齡與劑次與官方時程表相符', () => {
    expect(plan('hepb')).toEqual(['0:public', '1:public', '6:public']);
    expect(plan('bcg')).toEqual(['5:public']);
    expect(plan('dtap-hib-ipv')).toEqual(['2:public', '4:public', '6:public', '18:public']);
    expect(plan('pcv13')).toEqual(['2:public', '4:public', '12:public']);
    expect(plan('mmr')).toEqual(['12:public', '60:public']);
    expect(plan('je')).toEqual(['15:public', '27:public']);
    expect(plan('hepa')).toEqual(['18:public', '27:public']);
    expect(plan('dtap-ipv')).toEqual(['60:public']);
    expect(plan('flu')).toEqual(['6:public', '7:public']);
  });
});

describe('自費時程（SIMBA 2026.03 版）', () => {
  it('月齡與劑次與時程表相符', () => {
    expect(plan('hbig')).toEqual(['0:self']);
    expect(plan('rotavirus')).toEqual(['2:self', '4:self', '6:self']);
    expect(plan('meningococcal')).toEqual(['2:self']);
    expect(plan('ev71')).toEqual(['2:self']);
    expect(plan('dtap-hib-ipv-hepb')).toEqual(['6:self', '18:self']);
  });

  it('水痘第一劑公費、第二劑自費', () => {
    expect(plan('varicella')).toEqual(['12:public', '60:self']);
  });
});

describe('疫苗資料完整性', () => {
  it('每支疫苗都有說明，id 不重複', () => {
    for (const v of VACCINES) expect(v.description.length).toBeGreaterThan(20);
    expect(new Set(VACCINES.map((v) => v.id)).size).toBe(VACCINES.length);
  });

  it('每一劑都標了公費或自費', () => {
    for (const v of VACCINES) {
      for (const d of v.doses) expect(['public', 'self']).toContain(d.funding);
    }
  });
});

describe('ageMonthsLabel', () => {
  it('出生、月齡、歲數與學齡前各有對應說法', () => {
    expect(ageMonthsLabel(0)).toBe('出生 24 小時內');
    expect(ageMonthsLabel(2)).toBe('滿 2 個月');
    expect(ageMonthsLabel(12)).toBe('滿 1 歲');
    expect(ageMonthsLabel(15)).toBe('滿 1 歲 3 個月');
    expect(ageMonthsLabel(27)).toBe('滿 2 歲 3 個月');
    expect(ageMonthsLabel(60)).toBe('滿 5 歲至入國小前');
  });
});

describe('doseDate', () => {
  it('出生日往後推月份', () => {
    expect(doseDate(birth, 0)).toBe(new Date(2026, 6, 22).getTime());
    expect(doseDate(birth, 2)).toBe(new Date(2026, 8, 22).getTime());
    expect(doseDate(birth, 18)).toBe(new Date(2028, 0, 22).getTime());
  });

  it('月底出生時由 Date 進位（1/31 + 1 個月落到 3 月）', () => {
    const endOfMonth = new Date(2026, 0, 31).getTime();
    expect(doseDate(endOfMonth, 1)).toBe(new Date(2026, 2, 3).getTime());
  });
});

describe('scheduleMilestones', () => {
  it('依月齡由小到大分組', () => {
    expect(scheduleMilestones().map((m) => m.ageMonths)).toEqual([
      0, 1, 2, 4, 5, 6, 7, 12, 15, 18, 27, 60,
    ]);
  });

  it('同一個月齡的疫苗收在同一組，公費排在自費前面', () => {
    const two = scheduleMilestones().find((m) => m.ageMonths === 2)!;
    expect(two.doses.map((d) => `${d.vaccine.id}:${d.dose.funding}`)).toEqual([
      'dtap-hib-ipv:public',
      'pcv13:public',
      'rotavirus:self',
      'meningococcal:self',
      'ev71:self',
    ]);
  });

  it('滿 5 歲那組同時有公費與自費（水痘第二劑自費）', () => {
    const preschool = scheduleMilestones().find((m) => m.ageMonths === 60)!;
    expect(preschool.doses.map((d) => `${d.vaccine.id}:${d.dose.funding}`)).toEqual([
      'mmr:public',
      'dtap-ipv:public',
      'varicella:self',
    ]);
  });
});

describe('nextMilestone', () => {
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

  it('回傳最近一個還沒到的月齡', () => {
    const now = new Date(2026, 7, 1).getTime(); // 出生後約 10 天
    expect(nextMilestone(birth, now, fake)?.ageMonths).toBe(2);
  });

  it('接種當天不算「接下來」，會跳到下一個', () => {
    expect(nextMilestone(birth, doseDate(birth, 2), fake)?.ageMonths).toBe(4);
  });

  it('同一個月齡會把公費與自費一起帶出來', () => {
    const m = nextMilestone(birth, new Date(2026, 9, 1).getTime(), fake)!;
    expect(m.ageMonths).toBe(4);
    expect(m.doses.map((d) => d.dose.funding)).toEqual(['public', 'self']);
  });

  it('全部時程都過了回傳 null', () => {
    expect(nextMilestone(birth, new Date(2040, 0, 1).getTime(), fake)).toBeNull();
  });
});
