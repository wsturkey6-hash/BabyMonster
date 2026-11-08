import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEpochMs, validateEntity, validateProfile } from 'shared/validateEntity';
import { db } from '../src/db/db';
import { setVaccineBrand } from '../src/db/repository';
import { decodeAny, encodeV2 } from '../src/logic/dataTransfer';
import {
  VACCINES,
  doseCount,
  doseProgressLabel,
  dosesFor,
  nextMilestone,
  scheduleMilestones,
  type VaccineBrands,
} from '../src/logic/vaccines';
import { doneMap, hiddenDoseLabels, makeDoseRecord, overdueDoses } from '../src/logic/vaccineLog';

const byId = (id: string) => VACCINES.find((v) => v.id === id)!;
const months = (id: string, brands: VaccineBrands) => dosesFor(byId(id), brands).map((d) => d.ageMonths);
/** 某月齡那一格有沒有這支疫苗。 */
const at = (age: number, id: string, brands: VaccineBrands) =>
  scheduleMilestones(VACCINES, brands)
    .find((m) => m.ageMonths === age)
    ?.doses.some((d) => d.vaccine.id === id) ?? false;

describe('依廠牌決定劑次', () => {
  it('輪狀：羅特律 2、4 個月；輪達停 2、4、6 個月；未選只有第一劑', () => {
    expect(months('rotavirus', { rotavirus: 'rotarix' })).toEqual([2, 4]);
    expect(months('rotavirus', { rotavirus: 'rotateq' })).toEqual([2, 4, 6]);
    expect(months('rotavirus', {})).toEqual([2]);
  });

  it('腸病毒71型：恩穩健 2、4、14 個月（含追加劑）；安拓伏 2、3 個月', () => {
    expect(months('ev71', { ev71: 'envacgen' })).toEqual([2, 4, 14]);
    expect(dosesFor(byId('ev71'), { ev71: 'envacgen' })[2].label).toBe('追加劑');
    expect(months('ev71', { ev71: 'envax' })).toEqual([2, 3]);
    expect(months('ev71', {})).toEqual([2]);
  });

  it('時程表依廠牌出現或消失', () => {
    expect(at(6, 'rotavirus', { rotavirus: 'rotateq' })).toBe(true);
    expect(at(6, 'rotavirus', { rotavirus: 'rotarix' })).toBe(false);
    expect(at(4, 'rotavirus', { rotavirus: 'rotarix' })).toBe(true);
    expect(at(4, 'rotavirus', {})).toBe(false);
    expect(at(14, 'ev71', { ev71: 'envacgen' })).toBe(true);
    expect(at(3, 'ev71', { ev71: 'envax' })).toBe(true);
    expect(at(3, 'ev71', { ev71: 'envacgen' })).toBe(false);
  });

  it('存的廠牌 id 不認得時當作沒選', () => {
    expect(doseCount(byId('rotavirus'), { rotavirus: 'x' } as unknown as VaccineBrands)).toBeNull();
  });
});

describe('第幾劑／共幾劑', () => {
  it('一般疫苗直接依序數', () => {
    const v = byId('hepb');
    expect(doseProgressLabel(v, v.doses[1])).toBe('第 2 劑／共 3 劑');
    expect(doseCount(v)).toBe(3);
  });

  it('有廠牌的疫苗：選了就依廠牌，未選標示尚未選廠牌', () => {
    const v = byId('rotavirus');
    const b: VaccineBrands = { rotavirus: 'rotateq' };
    expect(doseProgressLabel(v, dosesFor(v, b)[2], b)).toBe('第 3 劑／共 3 劑');
    expect(doseProgressLabel(v, v.doses[0])).toBe('第 1 劑・尚未選廠牌');
  });
});

describe('逾期與下一次接種也看廠牌', () => {
  const birth = new Date(2026, 0, 1).getTime();
  const now = new Date(2026, 7, 1).getTime(); // 滿 7 個月

  it('輪達停第三劑（6 個月）逾期，羅特律沒有這一劑', () => {
    const ages = (b: VaccineBrands) =>
      overdueDoses(birth, now, 'b', new Map(), VACCINES, b)
        .filter((d) => d.vaccine.id === 'rotavirus')
        .map((d) => d.dose.ageMonths);
    expect(ages({ rotavirus: 'rotateq' })).toEqual([2, 4, 6]);
    expect(ages({ rotavirus: 'rotarix' })).toEqual([2, 4]);
  });

  it('nextMilestone 用到廠牌劑次', () => {
    const justAfterTwo = new Date(2026, 2, 2).getTime(); // 剛過滿 2 個月
    const m = nextMilestone(birth, justAfterTwo, VACCINES, () => false, { ev71: 'envax' });
    expect(m?.ageMonths).toBe(3);
  });
});

describe('畫面上能選的廠牌都通過伺服器驗證', () => {
  const P = 'aaaaaaaa-0000-0000-0000-000000000001';
  for (const v of VACCINES.filter((x) => x.brands)) {
    for (const b of v.brands!) {
      it(`${v.id}: ${b.id}`, () => {
        const out = validateEntity(
          'profile', P, { id: P, name: 'x', birthDate: 0, vaccineBrands: { [v.id]: b.id } }, parseEpochMs,
        );
        expect(out).toMatchObject({ vaccineBrands: { [v.id]: b.id } });
      });
    }
  }
});

describe('setVaccineBrand', () => {
  const P = 'aaaaaaaa-0000-0000-0000-000000000001';
  beforeEach(async () => {
    await Promise.all([db.profiles.clear(), db.outbox.clear()]);
    await db.profiles.add({ id: P, name: '小明', birthDate: 0 });
  });

  /** outbox 送出的資料經過 JSON 來回後，伺服器的驗證要能通過。 */
  const outboxProfile = async () => {
    const row = (await db.outbox.toArray()).find((r) => r.kind === 'profile' && r.id === P)!;
    return validateProfile(JSON.parse(JSON.stringify(row.data)), 'test', parseEpochMs);
  };

  it('設定後寫入寶寶資料並進 outbox', async () => {
    await setVaccineBrand(P, 'rotavirus', 'rotarix');
    await setVaccineBrand(P, 'ev71', 'envacgen');
    expect((await db.profiles.get(P))!.vaccineBrands).toEqual({ rotavirus: 'rotarix', ev71: 'envacgen' });
    expect((await outboxProfile()).vaccineBrands).toEqual({ rotavirus: 'rotarix', ev71: 'envacgen' });
  });

  it('清除是刪掉鍵、不存 null；全清後整個欄位拿掉', async () => {
    await setVaccineBrand(P, 'rotavirus', 'rotateq');
    await setVaccineBrand(P, 'rotavirus', null);
    expect('vaccineBrands' in (await db.profiles.get(P))!).toBe(false);
    expect('vaccineBrands' in (await outboxProfile())).toBe(false);
  });

  it('清一支、留另一支', async () => {
    await setVaccineBrand(P, 'rotavirus', 'rotateq');
    await setVaccineBrand(P, 'ev71', 'envax');
    await setVaccineBrand(P, 'rotavirus', null);
    expect((await db.profiles.get(P))!.vaccineBrands).toEqual({ ev71: 'envax' });
  });

  it('寶寶不存在時什麼都不做', async () => {
    await setVaccineBrand('nope', 'rotavirus', 'rotarix');
    expect(await db.profiles.get('nope')).toBeUndefined();
  });
});

describe('備份檔', () => {
  const P = '11111111-1111-1111-1111-111111111111';

  it('廠牌選擇可來回匯出匯入', () => {
    const text = encodeV2({
      profiles: [{ id: P, name: '小明', birthDate: 0, vaccineBrands: { ev71: 'envax' } }],
      records: [],
    });
    expect(decodeAny(text).profiles[0].vaccineBrands).toEqual({ ev71: 'envax' });
  });

  it('沒選廠牌時不輸出這個欄位', () => {
    const text = encodeV2({ profiles: [{ id: P, name: '小明', birthDate: 0, vaccineBrands: {} }], records: [] });
    expect(text).not.toContain('vaccineBrands');
  });
});

describe('有紀錄但目前廠牌看不到的劑次', () => {
  const B = 'b';
  const rot = byId('rotavirus');
  const rec = (label: string) => makeDoseRecord(B, 'rotavirus', label, 0);
  const second = dosesFor(rot, { rotavirus: 'rotateq' })[1].label;
  const third = dosesFor(rot, { rotavirus: 'rotateq' })[2].label;
  const done = doneMap([rec(rot.doses[0].label), rec(second), rec(third)]);

  it('未選廠牌：第二、三劑都列出，第一劑有顯示所以不列', () => {
    expect(hiddenDoseLabels(rot, {}, B, done)).toEqual([second, third]);
  });

  it('選羅特律只缺第三劑；選輪達停全都看得到', () => {
    expect(hiddenDoseLabels(rot, { rotavirus: 'rotarix' }, B, done)).toEqual([third]);
    expect(hiddenDoseLabels(rot, { rotavirus: 'rotateq' }, B, done)).toEqual([]);
  });

  it('沒有紀錄或沒有廠牌的疫苗不提示', () => {
    expect(hiddenDoseLabels(rot, {}, B, new Map())).toEqual([]);
    expect(hiddenDoseLabels(byId('hepb'), {}, B, done)).toEqual([]);
  });
});
