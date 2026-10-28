import { describe, expect, it } from 'vitest';
import type * as Shared from '../../shared/validateEntity';
import type * as Web from '../src/logic/types';
import type { VaccineDoseRecord as WebVaccineDoseRecord } from '../src/logic/vaccineLog';

// 伺服器的驗證器只留下 shared 型別裡有的欄位。web 多了一個欄位而 shared 沒跟上的話，
// 那個欄位上傳時被無聲丟掉，拉取時回來的版本又把兩支手機上的值一起抹掉。
// 所以兩邊必須「完全相同」，單向可賦值不夠（web 多一個 optional 欄位仍可賦給 shared）。
// 這些檢查在型別層：npm run build 的 tsc --noEmit 會擋下來，vitest 本身不檢查型別。
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const profile: Equal<Web.ProfileData, Shared.ProfileData> = true;
const record: Equal<Web.RecordData, Shared.RecordData> = true;
const vaccineDose: Equal<WebVaccineDoseRecord, Shared.VaccineDoseRecord> = true;
const amount: Equal<Web.Amount, Shared.Amount> = true;
const sleepEvent: Equal<Web.SleepEvent, Shared.SleepEvent> = true;
const bristol: Equal<Web.BristolType, Shared.BristolType> = true;
const sex: Equal<Web.Sex, Shared.Sex> = true;

describe('web 與 shared 的實體型別', () => {
  it('完全相同（真正的檢查在 tsc）', () => {
    expect([profile, record, vaccineDose, amount, sleepEvent, bristol, sex].every(Boolean)).toBe(true);
  });
});
