# 疫苗施打紀錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓疫苗頁的時程表能記錄每一劑的實際施打日期，已施打的劑次背景變色，並列出接種日已過卻沒有紀錄的劑次。

**Architecture:** 新增一張獨立的接種紀錄表（web = Dexie `vaccineDoses`、iOS = `VaccineDoseEntity`），主鍵是 `babyId|vaccineId|劑次`。純邏輯抽到新模組（`vaccineLog.ts` / `VaccineLog.swift`）以便 TDD，既有的 `vaccines.ts` / `Vaccines.swift` 只加一個「已完成」判斷式參數與日期邊界修正。匯出檔維持 `version: 2`，只多一個選填的 `vaccineDoses` 陣列，確保舊版 App 讀新檔不會整檔拒絕。

**Tech Stack:** web — React 18 + TypeScript + Dexie 4 + Vitest；iOS — SwiftUI + SwiftData + XCTest。

**Spec:** `docs/superpowers/specs/2026-08-10-vaccine-dose-log-design.md`

## Global Constraints

- 介面文字一律**繁體中文**，沿用既有語氣（例如「尚未建立寶寶，請先到設定頁新增」）。
- 匯出檔 **`version` 維持 2**，`vaccineDoses` 為選填欄位；**空陣列時不寫進檔案**，確保沒有接種紀錄的使用者匯出結果與現在逐字節相同。
- 日期一律以 ISO 8601 **無毫秒**編碼（Swift `JSONDecoder(.iso8601)` 不接受毫秒）。
- 施打日期存「當地日期 00:00」，與 `ProfileData.birthDate` 同一種存法。
- `vaccineId` 與 `doseLabel` 兩平台必須逐字相同（由既有的兩份疫苗表同步維護保證）。
- babyId 大小寫：web 一律小寫、iOS 用 `UUID.uuidString`（大寫）。key 只存在本機、不寫進備份檔。
- 疫苗資料表（`VACCINES` / `Vaccines.all`）**這次完全不動**。
- Xcode 專案使用 `PBXFileSystemSynchronizedRootGroup`（objectVersion 77），新增 `.swift` 檔會自動納入 target，**不需要編輯 `project.pbxproj`**。
- 分支：`feature/vaccine-dose-log`（從 `main` 開）。每個 Task 結束時 commit。

---

## File Structure

**web（新增）**
- `web/src/logic/vaccineLog.ts` — 接種紀錄的值型別與純函式（key、當日切分、逾期計算）
- `web/tests/vaccineLog.test.ts` — 上述純函式的測試

**web（修改）**
- `web/src/logic/vaccines.ts` — 加 `startOfDay()`；`nextMilestone` 加「已完成」判斷式與日期邊界修正
- `web/src/db/db.ts` — Dexie schema 1 → 2，新增 `vaccineDoses` 表
- `web/src/db/repository.ts` — `setVaccineDose` / `clearVaccineDose`；`allData`、`importMerge`、`deleteBabyCascade` 納入新表
- `web/src/logic/dataTransfer.ts` — `BackupPayloadV2.vaccineDoses?`、encode/decode/merge
- `web/src/ui/VaccinePage.tsx` — 標籤變色、對話框日期輸入、逾期區塊
- `web/src/ui/styles.css` — `.vaccine-chip.done`、`.dose-log`、`.overdue-*`
- `web/tests/vaccines.test.ts`、`dataTransferCodec.test.ts`、`dataTransferMerge.test.ts`、`repository.test.ts` — 補測試

**iOS（新增）**
- `BabyMonster/Logic/VaccineLog.swift` — `VaccineDoseData` 值型別 + `VaccineLog` 純函式
- `BabyMonster/Models/VaccineDoseEntity.swift` — SwiftData entity
- `BabyMonsterTests/VaccineLogTests.swift` — 純函式測試

**iOS（修改）**
- `BabyMonster/Logic/Vaccines.swift` — `next` 加 `isDone` 與日期邊界修正
- `BabyMonster/Models/ModelContainer+App.swift` — schema 加入新 entity
- `BabyMonster/Logic/DataTransfer.swift` — `BackupPayloadV2.vaccineDoses`、`mergeBabies`
- `BabyMonster/Views/VaccineView.swift` — 標籤變色、sheet 日期輸入、逾期區塊
- `BabyMonster/Views/SettingsView.swift` — 匯出／匯入／刪除寶寶納入新表
- `BabyMonsterTests/VaccineTests.swift`、`DataTransferV2Tests.swift` — 補測試

---

## Task 1: web 邏輯層 — 接種紀錄的 key 與逾期計算

**Files:**
- Create: `web/src/logic/vaccineLog.ts`
- Create: `web/tests/vaccineLog.test.ts`
- Modify: `web/src/logic/vaccines.ts`（只加 `startOfDay`）

**Interfaces:**
- Consumes: `web/src/logic/vaccines.ts` 既有的 `VACCINES`、`doseDate`、`ScheduledDose`、`Vaccine`
- Produces:
  - `startOfDay(ms: number): number`（在 `vaccines.ts`，避免 `vaccines.ts` 反向 import `vaccineLog.ts` 造成循環）
  - `interface VaccineDoseRecord { key: string; babyId: string; vaccineId: string; doseLabel: string; date: number }`
  - `doseRecordKey(babyId: string, vaccineId: string, doseLabel: string): string`
  - `makeDoseRecord(babyId: string, vaccineId: string, doseLabel: string, date: number): VaccineDoseRecord`
  - `doneMap(records: VaccineDoseRecord[]): Map<string, number>`
  - `overdueDoses(birthDate: number, now: number, babyId: string, done: Map<string, number>, vaccines?: Vaccine[]): ScheduledDose[]`

- [ ] **Step 1: 先在 `vaccines.ts` 加 `startOfDay`**

在 `web/src/logic/vaccines.ts` 的 `doseDate` 函式**上方**插入：

```ts
/** 把時間戳切到當地日期的 00:00。日期比較一律先過這一層，避免時分秒影響結果。 */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
```

- [ ] **Step 2: 寫失敗的測試**

建立 `web/tests/vaccineLog.test.ts`：

```ts
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
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
cd web && npx vitest run tests/vaccineLog.test.ts
```

Expected: FAIL，錯誤訊息為找不到模組 `../src/logic/vaccineLog`。

- [ ] **Step 4: 寫實作**

建立 `web/src/logic/vaccineLog.ts`：

```ts
/**
 * 疫苗施打紀錄的純邏輯：不碰儲存、不碰畫面。
 *
 * 一筆紀錄 = 寶寶 + 疫苗 + 劑次 + 實際施打日期，key 由前三者組成，
 * 所以同一寶寶的同一劑只會有一筆。key 只存在本機、不寫進備份檔（見 dataTransfer）。
 */
import { VACCINES, doseDate, startOfDay, type ScheduledDose, type Vaccine } from './vaccines';

export interface VaccineDoseRecord {
  key: string;
  babyId: string;
  vaccineId: string;
  doseLabel: string;
  /** 實際施打日期，當地日期 00:00 */
  date: number;
}

/** babyId 一律小寫：iOS 匯出的 UUID 是大寫，兩邊要對得上。 */
export function doseRecordKey(babyId: string, vaccineId: string, doseLabel: string): string {
  return `${babyId.toLowerCase()}|${vaccineId}|${doseLabel}`;
}

export function makeDoseRecord(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
  date: number,
): VaccineDoseRecord {
  return {
    key: doseRecordKey(babyId, vaccineId, doseLabel),
    babyId: babyId.toLowerCase(),
    vaccineId,
    doseLabel,
    date: startOfDay(date),
  };
}

export function doneMap(records: VaccineDoseRecord[]): Map<string, number> {
  return new Map(records.map((r) => [r.key, r.date]));
}

/** 接種日早於今天、又沒有施打紀錄的劑次，依月齡由小到大（同月齡維持疫苗定義順序）。 */
export function overdueDoses(
  birthDate: number,
  now: number,
  babyId: string,
  done: Map<string, number>,
  vaccines: Vaccine[] = VACCINES,
): ScheduledDose[] {
  const today = startOfDay(now);
  const out: ScheduledDose[] = [];
  for (const vaccine of vaccines) {
    for (const dose of vaccine.doses) {
      if (startOfDay(doseDate(birthDate, dose.ageMonths)) >= today) continue;
      if (done.has(doseRecordKey(babyId, vaccine.id, dose.label))) continue;
      out.push({ vaccine, dose });
    }
  }
  // Array.prototype.sort 在現代 JS 是穩定排序，同月齡會保持推入順序。
  return out.sort((a, b) => a.dose.ageMonths - b.dose.ageMonths);
}
```

- [ ] **Step 5: 跑測試確認通過**

```bash
cd web && npx vitest run tests/vaccineLog.test.ts
```

Expected: PASS，全部條目通過。

- [ ] **Step 6: 跑全部測試確認沒弄壞既有行為**

```bash
cd web && npm test
```

Expected: 全部通過（既有 61 項 + 新增的）。

- [ ] **Step 7: Commit**

```bash
git add web/src/logic/vaccineLog.ts web/src/logic/vaccines.ts web/tests/vaccineLog.test.ts
git commit -m "Add pure logic for vaccine dose records on the web"
```

---

## Task 2: web — `nextMilestone` 認得已完成的劑次，日期邊界改以今天切

**Files:**
- Modify: `web/src/logic/vaccines.ts:236-243`（`nextMilestone`）
- Modify: `web/tests/vaccines.test.ts:118-150`（`nextMilestone` 那組 describe）

**Interfaces:**
- Consumes: Task 1 的 `startOfDay`
- Produces: `nextMilestone(birthDate: number, now: number, vaccines?: Vaccine[], isDone?: (d: ScheduledDose) => boolean): Milestone | null`
  - 第四個參數預設 `() => false`，所以既有的三參數呼叫行為不變
  - 用「判斷式」而不是傳入 done Map，是為了讓 `vaccines.ts` 不必知道 key 的組法

- [ ] **Step 1: 改測試（既有那條的期望值要翻轉）**

在 `web/tests/vaccines.test.ts`，把這一條：

```ts
  it('接種當天不算「接下來」，會跳到下一個', () => {
    expect(nextMilestone(birth, doseDate(birth, 2), fake)?.ageMonths).toBe(4);
  });
```

換成下面三條（`describe('nextMilestone')` 區塊內）：

```ts
  it('接種當天仍算「接下來」，顯示為還有 0 天', () => {
    expect(nextMilestone(birth, doseDate(birth, 2), fake)?.ageMonths).toBe(2);
  });

  it('接種當天稍晚的時間點也還算「接下來」', () => {
    const lateOnTheDay = doseDate(birth, 2) + 23 * 60 * 60 * 1000;
    expect(nextMilestone(birth, lateOnTheDay, fake)?.ageMonths).toBe(2);
  });

  it('整組劑次都打完就跳到下一個月齡', () => {
    const now = new Date(2026, 7, 1).getTime();
    const done = (d: ScheduledDose) => d.dose.ageMonths === 2;
    expect(nextMilestone(birth, now, fake, done)?.ageMonths).toBe(4);
  });

  it('同一組只打完一部分不會跳過', () => {
    const now = new Date(2026, 7, 1).getTime();
    const done = (d: ScheduledDose) => d.vaccine.id === 'a' && d.dose.ageMonths === 4;
    expect(nextMilestone(birth, now, fake, done)?.ageMonths).toBe(2);
  });
```

同時把檔案頂端的 import 補上 `ScheduledDose` 型別：

```ts
import {
  VACCINES,
  ageMonthsLabel,
  doseDate,
  nextMilestone,
  scheduleMilestones,
  type ScheduledDose,
  type Vaccine,
} from '../src/logic/vaccines';
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd web && npx vitest run tests/vaccines.test.ts
```

Expected: FAIL — 「接種當天仍算『接下來』」得到 4 而不是 2；兩條 `done` 測試因為 `nextMilestone` 只吃三個參數而型別錯誤。

- [ ] **Step 3: 改實作**

把 `web/src/logic/vaccines.ts` 檔尾的 `nextMilestone` 整個換掉：

```ts
/**
 * 最接近、還沒過的接種時間；全部都過了回傳 null。
 *
 * 邊界以「今天 00:00」切：接種日就是今天時仍算即將接種（顯示還有 0 天），
 * 早於今天才歸為逾期（見 vaccineLog.overdueDoses），兩者剛好接合、不留空隙。
 * isDone 回報某一劑是否已有施打紀錄；整組都打完的月齡直接跳過。
 */
export function nextMilestone(
  birthDate: number,
  now: number,
  vaccines: Vaccine[] = VACCINES,
  isDone: (d: ScheduledDose) => boolean = () => false,
): Milestone | null {
  const today = startOfDay(now);
  return (
    scheduleMilestones(vaccines).find(
      (m) => startOfDay(doseDate(birthDate, m.ageMonths)) >= today && !m.doses.every(isDone),
    ) ?? null
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd web && npm test
```

Expected: 全部通過。若 `vaccines.test.ts` 其他條目失敗，先確認是不是同樣受日期邊界影響（`回傳最近一個還沒到的月齡`、`全部時程都過了回傳 null` 兩條應維持原期望值不變）。

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/vaccines.ts web/tests/vaccines.test.ts
git commit -m "Treat a dose due today as upcoming and skip finished milestones"
```

---

## Task 3: web 儲存層 — Dexie 新表與 repository

**Files:**
- Modify: `web/src/db/db.ts`
- Modify: `web/src/db/repository.ts`
- Modify: `web/tests/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VaccineDoseRecord`、`doseRecordKey`、`makeDoseRecord`
- Produces:
  - `db.vaccineDoses: Table<VaccineDoseRecord, string>`
  - `setVaccineDose(babyId: string, vaccineId: string, doseLabel: string, date: number): Promise<void>`
  - `clearVaccineDose(babyId: string, vaccineId: string, doseLabel: string): Promise<void>`
  - `allData()` 回傳值多一個 `vaccineDoses: VaccineDoseRecord[]`

- [ ] **Step 1: 寫失敗的測試**

在 `web/tests/repository.test.ts`：

1. import 區塊補上新函式與型別：

```ts
import {
  allData,
  clearVaccineDose,
  createDefaultBaby,
  deleteBabyCascade,
  importMerge,
  resolveCurrentBaby,
  setVaccineDose,
} from '../src/db/repository';
import { doseRecordKey } from '../src/logic/vaccineLog';
```

2. `beforeEach` 多清一張表：

```ts
beforeEach(async () => {
  await db.profiles.clear();
  await db.records.clear();
  await db.vaccineDoses.clear();
});
```

3. 檔案末尾追加：

```ts
describe('接種紀錄', () => {
  const march15 = new Date(2026, 2, 15).getTime();

  it('setVaccineDose 寫入一筆，key 由 babyId|vaccineId|劑次 組成', async () => {
    await setVaccineDose(A, 'dtap-hib-ipv', '第一劑', march15);
    const all = await db.vaccineDoses.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe(doseRecordKey(A, 'dtap-hib-ipv', '第一劑'));
    expect(all[0].date).toBe(march15);
  });

  it('同一劑重複寫入是覆蓋而不是新增一筆', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await setVaccineDose(A, 'hepb', '第一劑', new Date(2026, 2, 20).getTime());
    const all = await db.vaccineDoses.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe(new Date(2026, 2, 20).getTime());
  });

  it('clearVaccineDose 刪掉該劑', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await clearVaccineDose(A, 'hepb', '第一劑');
    expect(await db.vaccineDoses.count()).toBe(0);
  });

  it('allData 會帶出接種紀錄', async () => {
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    const d = await allData();
    expect(d.vaccineDoses).toHaveLength(1);
  });

  it('刪寶寶會連帶刪掉它的接種紀錄，別的寶寶不受影響', async () => {
    await db.profiles.bulkAdd([baby(A, '小明'), baby(B, '小華')]);
    await setVaccineDose(A, 'hepb', '第一劑', march15);
    await setVaccineDose(B, 'hepb', '第一劑', march15);
    await deleteBabyCascade(A);
    const left = await db.vaccineDoses.toArray();
    expect(left.map((d) => d.babyId)).toEqual([B]);
  });
});
```

（匯入合併的那條測試留到 Task 4，因為要等 `mergeBabies` 會處理 `vaccineDoses` 才會過。`importMerge` 本身在這個 Task 就先接好線。）
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd web && npx vitest run tests/repository.test.ts
```

Expected: FAIL — `db.vaccineDoses` 不存在、`setVaccineDose` 未匯出。

- [ ] **Step 3: 改 `db.ts`**

```ts
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
```

- [ ] **Step 4: 改 `repository.ts`**

檔案頂端 import 補上：

```ts
import { makeDoseRecord, doseRecordKey } from '../logic/vaccineLog';
```

`allData` 改成：

```ts
export async function allData(): Promise<BackupPayloadV2> {
  return {
    profiles: await db.profiles.toArray(),
    records: await db.records.toArray(),
    vaccineDoses: await db.vaccineDoses.toArray(),
  };
}
```

`importMerge` 改成：

```ts
/** 匯入合併：單一 transaction，任何失敗全回滾。 */
export async function importMerge(incoming: BackupPayloadV2): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
    const local = {
      profiles: await db.profiles.toArray(),
      records: await db.records.toArray(),
      vaccineDoses: await db.vaccineDoses.toArray(),
    };
    const merged = mergeBabies(local, incoming);
    await db.profiles.clear();
    await db.records.clear();
    await db.vaccineDoses.clear();
    await db.profiles.bulkAdd(merged.profiles);
    await db.records.bulkAdd(merged.records);
    await db.vaccineDoses.bulkAdd(merged.vaccineDoses ?? []);
  });
}
```

`deleteBabyCascade` 改成：

```ts
/** 刪寶寶＋其全部記錄與接種紀錄（手動 cascade）。 */
export async function deleteBabyCascade(babyId: string): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, db.vaccineDoses, async () => {
    await db.records.where('babyId').equals(babyId).delete();
    await db.vaccineDoses.where('babyId').equals(babyId).delete();
    await db.profiles.delete(babyId);
  });
}
```

檔案末尾追加：

```ts
/** 記錄某一劑的施打日期（同一劑重複寫入為覆蓋）。 */
export async function setVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
  date: number,
): Promise<void> {
  await db.vaccineDoses.put(makeDoseRecord(babyId, vaccineId, doseLabel, date));
}

/** 把某一劑改回「尚未施打」。 */
export async function clearVaccineDose(
  babyId: string,
  vaccineId: string,
  doseLabel: string,
): Promise<void> {
  await db.vaccineDoses.delete(doseRecordKey(babyId, vaccineId, doseLabel));
}
```

- [ ] **Step 5: 跑全部測試**

```bash
cd web && npm test
```

Expected: 全部通過。

- [ ] **Step 6: Commit**

```bash
git add web/src/db/db.ts web/src/db/repository.ts web/tests/repository.test.ts
git commit -m "Store vaccine dose records in their own Dexie table"
```

---

## Task 4: web 匯出匯入 — `vaccineDoses` 欄位與合併

**Files:**
- Modify: `web/src/logic/dataTransfer.ts`
- Modify: `web/tests/dataTransferCodec.test.ts`
- Modify: `web/tests/dataTransferMerge.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VaccineDoseRecord`、`makeDoseRecord`；Task 3 的 repository 呼叫
- Produces:
  - `BackupPayloadV2` 多一個選填欄位 `vaccineDoses?: VaccineDoseRecord[]`
  - `encodeV2` 在陣列非空時輸出 `vaccineDoses`
  - `decodeAny` 解析 `vaccineDoses`（缺欄位→`[]`）
  - `mergeBabies` 回傳值多 `vaccineDoses: VaccineDoseRecord[]`

- [ ] **Step 1: 寫失敗的測試（codec）**

在 `web/tests/dataTransferCodec.test.ts` 末尾追加：

```ts
describe('vaccineDoses 欄位', () => {
  const dose = {
    key: `${P1.toLowerCase()}|dtap-hib-ipv|第一劑`,
    babyId: P1,
    vaccineId: 'dtap-hib-ipv',
    doseLabel: '第一劑',
    date: new Date(2026, 2, 15).getTime(),
  };

  it('沒有接種紀錄時不寫進檔案（維持與舊版逐字節相同）', () => {
    expect(JSON.parse(encodeV2(payload()))).not.toHaveProperty('vaccineDoses');
  });

  it('有接種紀錄時寫成不含 key 的物件陣列', () => {
    const json = JSON.parse(encodeV2({ ...payload(), vaccineDoses: [dose] }));
    expect(json.vaccineDoses).toEqual([
      { babyId: P1, vaccineId: 'dtap-hib-ipv', doseLabel: '第一劑',
        date: isoFromMs(dose.date) },
    ]);
  });

  it('往返後 key 重新組出來、日期不變', () => {
    const back = decodeAny(encodeV2({ ...payload(), vaccineDoses: [dose] }));
    expect(back.vaccineDoses).toEqual([{ ...dose, babyId: P1.toLowerCase() }]);
  });

  it('舊檔沒有這個欄位就當空陣列', () => {
    expect(decodeAny(encodeV2(payload())).vaccineDoses).toEqual([]);
  });

  it('iOS 大寫 UUID 的 babyId 解碼後正規化成小寫', () => {
    const raw = JSON.stringify({
      version: 2,
      profiles: [{ id: P1.toUpperCase(), name: '小明', birthDate: isoFromMs(0) }],
      records: [],
      vaccineDoses: [{ babyId: P1.toUpperCase(), vaccineId: 'hepb',
                       doseLabel: '第一劑', date: isoFromMs(dose.date) }],
    });
    expect(decodeAny(raw).vaccineDoses?.[0].babyId).toBe(P1.toLowerCase());
  });

  it('欄位型別不對整檔拒絕', () => {
    const raw = JSON.stringify({
      version: 2, profiles: [], records: [],
      vaccineDoses: [{ babyId: P1, vaccineId: 'hepb', date: isoFromMs(dose.date) }],
    });
    expect(() => decodeAny(raw)).toThrow(/doseLabel/);
  });
});
```

- [ ] **Step 2: 寫失敗的測試（merge）**

在 `web/tests/repository.test.ts` 的「接種紀錄」describe 末尾追加（Task 3 保留下來的那條）：

```ts
  it('匯入合併會存進接種紀錄表', async () => {
    await importMerge({
      profiles: [baby(A, '小明')],
      records: [],
      vaccineDoses: [
        { key: doseRecordKey(A, 'hepb', '第一劑'), babyId: A,
          vaccineId: 'hepb', doseLabel: '第一劑', date: new Date(2026, 2, 15).getTime() },
      ],
    });
    expect(await db.vaccineDoses.count()).toBe(1);
  });
```

在 `web/tests/dataTransferMerge.test.ts` 末尾追加：

```ts
describe('mergeBabies 的接種紀錄', () => {
  const d = (babyId: string, vaccineId: string, label: string, date: number) => ({
    key: `${babyId.toLowerCase()}|${vaccineId}|${label}`,
    babyId: babyId.toLowerCase(), vaccineId, doseLabel: label, date,
  });
  const mar15 = new Date(2026, 2, 15).getTime();
  const mar20 = new Date(2026, 2, 20).getTime();

  it('同一劑重複時本機優先', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(A, 'hepb', '第一劑', mar15)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(A, 'hepb', '第一劑', mar20)] },
    );
    expect(r.vaccineDoses).toHaveLength(1);
    expect(r.vaccineDoses![0].date).toBe(mar15);
  });

  it('不同劑次各留一筆，依 key 排序', () => {
    const r = mergeBabies(
      { profiles: [], records: [], vaccineDoses: [d(A, 'hepb', '第二劑', mar20)] },
      { profiles: [], records: [], vaccineDoses: [d(A, 'hepb', '第一劑', mar15)] },
    );
    expect(r.vaccineDoses!.map((x) => x.doseLabel)).toEqual(['第一劑', '第二劑']);
  });

  it('寶寶用名字對中時，接種紀錄的 babyId 一起重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [], vaccineDoses: [] },
      { profiles: [{ id: B, name: '小明', birthDate: 0 }], records: [],
        vaccineDoses: [d(B, 'hepb', '第一劑', mar15)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.vaccineDoses![0].babyId).toBe(A);
    expect(r.vaccineDoses![0].key).toBe(`${A}|hepb|第一劑`);
  });

  it('兩邊都沒有接種紀錄時回傳空陣列', () => {
    const r = mergeBabies({ profiles: [], records: [] }, { profiles: [], records: [] });
    expect(r.vaccineDoses).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
cd web && npx vitest run tests/dataTransferCodec.test.ts tests/dataTransferMerge.test.ts
```

Expected: FAIL — `BackupPayloadV2` 沒有 `vaccineDoses` 欄位（型別錯誤），`r.vaccineDoses` 為 undefined。

- [ ] **Step 4: 改 `dataTransfer.ts`**

1. 頂端 import 補上：

```ts
import { makeDoseRecord, type VaccineDoseRecord } from './vaccineLog';
```

2. `BackupPayloadV2` 改成：

```ts
export interface BackupPayloadV2 {
  profiles: ProfileData[];
  records: RecordData[];
  /** 選填：舊檔沒有這一段。解碼後一律是陣列（可能為空）。 */
  vaccineDoses?: VaccineDoseRecord[];
}
```

3. `encodeV2` 改成（`wire` 物件末尾用條件展開，空陣列時整個鍵不出現）：

```ts
export function encodeV2(p: BackupPayloadV2): string {
  const doses = p.vaccineDoses ?? [];
  const wire = {
    version: 2,
    profiles: p.profiles.map((x) => ({ id: x.id, name: x.name, birthDate: isoFromMs(x.birthDate) })),
    records: p.records.map((r) =>
      stripUndefined({
        id: r.id,
        babyId: r.babyId,
        timestamp: isoFromMs(r.timestamp),
        feedAmount: r.feedAmount,
        stoolColor: r.stoolColor,
        stoolAmount: r.stoolAmount,
        stoolShape: r.stoolShape,
        hasUrine: r.hasUrine,
        urineAmount: r.urineAmount,
        sleep: r.sleep,
        temperature: r.temperature,
        weight: r.weight,
        note: r.note,
      }),
    ),
    // key 可從其他三個欄位推出，不寫進檔案。空陣列時整個鍵省略，
    // 讓還沒用這個功能的使用者匯出的檔案與舊版逐字節相同。
    ...(doses.length > 0
      ? {
          vaccineDoses: doses.map((d) => ({
            babyId: d.babyId,
            vaccineId: d.vaccineId,
            doseLabel: d.doseLabel,
            date: isoFromMs(d.date),
          })),
        }
      : {}),
  };
  return JSON.stringify(sortKeysDeep(wire), null, 2);
}
```

4. 在 `parseRecord` 之後、`decodeAny` 之前插入：

```ts
function parseVaccineDose(raw: unknown, where: string): VaccineDoseRecord {
  if (raw === null || typeof raw !== 'object') fail(where, '接種紀錄不是物件');
  const o = raw as Raw;
  if (typeof o.babyId !== 'string' || o.babyId === '') fail(where, '缺少 babyId');
  if (typeof o.vaccineId !== 'string' || o.vaccineId === '') fail(where, '缺少 vaccineId');
  if (typeof o.doseLabel !== 'string' || o.doseLabel === '') fail(where, '缺少 doseLabel');
  return makeDoseRecord(o.babyId, o.vaccineId, o.doseLabel, msFromIso(o.date as string));
}

function parseVaccineDoses(raw: unknown): VaccineDoseRecord[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('接種紀錄不是陣列');
  return raw.map((d, i) => parseVaccineDose(d, `第 ${i + 1} 筆接種紀錄`));
}
```

5. `decodeAny` 的 v2 分支改成：

```ts
  if (o.version === 2 && Array.isArray(o.profiles) && Array.isArray(o.records)) {
    const profiles = o.profiles.map((p, i) => parseProfile(p, `第 ${i + 1} 個寶寶`));
    const records = o.records.map((r, i) => parseRecord(r, `第 ${i + 1} 筆記錄`));
    return { profiles, records, vaccineDoses: parseVaccineDoses(o.vaccineDoses) };
  }
```

v1 分支的 return 改成：

```ts
    return { profiles: [profile], records, vaccineDoses: [] };
```

6. `mergeBabies` 整個換掉：

```ts
export function mergeBabies(local: BackupPayloadV2, incoming: BackupPayloadV2): BackupPayloadV2 {
  const profiles = [...local.profiles];
  const remap = new Map<string, string>(); // incoming babyId -> local babyId

  for (const p of incoming.profiles) {
    if (local.profiles.some((x) => x.id === p.id)) continue; // id 對中：保留本機
    const byName = local.profiles.find((x) => x.name === p.name);
    if (byName) {
      remap.set(p.id, byName.id); // 名字對中：重對映
    } else {
      profiles.push(p); // 全新寶寶
    }
  }

  const byId = new Map<string, RecordData>();
  for (const r of incoming.records) {
    const mapped = remap.get(r.babyId);
    byId.set(r.id, mapped ? { ...r, babyId: mapped } : r);
  }
  for (const r of local.records) byId.set(r.id, r); // 本機覆蓋 incoming

  const records = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { profiles, records, vaccineDoses: mergeVaccineDoses(local, incoming, remap) };
}

/** key = babyId|vaccineId|劑次，所以依 key 排序等同 spec 要求的三層排序。 */
function mergeVaccineDoses(
  local: BackupPayloadV2,
  incoming: BackupPayloadV2,
  remap: Map<string, string>,
): VaccineDoseRecord[] {
  const byKey = new Map<string, VaccineDoseRecord>();
  for (const d of incoming.vaccineDoses ?? []) {
    const mapped = remap.get(d.babyId);
    const rec = mapped ? makeDoseRecord(mapped, d.vaccineId, d.doseLabel, d.date) : d;
    byKey.set(rec.key, rec);
  }
  for (const d of local.vaccineDoses ?? []) byKey.set(d.key, d); // 本機覆蓋 incoming
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
```

- [ ] **Step 5: 跑全部測試**

```bash
cd web && npm test
```

Expected: 全部通過，包含 Task 3 那條原本 FAIL 的「匯入合併會存進接種紀錄表」。

- [ ] **Step 6: 型別檢查**

```bash
cd web && npx tsc --noEmit
```

Expected: 無錯誤。`SettingsPage.tsx` 的單一寶寶匯出（`doExport` 內的 `scoped`）此時會因為少了 `vaccineDoses` 而**不會**報錯（欄位是選填），但這樣匯出單一寶寶會漏掉接種紀錄 —— 下一步修掉。

- [ ] **Step 7: 修單一寶寶匯出的範圍過濾**

`web/src/ui/SettingsPage.tsx` 的 `doExport`，把 `scoped` 改成：

```ts
      const scoped =
        exportScope === 'all'
          ? data
          : {
              profiles: data.profiles.filter((p) => p.id === exportScope),
              records: data.records.filter((r) => r.babyId === exportScope),
              vaccineDoses: (data.vaccineDoses ?? []).filter((d) => d.babyId === exportScope),
            };
```

- [ ] **Step 8: 跑測試 + build**

```bash
cd web && npm test && npm run build
```

Expected: 測試全過、build 成功。

- [ ] **Step 9: Commit**

```bash
git add web/src/logic/dataTransfer.ts web/src/ui/SettingsPage.tsx web/tests/dataTransferCodec.test.ts web/tests/dataTransferMerge.test.ts
git commit -m "Carry vaccine dose records through export, import and merge"
```

---

## Task 5: web 畫面 — 時程表變色與對話框輸入日期

**Files:**
- Modify: `web/src/ui/VaccinePage.tsx`
- Modify: `web/src/ui/styles.css`

**Interfaces:**
- Consumes: Task 1 的 `doneMap` / `doseRecordKey`；Task 2 的 `nextMilestone` 第四參數；Task 3 的 `setVaccineDose` / `clearVaccineDose`
- Produces: 無（畫面層）

- [ ] **Step 1: 改 `VaccinePage.tsx` 的 import 與資料讀取**

把檔案頂端的 import 換成：

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FUNDING_NAMES,
  SCHEDULE_SOURCES,
  VACCINES,
  ageMonthsLabel,
  doseDate,
  nextMilestone,
  scheduleMilestones,
  type Funding,
  type ScheduledDose,
  type Vaccine,
} from '../logic/vaccines';
import { doneMap, doseRecordKey, type VaccineDoseRecord } from '../logic/vaccineLog';
import { db } from '../db/db';
import { clearVaccineDose, setVaccineDose } from '../db/repository';
import { BabySwitcher } from './BabySwitcher';
import { InfoDialog } from './components/InfoDialog';
import { dateInputValue, msFromDateInput, ymdSlash } from './format';
import type { PageProps } from './App';
```

- [ ] **Step 2: 在元件內讀出接種紀錄，並把已完成資訊接進 `nextMilestone`**

把 `export default function VaccinePage(...)` 開頭到 `const upcoming = ...` 換成：

```tsx
export default function VaccinePage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [selected, setSelected] = useState<Vaccine | null>(null);
  const now = Date.now();

  const babyId = currentBaby?.id ?? null;
  const logged = useLiveQuery(
    () => (babyId ? db.vaccineDoses.where('babyId').equals(babyId).toArray() : Promise.resolve([])),
    [babyId],
    [] as VaccineDoseRecord[],
  );
  const done = doneMap(logged);

  /** 某一劑的施打日期；沒有寶寶或沒紀錄回傳 undefined。 */
  const doneDate = (vaccineId: string, doseLabel: string): number | undefined =>
    babyId ? done.get(doseRecordKey(babyId, vaccineId, doseLabel)) : undefined;
  const isDone = (d: ScheduledDose) => doneDate(d.vaccine.id, d.dose.label) !== undefined;

  const milestones = scheduleMilestones();
  const upcoming = currentBaby ? nextMilestone(currentBaby.birthDate, now, VACCINES, isDone) : null;
```

- [ ] **Step 3: 讓標籤依施打狀態變色**

把 `vaccineButton` 換成：

```tsx
  const vaccineButton = (d: ScheduledDose) => {
    const date = doneDate(d.vaccine.id, d.dose.label);
    return (
      <button
        key={`${d.vaccine.id}-${d.dose.label}`}
        type="button"
        className={'vaccine-chip ' + d.dose.funding + (date ? ' done' : '')}
        onClick={() => setSelected(d.vaccine)}
      >
        <span className="vaccine-name">{d.vaccine.name}</span>
        <span className="vaccine-dose">
          {date
            ? `✓ ${d.dose.label}・${ymdSlash(date)}`
            : `${d.dose.label}・${FUNDING_NAMES[d.dose.funding]}`}
        </span>
      </button>
    );
  };
```

- [ ] **Step 4: 加存檔函式**

在 `vaccineButton` 之後插入：

```tsx
  async function saveDose(vaccineId: string, doseLabel: string, date: number) {
    if (!babyId) return;
    await setVaccineDose(babyId, vaccineId, doseLabel, date);
  }

  async function removeDose(vaccineId: string, doseLabel: string) {
    if (!babyId) return;
    await clearVaccineDose(babyId, vaccineId, doseLabel);
  }
```

- [ ] **Step 5: 把日期輸入放進對話框**

把檔案末尾 `{selected && (<InfoDialog …>…</InfoDialog>)}` 整段換成：

```tsx
      {selected && (
        <InfoDialog
          title={selected.name}
          subtitle={selected.en}
          onClose={() => setSelected(null)}
        >
          <p>{selected.description}</p>
          <ul className="dose-log">
            {selected.doses.map((dose) => {
              const date = doneDate(selected.id, dose.label);
              const inputId = `dose-${selected.id}-${dose.ageMonths}`;
              const planned = currentBaby ? doseDate(currentBaby.birthDate, dose.ageMonths) : 0;
              return (
                <li key={dose.label} className="dose-log-row">
                  <label htmlFor={inputId}>
                    {ageMonthsLabel(dose.ageMonths)}・{dose.label}・{FUNDING_NAMES[dose.funding]}
                  </label>
                  <div className="dose-log-controls">
                    <input
                      id={inputId}
                      type="date"
                      value={date ? dateInputValue(date) : ''}
                      disabled={!currentBaby}
                      onChange={(e) =>
                        e.target.value
                          ? saveDose(selected.id, dose.label, msFromDateInput(e.target.value))
                          : removeDose(selected.id, dose.label)
                      }
                    />
                    {currentBaby && date === undefined && (
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => saveDose(selected.id, dose.label, planned)}
                      >
                        預計 {ymdSlash(planned)}
                      </button>
                    )}
                    {date !== undefined && (
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => removeDose(selected.id, dose.label)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!currentBaby && (
            <p className="hint">尚未建立寶寶，請先到設定頁新增，才能記錄施打日期。</p>
          )}
          {selected.recurring && <p className="doses">{selected.recurring}</p>}
          {selected.note && <p className="doses">附註：{selected.note}</p>}
        </InfoDialog>
      )}
```

- [ ] **Step 6: 加樣式**

在 `web/src/ui/styles.css` 的 `.vaccine-chip .vaccine-dose { … }` 那一行**之後**（必須在 `.vaccine-chip.self` 系列之後，特異性相同時靠順序取勝）插入：

```css
/* 已施打：綠色系。除了顏色還有 ✓ 與日期文字，不以顏色為唯一線索。 */
.vaccine-chip.done,
.vaccine-chip.self.done { border-color: #7fb894; background: #eef8f1; }
.vaccine-chip.done:hover,
.vaccine-chip.self.done:hover { background: #ddf0e4; }
.vaccine-chip.done .vaccine-dose { color: #256b43; font-weight: 700; }

.dose-log { list-style: none; margin: 12px 0 0; padding: 0; }
.dose-log-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 0; border-bottom: 1px dashed var(--color-border-soft);
}
.dose-log-row:last-child { border-bottom: none; }
.dose-log-row > label { font-size: 13px; color: var(--color-text-soft); }
.dose-log-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dose-log-controls input[type='date'] {
  flex: 1 1 150px; min-width: 0;
  font-family: inherit; font-size: 15px; padding: 7px 10px;
  color: var(--color-text); background: #fff;
  border: 2px solid var(--color-border); border-radius: var(--radius-md);
}
.dose-log-controls input[type='date']:disabled { opacity: 0.55; }
.btn-soft { padding: 6px 12px; font-size: 13px; }
```

- [ ] **Step 7: 型別檢查與 build**

```bash
cd web && npx tsc --noEmit && npm run build
```

Expected: 兩者皆無錯誤。

- [ ] **Step 8: 瀏覽器實測**

用 preview 工具啟動 `web` dev server（`.claude/launch.json` 已有設定，若無則新增一筆 `npm run dev`、port 5173），然後：
1. 到疫苗分頁，點任一支疫苗 → 對話框出現各劑次與日期欄位
2. 按「預計 …」→ 對話框內該列出現日期、關掉後時程表該標籤變綠且顯示日期
3. 按「清除」→ 回到原本顏色
4. 讀 console 確認沒有錯誤

- [ ] **Step 9: Commit**

```bash
git add web/src/ui/VaccinePage.tsx web/src/ui/styles.css
git commit -m "Colour the schedule by dose status and log dates in the dialog"
```

---

## Task 6: web 畫面 — 逾期未打區塊

**Files:**
- Modify: `web/src/ui/VaccinePage.tsx`
- Modify: `web/src/ui/styles.css`

**Interfaces:**
- Consumes: Task 1 的 `overdueDoses`
- Produces: 無

- [ ] **Step 1: 補 import 與計算**

`VaccinePage.tsx` 的 import 補上 `overdueDoses`：

```tsx
import { doneMap, doseRecordKey, overdueDoses, type VaccineDoseRecord } from '../logic/vaccineLog';
```

在 `const upcoming = …` 之後插入：

```tsx
  const overdue = currentBaby
    ? overdueDoses(currentBaby.birthDate, now, currentBaby.id, done)
    : [];
```

- [ ] **Step 2: 加逾期清單的 render 函式**

在 `removeDose` 之後插入：

```tsx
  const overdueList = (funding: Funding) => {
    const items = overdue.filter((d) => d.dose.funding === funding);
    if (items.length === 0) return null;
    return (
      <div className={'overdue-group ' + funding}>
        <p className="overdue-label">
          {funding === 'public' ? '公費' : '自費（依醫師建議選擇性接種）'}
        </p>
        <ul className="overdue-items">
          {items.map((d) => {
            const due = doseDate(currentBaby!.birthDate, d.dose.ageMonths);
            return (
              <li key={`${d.vaccine.id}-${d.dose.label}`}>
                <button type="button" onClick={() => setSelected(d.vaccine)}>
                  <span className="overdue-name">{d.vaccine.name} {d.dose.label}</span>
                  <span className="overdue-when">
                    預計 {ymdSlash(due)}・逾期 {-daysUntil(due, now)} 天
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
```

- [ ] **Step 3: 插進「接下來要打的疫苗」卡片頂端**

把該 `<section className="card">` 內的 `<h2>接下來要打的疫苗</h2>` 之後、`{!currentBaby && …}` 之前，插入：

```tsx
        {overdue.length > 0 && (
          <div className="overdue" role="group" aria-label="接種日已過、還沒記錄的疫苗">
            <p className="overdue-title">這幾劑的接種日已經過了，還沒記錄施打日期</p>
            {overdueList('public')}
            {overdueList('self')}
          </div>
        )}
```

- [ ] **Step 4: 加樣式**

在 `web/src/ui/styles.css` 的 `.btn-soft { … }` 之後插入：

```css
.overdue {
  margin: 0 0 14px; padding: 12px;
  background: var(--color-danger-soft);
  border: 2px solid #f2c6c2; border-radius: var(--radius-md);
}
.overdue-title { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: var(--color-danger); }
.overdue-group + .overdue-group { margin-top: 10px; }
.overdue-label { margin: 0 0 4px; font-size: 12px; font-weight: 700; color: var(--color-text-soft); }
.overdue-group.public .overdue-label { color: var(--color-danger); }
.overdue-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.overdue-items button {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  width: 100%; padding: 7px 11px; text-align: left;
  font-family: inherit; color: var(--color-text);
  background: #fff; border: 2px solid var(--color-border-soft);
  border-radius: var(--radius-md); cursor: pointer;
}
.overdue-items button:hover { background: var(--color-primary-soft); }
.overdue-items button:active { transform: scale(0.99); }
.overdue-name { font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
.overdue-when { font-size: 12px; color: var(--color-text-soft); }
.overdue-group.self .overdue-items button { opacity: 0.85; }
```

- [ ] **Step 5: 型別檢查、測試、build**

```bash
cd web && npx tsc --noEmit && npm test && npm run build
```

Expected: 全部通過。

- [ ] **Step 6: 瀏覽器實測**

1. 到設定頁把寶寶生日改成一年多前 → 疫苗分頁應出現逾期區塊，公費在上、自費在下
2. 點逾期清單任一項 → 開出該疫苗的對話框
3. 填入日期 → 該項從逾期清單消失
4. 截圖存證，讀 console 確認無錯誤

- [ ] **Step 7: Commit**

```bash
git add web/src/ui/VaccinePage.tsx web/src/ui/styles.css
git commit -m "List doses whose due date passed without a record"
```

---

## Task 7: iOS 邏輯層 — `VaccineLog` 與日期邊界

**Files:**
- Create: `BabyMonster/Logic/VaccineLog.swift`
- Create: `BabyMonsterTests/VaccineLogTests.swift`
- Modify: `BabyMonster/Logic/Vaccines.swift`（檔尾的 `next`）
- Modify: `BabyMonsterTests/VaccineTests.swift`（`testMilestoneOnTheDayIsNotUpcoming`）

**Interfaces:**
- Consumes: `Vaccines.doseDate`、`Vaccine`、`VaccineDose`、`ScheduledDose`
- Produces:
  - `struct VaccineDoseData: Codable, Equatable { var babyId: UUID; var vaccineId: String; var doseLabel: String; var date: Date; var key: String { get } }`
  - `VaccineLog.key(babyId:vaccineId:doseLabel:) -> String`
  - `VaccineLog.doneKeys(_ records: [VaccineDoseData]) -> [String: Date]`
  - `VaccineLog.overdue(birthDate:asOf:babyId:done:calendar:vaccines:) -> [ScheduledDose]`
  - `Vaccines.next(birthDate:asOf:calendar:vaccines:isDone:) -> Milestone?`（`isDone` 預設 `{ _ in false }`）

- [ ] **Step 1: 寫失敗的測試**

建立 `BabyMonsterTests/VaccineLogTests.swift`：

```swift
import XCTest
@testable import BabyMonster

final class VaccineLogTests: XCTestCase {
    let cal = Calendar(identifier: .gregorian)
    let baby = UUID(uuidString: "AAAA1111-2222-3333-4444-555566667777")!

    func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    var birth: Date { day(2026, 7, 22) }

    /// 兩支測試用疫苗：A 有 2、4 個月兩劑，B 只有 4 個月一劑（驗證同月齡的排序）。
    let fake: [Vaccine] = [
        Vaccine(id: "a", name: "A", en: "A", description: "測試用疫苗說明文字，長度足夠通過檢查。",
                doses: [VaccineDose(label: "第一劑", ageMonths: 2, funding: .publicFunded),
                        VaccineDose(label: "第二劑", ageMonths: 4, funding: .publicFunded)]),
        Vaccine(id: "b", name: "B", en: "B", description: "測試用疫苗說明文字，長度足夠通過檢查。",
                doses: [VaccineDose(label: "一劑", ageMonths: 4, funding: .selfPaid)]),
    ]

    func names(_ ds: [ScheduledDose]) -> [String] {
        ds.map { "\($0.vaccine.id):\($0.dose.label)" }
    }

    func overdue(_ now: Date, done: [String: Date] = [:]) -> [ScheduledDose] {
        VaccineLog.overdue(birthDate: birth, asOf: now, babyId: baby,
                           done: done, calendar: cal, vaccines: fake)
    }

    // MARK: - key

    func testKeyJoinsBabyVaccineAndDose() {
        XCTAssertEqual(VaccineLog.key(babyId: baby, vaccineId: "dtap-hib-ipv", doseLabel: "第一劑"),
                       "\(baby.uuidString)|dtap-hib-ipv|第一劑")
    }

    func testDoseDataDerivesItsOwnKey() {
        let d = VaccineDoseData(babyId: baby, vaccineId: "hepb", doseLabel: "第一劑",
                                date: day(2026, 3, 15))
        XCTAssertEqual(d.key, VaccineLog.key(babyId: baby, vaccineId: "hepb", doseLabel: "第一劑"))
    }

    func testDoneKeysMapsKeyToDate() {
        let d = VaccineDoseData(babyId: baby, vaccineId: "a", doseLabel: "第一劑",
                                date: day(2026, 9, 20))
        let map = VaccineLog.doneKeys([d])
        XCTAssertEqual(map[d.key], day(2026, 9, 20))
        XCTAssertNil(map[VaccineLog.key(babyId: baby, vaccineId: "a", doseLabel: "第二劑")])
    }

    // MARK: - overdue

    func testOverdueOnlyCountsDosesDueBeforeToday() {
        XCTAssertEqual(names(overdue(day(2026, 10, 1))), ["a:第一劑"])
    }

    func testDoseDueTodayIsNotOverdue() {
        XCTAssertEqual(overdue(day(2026, 9, 22)).count, 0)
    }

    func testOverdueStartsTheDayAfter() {
        XCTAssertEqual(names(overdue(day(2026, 9, 23))), ["a:第一劑"])
    }

    func testLateInTheDayStillNotOverdue() {
        let late = cal.date(byAdding: .hour, value: 23, to: day(2026, 9, 22))!
        XCTAssertEqual(overdue(late).count, 0)
    }

    func testRecordedDoseIsNotOverdue() {
        let done = VaccineLog.doneKeys([
            VaccineDoseData(babyId: baby, vaccineId: "a", doseLabel: "第一劑", date: day(2026, 9, 25))
        ])
        XCTAssertEqual(overdue(day(2026, 10, 1), done: done).count, 0)
    }

    func testOverdueSortsByAgeThenDefinitionOrder() {
        XCTAssertEqual(names(overdue(day(2027, 1, 1))), ["a:第一劑", "a:第二劑", "b:一劑"])
    }

    func testAnotherBabysRecordDoesNotCount() {
        let done = VaccineLog.doneKeys([
            VaccineDoseData(babyId: UUID(), vaccineId: "a", doseLabel: "第一劑", date: day(2026, 9, 25))
        ])
        XCTAssertEqual(names(overdue(day(2026, 10, 1), done: done)), ["a:第一劑"])
    }

    // MARK: - next 的已完成判斷

    func testNextSkipsAFullyRecordedMilestone() {
        let m = Vaccines.next(birthDate: birth, asOf: day(2026, 8, 1), calendar: cal,
                              vaccines: fake, isDone: { $0.dose.ageMonths == 2 })
        XCTAssertEqual(m?.ageMonths, 4)
    }

    func testNextKeepsAPartiallyRecordedMilestone() {
        let m = Vaccines.next(birthDate: birth, asOf: day(2026, 8, 1), calendar: cal,
                              vaccines: fake,
                              isDone: { $0.vaccine.id == "a" && $0.dose.ageMonths == 4 })
        XCTAssertEqual(m?.ageMonths, 2)
    }
}
```

- [ ] **Step 2: 改既有那條期望值翻轉的測試**

`BabyMonsterTests/VaccineTests.swift` 裡，把：

```swift
    func testMilestoneOnTheDayIsNotUpcoming() {
        let birth = day(2026, 7, 22)
        let onTheDay = Vaccines.doseDate(birthDate: birth, ageMonths: 2, calendar: cal)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: onTheDay, calendar: cal)?.ageMonths, 4)
    }
```

換成：

```swift
    func testMilestoneOnTheDayIsStillUpcoming() {
        let birth = day(2026, 7, 22)
        let onTheDay = Vaccines.doseDate(birthDate: birth, ageMonths: 2, calendar: cal)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: onTheDay, calendar: cal)?.ageMonths, 2)
        let late = cal.date(byAdding: .hour, value: 23, to: onTheDay)!
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: late, calendar: cal)?.ageMonths, 2)
    }
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

Expected: 編譯失敗（找不到 `VaccineLog`、`VaccineDoseData`、`next` 沒有 `isDone` 參數）。

- [ ] **Step 4: 建立 `VaccineLog.swift`**

```swift
import Foundation

/// 疫苗施打紀錄的值型別。key 由寶寶＋疫苗＋劑次組成，同一寶寶的同一劑只會有一筆。
/// key 只存在本機，不寫進備份檔（見 DataTransfer）。
struct VaccineDoseData: Codable, Equatable {
    var babyId: UUID
    var vaccineId: String
    var doseLabel: String
    /// 實際施打日期
    var date: Date

    var key: String { VaccineLog.key(babyId: babyId, vaccineId: vaccineId, doseLabel: doseLabel) }

    private enum CodingKeys: String, CodingKey { case babyId, vaccineId, doseLabel, date }
}

enum VaccineLog {
    static func key(babyId: UUID, vaccineId: String, doseLabel: String) -> String {
        "\(babyId.uuidString)|\(vaccineId)|\(doseLabel)"
    }

    /// key → 施打日期。同 key 重複時後者覆蓋前者。
    static func doneKeys(_ records: [VaccineDoseData]) -> [String: Date] {
        Dictionary(records.map { ($0.key, $0.date) }, uniquingKeysWith: { _, later in later })
    }

    /// 接種日早於今天、又沒有施打紀錄的劑次，依月齡由小到大（同月齡維持疫苗定義順序）。
    static func overdue(birthDate: Date, asOf now: Date, babyId: UUID,
                        done: [String: Date], calendar: Calendar = .current,
                        vaccines: [Vaccine] = Vaccines.all) -> [ScheduledDose] {
        let today = calendar.startOfDay(for: now)
        var out: [ScheduledDose] = []
        for v in vaccines {
            for d in v.doses {
                let due = Vaccines.doseDate(birthDate: birthDate, ageMonths: d.ageMonths,
                                            calendar: calendar)
                if calendar.startOfDay(for: due) >= today { continue }
                if done[key(babyId: babyId, vaccineId: v.id, doseLabel: d.label)] != nil { continue }
                out.append(ScheduledDose(vaccine: v, dose: d))
            }
        }
        // Swift 的 sorted 不保證穩定，用 offset 當同月齡的並列條件（同 Vaccines.milestones 的做法）。
        return out.enumerated()
            .sorted { a, b in
                a.element.dose.ageMonths == b.element.dose.ageMonths
                    ? a.offset < b.offset
                    : a.element.dose.ageMonths < b.element.dose.ageMonths
            }
            .map(\.element)
    }
}
```

- [ ] **Step 5: 改 `Vaccines.next`**

把 `BabyMonster/Logic/Vaccines.swift` 檔尾的 `next` 換成：

```swift
    /// 最接近、還沒過的接種時間；全部都過了回傳 nil。
    ///
    /// 邊界以「今天 00:00」切：接種日就是今天時仍算即將接種（顯示還有 0 天），
    /// 早於今天才歸為逾期（見 VaccineLog.overdue），兩者剛好接合、不留空隙。
    /// isDone 回報某一劑是否已有施打紀錄；整組都打完的月齡直接跳過。
    static func next(birthDate: Date, asOf now: Date, calendar: Calendar = .current,
                     vaccines: [Vaccine] = all,
                     isDone: (ScheduledDose) -> Bool = { _ in false }) -> Milestone? {
        let today = calendar.startOfDay(for: now)
        return milestones(vaccines: vaccines).first { m in
            let due = doseDate(birthDate: birthDate, ageMonths: m.ageMonths, calendar: calendar)
            return calendar.startOfDay(for: due) >= today && !m.doses.allSatisfy(isDone)
        }
    }
```

- [ ] **Step 6: 跑測試確認通過**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

Expected: 全部測試通過（78 + 13 條新測試）。

- [ ] **Step 7: Commit**

```bash
git add BabyMonster/Logic/VaccineLog.swift BabyMonster/Logic/Vaccines.swift BabyMonsterTests/VaccineLogTests.swift BabyMonsterTests/VaccineTests.swift
git commit -m "Mirror the vaccine dose logic on iOS"
```

---

## Task 8: iOS 儲存層 — `VaccineDoseEntity`

**Files:**
- Create: `BabyMonster/Models/VaccineDoseEntity.swift`
- Modify: `BabyMonster/Models/ModelContainer+App.swift`
- Modify: `BabyMonsterTests/PersistenceMappingTests.swift`

**Interfaces:**
- Consumes: Task 7 的 `VaccineDoseData`
- Produces:
  - `VaccineDoseEntity`（`init(data:)`、`var data: VaccineDoseData`）
  - `AppModelContainer.schema` 含 `VaccineDoseEntity.self`

- [ ] **Step 1: 寫失敗的測試**

在 `BabyMonsterTests/PersistenceMappingTests.swift` 末尾（class 內）追加：

```swift
    func testVaccineDoseEntityRoundTrip() throws {
        let container = try AppModelContainer.makeInMemory()
        let context = ModelContext(container)
        let baby = UUID()
        let data = VaccineDoseData(babyId: baby, vaccineId: "dtap-hib-ipv",
                                   doseLabel: "第一劑", date: Date(timeIntervalSince1970: 1_770_000_000))
        context.insert(VaccineDoseEntity(data: data))
        try context.save()

        let fetched = try context.fetch(FetchDescriptor<VaccineDoseEntity>())
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.data, data)
        XCTAssertEqual(fetched.first?.key, data.key)
    }
```

若該檔頂端沒有 `import SwiftData`，補上。

- [ ] **Step 2: 跑測試確認失敗**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:BabyMonsterTests/PersistenceMappingTests 2>&1 | tail -20
```

Expected: 編譯失敗，找不到 `VaccineDoseEntity`。

- [ ] **Step 3: 建立 entity**

`BabyMonster/Models/VaccineDoseEntity.swift`：

```swift
import Foundation
import SwiftData

/// 一劑疫苗的施打紀錄。key = babyId|vaccineId|劑次，同一寶寶的同一劑只會有一筆。
@Model
final class VaccineDoseEntity {
    @Attribute(.unique) var key: String
    var babyId: UUID
    var vaccineId: String
    var doseLabel: String
    var date: Date

    init(key: String, babyId: UUID, vaccineId: String, doseLabel: String, date: Date) {
        self.key = key
        self.babyId = babyId
        self.vaccineId = vaccineId
        self.doseLabel = doseLabel
        self.date = date
    }

    convenience init(data: VaccineDoseData) {
        self.init(key: data.key, babyId: data.babyId, vaccineId: data.vaccineId,
                  doseLabel: data.doseLabel, date: data.date)
    }

    var data: VaccineDoseData {
        VaccineDoseData(babyId: babyId, vaccineId: vaccineId, doseLabel: doseLabel, date: date)
    }
}
```

- [ ] **Step 4: 加進 schema**

`BabyMonster/Models/ModelContainer+App.swift`：

```swift
    static let schema = Schema([RecordEntity.self, ProfileEntity.self, VaccineDoseEntity.self])
```

- [ ] **Step 5: 跑全部測試**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -20
```

Expected: 全部通過。

- [ ] **Step 6: Commit**

```bash
git add BabyMonster/Models/VaccineDoseEntity.swift BabyMonster/Models/ModelContainer+App.swift BabyMonsterTests/PersistenceMappingTests.swift
git commit -m "Persist vaccine dose records with SwiftData"
```

---

## Task 9: iOS 匯出匯入 — `vaccineDoses` 欄位與合併

**Files:**
- Modify: `BabyMonster/Logic/DataTransfer.swift`
- Modify: `BabyMonsterTests/DataTransferV2Tests.swift`

**Interfaces:**
- Consumes: Task 7 的 `VaccineDoseData`
- Produces:
  - `BackupPayloadV2` 多 `var vaccineDoses: [VaccineDoseData] = []`（編碼時空陣列不輸出、解碼時缺欄位為 `[]`）
  - `mergeBabies(localProfiles:localRecords:incomingProfiles:incomingRecords:localVaccineDoses:incomingVaccineDoses:)` 回傳 `(profiles:records:vaccineDoses:)`

- [ ] **Step 1: 寫失敗的測試**

在 `BabyMonsterTests/DataTransferV2Tests.swift` 末尾（class 內）追加：

```swift
    // MARK: - 接種紀錄

    private func dose(_ babyId: UUID, _ vaccineId: String, _ label: String,
                      _ date: Date) -> VaccineDoseData {
        VaccineDoseData(babyId: babyId, vaccineId: vaccineId, doseLabel: label, date: date)
    }

    func testEmptyVaccineDosesAreOmittedFromTheFile() throws {
        let p = BackupPayloadV2(profiles: [], records: [])
        let json = String(data: try DataTransfer.encodeV2(p), encoding: .utf8)!
        XCTAssertFalse(json.contains("vaccineDoses"))
    }

    func testVaccineDosesRoundTrip() throws {
        let baby = UUID()
        let d = dose(baby, "dtap-hib-ipv", "第一劑", Date(timeIntervalSince1970: 1_770_000_000))
        let data = try DataTransfer.encodeV2(BackupPayloadV2(profiles: [], records: [],
                                                             vaccineDoses: [d]))
        XCTAssertEqual(try DataTransfer.decodeAny(data).vaccineDoses, [d])
    }

    func testFileWithoutVaccineDosesDecodesToEmpty() throws {
        let json = """
        {"version":2,"profiles":[],"records":[]}
        """.data(using: .utf8)!
        XCTAssertEqual(try DataTransfer.decodeAny(json).vaccineDoses, [])
    }

    func testMergeKeepsLocalDoseOnConflict() {
        let baby = UUID()
        let local = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let incoming = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 2_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [], localRecords: [], incomingProfiles: [], incomingRecords: [],
            localVaccineDoses: [local], incomingVaccineDoses: [incoming])
        XCTAssertEqual(r.vaccineDoses, [local])
    }

    func testMergeRemapsDoseBabyIdWhenProfilesMatchByName() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let remoteBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let d = dose(remoteBaby.id, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [remoteBaby], incomingRecords: [],
            localVaccineDoses: [], incomingVaccineDoses: [d])
        XCTAssertEqual(r.profiles.count, 1)
        XCTAssertEqual(r.vaccineDoses.first?.babyId, localBaby.id)
    }

    func testMergeSortsDosesByKey() {
        let baby = UUID()
        let first = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let second = dose(baby, "hepb", "第二劑", Date(timeIntervalSince1970: 2_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [], localRecords: [], incomingProfiles: [], incomingRecords: [],
            localVaccineDoses: [second], incomingVaccineDoses: [first])
        XCTAssertEqual(r.vaccineDoses.map(\.doseLabel), ["第一劑", "第二劑"])
    }
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:BabyMonsterTests/DataTransferV2Tests 2>&1 | tail -20
```

Expected: 編譯失敗（`BackupPayloadV2` 沒有 `vaccineDoses`、`mergeBabies` 沒有那兩個參數）。

- [ ] **Step 3: 改 `BackupPayloadV2`**

把 `BabyMonster/Logic/DataTransfer.swift` 的 `struct BackupPayloadV2` 換成：

```swift
struct BackupPayloadV2: Codable, Equatable {
    var version: Int = 2
    var profiles: [ProfileData]
    var records: [RecordData]
    /// 選填：舊檔沒有這一段。空陣列時不寫進檔案，讓沒用這個功能的匯出結果與舊版相同。
    var vaccineDoses: [VaccineDoseData] = []

    init(version: Int = 2, profiles: [ProfileData], records: [RecordData],
         vaccineDoses: [VaccineDoseData] = []) {
        self.version = version
        self.profiles = profiles
        self.records = records
        self.vaccineDoses = vaccineDoses
    }

    private enum CodingKeys: String, CodingKey { case version, profiles, records, vaccineDoses }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 2
        profiles = try c.decode([ProfileData].self, forKey: .profiles)
        records = try c.decode([RecordData].self, forKey: .records)
        vaccineDoses = try c.decodeIfPresent([VaccineDoseData].self, forKey: .vaccineDoses) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(profiles, forKey: .profiles)
        try c.encode(records, forKey: .records)
        if !vaccineDoses.isEmpty { try c.encode(vaccineDoses, forKey: .vaccineDoses) }
    }
}
```

`profiles` 用硬性 `decode`，所以 v1 檔（只有 `profile` 單數）仍會解碼失敗並落到 `decodeAny` 的 v1 分支。

- [ ] **Step 4: 改 `mergeBabies`**

把 `extension DataTransfer` 裡的 `mergeBabies` 換成：

```swift
    /// 寶寶合併：id 對中 → 本機為準；名字對中 → 重對映進來記錄的 babyId；都沒中 → 新增。
    /// 記錄走 mergeRecords；接種紀錄以 key 去重、本機優先、依 key 排序
    /// （key = babyId|vaccineId|劑次，等同依這三層排序）。
    static func mergeBabies(localProfiles: [ProfileData], localRecords: [RecordData],
                            incomingProfiles: [ProfileData], incomingRecords: [RecordData],
                            localVaccineDoses: [VaccineDoseData] = [],
                            incomingVaccineDoses: [VaccineDoseData] = [])
        -> (profiles: [ProfileData], records: [RecordData], vaccineDoses: [VaccineDoseData]) {
        var profiles = localProfiles
        var idRemap: [UUID: UUID] = [:]
        for p in incomingProfiles {
            if localProfiles.contains(where: { $0.id == p.id }) { continue }
            if let match = localProfiles.first(where: { $0.name == p.name }) {
                idRemap[p.id] = match.id
            } else {
                profiles.append(p)
            }
        }
        let remapped = incomingRecords.map { r -> RecordData in
            var r = r
            if let bid = r.babyId, let mapped = idRemap[bid] { r.babyId = mapped }
            return r
        }
        var byKey: [String: VaccineDoseData] = [:]
        for d in incomingVaccineDoses {
            var d = d
            if let mapped = idRemap[d.babyId] { d.babyId = mapped }
            byKey[d.key] = d
        }
        for d in localVaccineDoses { byKey[d.key] = d } // 本機覆蓋 incoming
        let doses = byKey.values.sorted { $0.key < $1.key }
        return (profiles, mergeRecords(local: localRecords, incoming: remapped), doses)
    }
```

- [ ] **Step 5: 跑測試**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

Expected: 全部通過。既有測試都用 `result.profiles` / `result.records` 具名成員存取，加第三個成員不影響；若有解構寫法報錯，改成具名存取。

- [ ] **Step 6: Commit**

```bash
git add BabyMonster/Logic/DataTransfer.swift BabyMonsterTests/DataTransferV2Tests.swift
git commit -m "Carry vaccine dose records through the iOS backup file"
```

---

## Task 10: iOS 畫面 — 變色、日期輸入、逾期區塊與設定頁接線

**Files:**
- Modify: `BabyMonster/Views/VaccineView.swift`
- Modify: `BabyMonster/Views/SettingsView.swift`

**Interfaces:**
- Consumes: Task 7 的 `VaccineLog`、Task 8 的 `VaccineDoseEntity`、Task 9 的 `mergeBabies`
- Produces: 無

- [ ] **Step 1: `VaccineView` 讀出接種紀錄**

把 `VaccineView` 開頭的屬性區換成：

```swift
struct VaccineView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @Query private var doseLogs: [VaccineDoseEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var selected: Vaccine?

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    /// 目前寶寶的施打紀錄：key → 施打日期。
    private var done: [String: Date] {
        guard let baby = currentBaby else { return [:] }
        return VaccineLog.doneKeys(doseLogs.filter { $0.babyId == baby.id }.map(\.data))
    }

    private func doneDate(_ vaccineId: String, _ doseLabel: String) -> Date? {
        guard let baby = currentBaby else { return nil }
        return done[VaccineLog.key(babyId: baby.id, vaccineId: vaccineId, doseLabel: doseLabel)]
    }

    private var upcoming: Milestone? {
        guard let baby = currentBaby else { return nil }
        return Vaccines.next(birthDate: baby.birthDate, asOf: Date(),
                             isDone: { doneDate($0.vaccine.id, $0.dose.label) != nil })
    }

    private var overdue: [ScheduledDose] {
        guard let baby = currentBaby else { return [] }
        return VaccineLog.overdue(birthDate: baby.birthDate, asOf: Date(),
                                  babyId: baby.id, done: done)
    }
```

- [ ] **Step 2: 讓 sheet 帶上寶寶資訊**

把 `.sheet(item: $selected) { … }` 換成：

```swift
            .sheet(item: $selected) { vaccine in
                VaccineDetailSheet(vaccine: vaccine, baby: currentBaby)
            }
```

- [ ] **Step 3: 標籤依施打狀態變色**

把 `vaccineButton` 換成：

```swift
    private func vaccineButton(_ d: ScheduledDose) -> some View {
        let date = doneDate(d.vaccine.id, d.dose.label)
        return Button { selected = d.vaccine } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.vaccine.name).font(.subheadline)
                    if let date {
                        Text("\(d.dose.label)・\(date, format: .dateTime.year().month().day())")
                            .font(.caption).foregroundStyle(Color.doseDoneText)
                    } else {
                        Text("\(d.dose.label)・\(d.dose.funding.displayName)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: date != nil ? "checkmark.circle.fill" : "info.circle")
                    .foregroundStyle(date != nil ? Color.doseDoneText : Color.accentColor)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(date != nil ? Color.doseDoneFill : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
```

- [ ] **Step 4: 加逾期區塊**

在 `upcomingSection` 的 `Section("接下來要打的疫苗") {` 之後、`if currentBaby == nil {` 之前插入：

```swift
            if !overdue.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("這幾劑的接種日已經過了，還沒記錄施打日期")
                        .font(.footnote.bold()).foregroundStyle(.red)
                    overdueGroup(.publicFunded, title: "公費")
                    overdueGroup(.selfPaid, title: "自費（依醫師建議選擇性接種）")
                }
                .padding(.vertical, 2)
            }
```

並在 `noteText` 之前加入：

```swift
    @ViewBuilder
    private func overdueGroup(_ funding: Funding, title: String) -> some View {
        let items = overdue.filter { $0.dose.funding == funding }
        if !items.isEmpty, let baby = currentBaby {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption.bold())
                    .foregroundStyle(funding == .publicFunded ? .red : .secondary)
                ForEach(items) { d in
                    let due = Vaccines.doseDate(birthDate: baby.birthDate, ageMonths: d.dose.ageMonths)
                    Button { selected = d.vaccine } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(d.vaccine.name) \(d.dose.label)").font(.subheadline)
                            Text("預計 \(due, format: .dateTime.year().month().day())・逾期 \(-daysUntil(due)) 天")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
```

- [ ] **Step 5: 加顏色定義**

在 `VaccineView.swift` 檔案末尾加：

```swift
private extension Color {
    /// 已施打的標籤配色。淺綠底＋深綠字，與白底的對比高於 4.5:1。
    static let doseDoneFill = Color(red: 0.93, green: 0.97, blue: 0.94)
    static let doseDoneText = Color(red: 0.13, green: 0.42, blue: 0.26)
}
```

- [ ] **Step 6: 改 `VaccineDetailSheet` 加入日期輸入**

把整個 `struct VaccineDetailSheet` 換成：

```swift
struct VaccineDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var doseLogs: [VaccineDoseEntity]
    let vaccine: Vaccine
    let baby: ProfileEntity?

    private func entity(_ doseLabel: String) -> VaccineDoseEntity? {
        guard let baby else { return nil }
        let key = VaccineLog.key(babyId: baby.id, vaccineId: vaccine.id, doseLabel: doseLabel)
        return doseLogs.first { $0.key == key }
    }

    var body: some View {
        NavigationStack {
            List {
                Section { Text(vaccine.description) }
                Section("接種時程與施打日期") {
                    if baby == nil {
                        Text("尚未建立寶寶，請先到設定頁新增，才能記錄施打日期。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(vaccine.doses) { d in doseRow(d) }
                    if let r = vaccine.recurring {
                        Text(r).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if let note = vaccine.note {
                    Section("附註") { Text(note).font(.footnote) }
                }
            }
            .navigationTitle(vaccine.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("關閉") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private func doseRow(_ d: VaccineDose) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(Vaccines.ageLabel(d.ageMonths))・\(d.label)・\(d.funding.displayName)")
                .font(.caption).foregroundStyle(.secondary)
            if let baby {
                if let e = entity(d.label) {
                    HStack {
                        DatePicker("施打日期",
                                   selection: Binding(get: { e.date },
                                                      set: { e.date = $0 }),
                                   displayedComponents: .date)
                            .labelsHidden()
                        Spacer()
                        Button("清除", role: .destructive) { context.delete(e) }
                            .font(.caption)
                    }
                } else {
                    // DatePicker 永遠有值、無法表達「沒有日期」，所以未施打時只給按鈕。
                    // 按下以預計接種日建立紀錄，再讓使用者微調。
                    let planned = Vaccines.doseDate(birthDate: baby.birthDate, ageMonths: d.ageMonths)
                    Button("記錄施打（預設 \(planned, format: .dateTime.year().month().day())）") {
                        context.insert(VaccineDoseEntity(data: VaccineDoseData(
                            babyId: baby.id, vaccineId: vaccine.id,
                            doseLabel: d.label, date: planned)))
                    }
                    .font(.subheadline)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
```

- [ ] **Step 7: 設定頁接線 — 刪寶寶、匯出、匯入**

`BabyMonster/Views/SettingsView.swift`：

1. 屬性區加一個 query（放在既有的 `@Query` 之後）：

```swift
    @Query private var doseLogs: [VaccineDoseEntity]
```

2. `deleteBaby` 內，在 `context.delete(baby)` **之前**插入：

```swift
        for d in doseLogs where d.babyId == baby.id { context.delete(d) }
```

3. `prepareExport` 內，把 payload 建構改成：

```swift
        let selectedDoses = doseLogs.map { $0.data }.filter { ids.contains($0.babyId) }
        let payload = BackupPayloadV2(profiles: selectedProfiles, records: selectedRecords,
                                      vaccineDoses: selectedDoses)
```

4. `handleImport` 內，把 merge 與寫入改成：

```swift
                let merged = DataTransfer.mergeBabies(
                    localProfiles: profiles.map { $0.data },
                    localRecords: records.map { $0.data },
                    incomingProfiles: incoming.profiles,
                    incomingRecords: incoming.records,
                    localVaccineDoses: doseLogs.map { $0.data },
                    incomingVaccineDoses: incoming.vaccineDoses)
                let existingProfileIds = Set(profiles.map { $0.id })
                for p in merged.profiles where !existingProfileIds.contains(p.id) {
                    context.insert(ProfileEntity(data: p))
                }
                let existingRecordIds = Set(records.map { $0.id })
                for r in merged.records where !existingRecordIds.contains(r.id) {
                    context.insert(RecordEntity(data: r))
                }
                let existingDoseKeys = Set(doseLogs.map { $0.key })
                for d in merged.vaccineDoses where !existingDoseKeys.contains(d.key) {
                    context.insert(VaccineDoseEntity(data: d))
                }
```

- [ ] **Step 8: 建置與測試**

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

Expected: 編譯成功、全部測試通過。

- [ ] **Step 9: 模擬器實測**

用 iOS Simulator 工具（先 `attach` 再 `launch`）：
1. 疫苗分頁 → 點五合一 → 四劑各有一列
2. 按「記錄施打（預設 …）」→ 出現 DatePicker，關掉 sheet 後時程表該標籤變綠並顯示日期
3. 調整日期 → 時程表跟著更新
4. 按「清除」→ 回到原樣
5. 把寶寶生日改成一年多前 → 逾期區塊出現，公費在上、自費在下
6. 截圖存證

- [ ] **Step 10: Commit**

```bash
git add BabyMonster/Views/VaccineView.swift BabyMonster/Views/SettingsView.swift
git commit -m "Log dose dates and flag overdue doses in the iOS vaccine tab"
```

---

## Task 11: 跨平台驗證、文件與上傳

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 跨平台匯出匯入實測**

1. iOS 模擬器：記錄兩三劑 → 設定頁匯出 JSON → 從模擬器取出檔案
2. 檢查 JSON 內確實有 `vaccineDoses`，`version` 仍為 `2`，日期無毫秒
3. 網頁版匯入該檔 → 疫苗分頁應顯示同樣的綠色劑次與日期
4. 反向再做一次：網頁版匯出 → iOS 匯入
5. 沒有任何接種紀錄時匯出，確認 JSON **不含** `vaccineDoses` 鍵

- [ ] **Step 2: SwiftData 遷移驗證**

用改動前的 build 安裝到模擬器、建立寶寶與記錄，再覆蓋安裝新版：確認舊資料完整、App 不 crash、疫苗分頁可正常記錄。

- [ ] **Step 3: 全套測試**

```bash
cd web && npm test && npm run build
```

```bash
xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -20
```

Expected: 兩邊都全過。把實際數字記下來寫進 PROGRESS.md。

- [ ] **Step 4: 更新 `PROGRESS.md`**

在「目前狀態」上方新增一段（日期 2026-08-10），寫明：疫苗施打紀錄功能完成、資料表與備份格式的相容策略（version 維持 2）、日期邊界改動、web 與 iOS 的測試數字、以及新的已知落差（沒有「這劑不打」狀態）。

- [ ] **Step 5: Commit 並推上 GitHub**

```bash
git add PROGRESS.md
git commit -m "Record the vaccine dose log work in PROGRESS.md"
git push -u origin feature/vaccine-dose-log
```

- [ ] **Step 6: 開 PR**

```bash
gh pr create --title "Log vaccine dose dates on the schedule" --body "$(cat <<'EOF'
## 摘要
疫苗頁的時程表現在能記錄每一劑的實際施打日期：已施打的劑次背景變綠、附上日期，接種日已過卻沒有紀錄的劑次會列在「接下來要打的疫苗」上方。web 與 iOS 同步實作。

## 主要改動
- 新增獨立的接種紀錄表（Dexie `vaccineDoses` / SwiftData `VaccineDoseEntity`），主鍵為 `babyId|vaccineId|劑次`
- 匯出檔 `version` 維持 2，只多一個選填的 `vaccineDoses`；空陣列時不寫進檔案，舊版 App 讀新檔會忽略而不是整檔拒絕
- 逾期清單分公費／自費兩組，避免刻意不打的自費疫苗變成永久雜訊
- 日期邊界統一以「今天 00:00」切：接種日就是今天算即將接種（還有 0 天），早於今天才算逾期

## 驗證
- web 測試與 build 通過
- iOS `xcodebuild test` 通過，含 SwiftData 輕量遷移的覆蓋安裝驗證
- iOS ↔ 網頁版匯出匯入雙向實測

Spec：`docs/superpowers/specs/2026-08-10-vaccine-dose-log-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec 覆蓋對照**

| Spec 章節 | 對應 Task |
|---|---|
| §3.1 值型別、key 組法 | Task 1（web）、Task 7（iOS） |
| §3.2 儲存層、刪寶寶連帶刪除 | Task 3（web）、Task 8 + Task 10 Step 7（iOS） |
| §4 匯出格式、相容性 | Task 4（web）、Task 9（iOS） |
| §4.2 合併規則 | Task 4、Task 9 |
| §5 邏輯層純函式 | Task 1、Task 7 |
| §5.1 日期邊界修正 | Task 2（web）、Task 7 Step 5（iOS） |
| §6.1 時程表兩種狀態 | Task 5（web）、Task 10 Step 3（iOS） |
| §6.2 對話框日期輸入 | Task 5（web）、Task 10 Step 6（iOS） |
| §6.3 逾期未打分組 | Task 6（web）、Task 10 Step 4（iOS） |
| §7 錯誤處理 | Task 4 Step 4（型別錯誤整檔拒絕）、Task 5/10（沒有寶寶時停用）；未知 vaccineId 的資料保留是「時程表比對不到就不顯示」的自然結果，不需額外程式碼 |
| §8 測試 | Task 1、2、3、4、7、8、9、11 |
| §9 非目標 | 無任務（刻意不做） |
