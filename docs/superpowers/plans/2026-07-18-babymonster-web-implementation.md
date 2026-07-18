# BabyMonster 網頁版（純前端 PWA）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出與 iOS 版功能一致（含多寶寶 v2）的純前端 PWA，部署到 GitHub Pages，太太加入主畫面即可長期使用。

**Architecture:** 純前端、無後端。純函式邏輯層（`src/logic/`，TDD）鏡射 iOS Logic 層；Dexie/IndexedDB 資料層（`src/db/`）；React UI 層（`src/ui/`，4 分頁、輕薄不測）。匯出 v2 JSON（相容未來 iOS v2）、匯入 v1/v2。

**Tech Stack:** React 18 + TypeScript + Vite、Dexie 4（+ dexie-react-hooks）、Recharts、vite-plugin-pwa、Vitest（+ fake-indexeddb）。

**Spec:** `docs/superpowers/specs/2026-07-18-babymonster-web-design.md`（含 iOS 相容性硬規則，實作前必讀 §5–§7）

## Global Constraints

- **執行環境**：以 `superpowers:using-git-worktrees` 建立隔離 worktree，分支 `feature/web` 基於 `main`（iOS 多寶寶已於 PR #3 合併，main 上的 `DataTransfer.swift` v2 實作即為相容性對照基準）。不動任何 Swift 檔。
- 所有網頁程式碼放 `web/`；deploy workflow 放 `.github/workflows/`。
- Vite `base: '/BabyMonster/'`（GitHub Pages 路徑）。
- **日期匯出格式**：ISO 8601 UTC 秒級**無毫秒**（`YYYY-MM-DDTHH:mm:ssZ`）；解析時寬鬆（接受毫秒）。
- 內部時間一律 **epoch ms（number）**；「一天」= 裝置當地時區 00:00–23:59。
- UUID 用 `crypto.randomUUID()`；enum 編碼：stoolAmount = `"few"|"medium"|"many"`、stoolShape = 整數 1–7；選填欄位值不存在時**整個省略**（不輸出 null）。
- 寶寶預設名 `BabyMonster`；體重單位公克；UI 全中文（文案沿用 iOS 版）。
- 目標瀏覽器 iOS Safari 16+ / 現代 Chrome；不支援舊瀏覽器。
- Commit 訊息風格沿用現有 repo（英文祈使句，無 conventional-commit 前綴），結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 每完成一個 task 更新 `PROGRESS.md` 的「網頁版」區塊（勾選 + commit hash）。
- **推送 GitHub 需使用者逐次明確同意**（僅本機 commit 不受限）。

---

### Task 1: 專案骨架（web/ Vite + React + TS + Vitest）

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/.gitignore`, `web/src/main.tsx`, `web/src/ui/App.tsx`, `web/tests/smoke.test.ts`

**Interfaces:**
- Produces: 可 `npm run dev` / `npm run build` / `npm test` 的空殼 App（顯示「BabyMonster」）。後續 task 全部在此骨架上疊加。
- `npm test` = `vitest run`（CI 友善、不進 watch 模式）。

- [ ] **Step 1: 確認環境**

Run: `node --version && npm --version`
Expected: node ≥ 18（若無 node，停下回報使用者，不要自行安裝）

- [ ] **Step 2: 建立骨架檔案**

`web/package.json`：

```json
{
  "name": "babymonster-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dexie": "^4.0.8",
    "dexie-react-hooks": "^1.1.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "fake-indexeddb": "^6.0.0",
    "sharp": "^0.33.4",
    "typescript": "~5.5.4",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.1",
    "vitest": "^2.0.5"
  }
}
```

`web/vite.config.ts`：

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/BabyMonster/',
  plugins: [react()],
  test: { environment: 'node' },
});
```

`web/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`web/index.html`：

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#f4a940" />
    <title>BabyMonster</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/.gitignore`：

```
node_modules/
dist/
dev-dist/
```

`web/src/main.tsx`：

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';

if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`web/src/ui/App.tsx`（暫時空殼，Task 9 全面改寫）：

```tsx
export default function App() {
  return <h1>BabyMonster</h1>;
}
```

`web/tests/smoke.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: 安裝依賴並跑測試**

Run: `cd web && npm install && npm test`
Expected: `Test Files  1 passed`（smoke test 通過）

- [ ] **Step 4: 驗證建置**

Run: `cd web && npm run build`
Expected: `✓ built in ...`，產出 `web/dist/`

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "Add web project scaffold (Vite + React + TS + Vitest)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 型別 + 大便色卡（TDD）

**Files:**
- Create: `web/src/logic/types.ts`, `web/src/logic/stoolColorCard.ts`
- Test: `web/tests/stoolColorCard.test.ts`

**Interfaces:**
- Produces（後續所有 task 依賴）:
  - `types.ts`: `StoolAmount = 'few'|'medium'|'many'`、`BristolType = 1|2|3|4|5|6|7`、`STOOL_AMOUNT_NAMES: Record<StoolAmount, string>`、`BRISTOL_NAMES: Record<BristolType, string>`、`interface ProfileData { id: string; name: string; birthDate: number }`、`interface RecordData { id: string; babyId: string; timestamp: number; feedAmount?: number; stoolColor?: number; stoolAmount?: StoolAmount; stoolShape?: BristolType; hasUrine: boolean; temperature?: number; weight?: number; note?: string }`
  - `stoolColorCard.ts`: `STOOL_NUMBERS: readonly number[]`、`isAbnormalStoolColor(n: number): boolean`、`stoolColorHex(n: number): string`、`stoolTextHex(n: number): string`、`stoolLabel(n: number): string`

- [ ] **Step 1: 寫失敗測試**

`web/tests/stoolColorCard.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  STOOL_NUMBERS,
  isAbnormalStoolColor,
  stoolColorHex,
  stoolLabel,
  stoolTextHex,
} from '../src/logic/stoolColorCard';

describe('stoolColorCard', () => {
  it('1–6 號為異常、7–9 號正常（邊界 6/7）', () => {
    expect(isAbnormalStoolColor(1)).toBe(true);
    expect(isAbnormalStoolColor(6)).toBe(true);
    expect(isAbnormalStoolColor(7)).toBe(false);
    expect(isAbnormalStoolColor(9)).toBe(false);
  });

  it('九個號碼都有色碼', () => {
    expect(STOOL_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of STOOL_NUMBERS) {
      expect(stoolColorHex(n)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('標籤含異常/正常字樣', () => {
    expect(stoolLabel(3)).toBe('3 號（異常）');
    expect(stoolLabel(8)).toBe('8 號（正常）');
  });

  it('深色卡（8、9）用白字，其餘黑字', () => {
    expect(stoolTextHex(8)).toBe('#ffffff');
    expect(stoolTextHex(9)).toBe('#ffffff');
    expect(stoolTextHex(7)).toBe('#000000');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（`Cannot find module '../src/logic/stoolColorCard'`）

- [ ] **Step 3: 實作**

`web/src/logic/types.ts`：

```ts
export type StoolAmount = 'few' | 'medium' | 'many';

export const STOOL_AMOUNT_NAMES: Record<StoolAmount, string> = {
  few: '少',
  medium: '中',
  many: '多',
};

export type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const BRISTOL_NAMES: Record<BristolType, string> = {
  1: '第1型：一顆顆硬塊（難排出）',
  2: '第2型：香腸狀但結塊',
  3: '第3型：香腸狀，表面有裂痕',
  4: '第4型：香腸/蛇狀，光滑柔軟（理想）',
  5: '第5型：柔軟塊狀，邊緣清楚',
  6: '第6型：蓬鬆糊狀，邊緣不規則',
  7: '第7型：水狀，無固體塊（腹瀉）',
};

export interface ProfileData {
  id: string; // UUID
  name: string;
  birthDate: number; // epoch ms
}

export interface RecordData {
  id: string; // UUID
  babyId: string; // UUID
  timestamp: number; // epoch ms
  feedAmount?: number; // ml
  stoolColor?: number; // 1–9
  stoolAmount?: StoolAmount;
  stoolShape?: BristolType;
  hasUrine: boolean;
  temperature?: number; // °C
  weight?: number; // g
  note?: string;
}
```

`web/src/logic/stoolColorCard.ts`（色碼由 iOS `StoolColorCard.swift` 的 RGB 換算）：

```ts
export const STOOL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。 */
export function isAbnormalStoolColor(n: number): boolean {
  return n >= 1 && n <= 6;
}

/** 近似色（實體大便卡為最終判讀依據）。 */
const HEX: Record<number, string> = {
  1: '#e6e0cc', // 灰白/陶土
  2: '#ebe6c7', // 淺灰黃
  3: '#f2edbf', // 淺黃白
  4: '#f5e699', // 淡黃
  5: '#d9db8c', // 淺黃綠
  6: '#b3cc8c', // 淡綠
  7: '#e6b340', // 黃
  8: '#738c40', // 綠
  9: '#734d26', // 棕褐
};

export function stoolColorHex(n: number): string {
  return HEX[n] ?? '#999999';
}

/** 依卡片底色明暗選擇對比較佳的數字顏色。 */
export function stoolTextHex(n: number): string {
  return n === 8 || n === 9 ? '#ffffff' : '#000000';
}

export function stoolLabel(n: number): string {
  return `${n} 號（${isAbnormalStoolColor(n) ? '異常' : '正常'}）`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS（stoolColorCard 4 tests + smoke）

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/types.ts web/src/logic/stoolColorCard.ts web/tests/stoolColorCard.test.ts
git commit -m "Add domain types and stool color card logic (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 每日統計 dailyStats（TDD）

**Files:**
- Create: `web/src/logic/dailyStats.ts`
- Test: `web/tests/dailyStats.test.ts`

**Interfaces:**
- Consumes: `RecordData`（Task 2）
- Produces: `interface DailySummary { stoolCount: number; urineCount: number; totalFeed: number; averageTemperature: number | null; averageWeight: number | null }`、`dailySummary(dayMs: number, records: RecordData[]): DailySummary`、`sameLocalDay(a: number, b: number): boolean`

- [ ] **Step 1: 寫失敗測試**（案例鏡射 iOS `DailyStatsTests.swift`）

`web/tests/dailyStats.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { dailySummary, sameLocalDay } from '../src/logic/dailyStats';
import type { RecordData } from '../src/logic/types';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('dailySummary', () => {
  it('空資料日', () => {
    const s = dailySummary(d(2026, 7, 15), []);
    expect(s).toEqual({
      stoolCount: 0,
      urineCount: 0,
      totalFeed: 0,
      averageTemperature: null,
      averageWeight: null,
    });
  });

  it('次數與加總、平均', () => {
    const records = [
      rec(d(2026, 7, 15, 8), { feedAmount: 100, stoolColor: 7, hasUrine: true, temperature: 36.5, weight: 4000 }),
      rec(d(2026, 7, 15, 12), { feedAmount: 120, hasUrine: true }),
      rec(d(2026, 7, 15, 18), { stoolColor: 3, temperature: 37.5, weight: 4100 }),
    ];
    const s = dailySummary(d(2026, 7, 15), records);
    expect(s.stoolCount).toBe(2);
    expect(s.urineCount).toBe(2);
    expect(s.totalFeed).toBe(220);
    expect(s.averageTemperature).toBeCloseTo(37.0, 3);
    expect(s.averageWeight).toBeCloseTo(4050, 3);
  });

  it('只算選定當天（跨午夜邊界）', () => {
    const records = [
      rec(d(2026, 7, 15, 8), { feedAmount: 100 }),
      rec(d(2026, 7, 14, 23), { feedAmount: 999 }),
      rec(d(2026, 7, 16, 0), { feedAmount: 999 }),
    ];
    expect(dailySummary(d(2026, 7, 15), records).totalFeed).toBe(100);
  });
});

describe('sameLocalDay', () => {
  it('同一天不同時刻為真、跨日為假', () => {
    expect(sameLocalDay(d(2026, 7, 15, 0), d(2026, 7, 15, 23))).toBe(true);
    expect(sameLocalDay(d(2026, 7, 15, 23), d(2026, 7, 16, 0))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（`Cannot find module '../src/logic/dailyStats'`）

- [ ] **Step 3: 實作**

`web/src/logic/dailyStats.ts`：

```ts
import type { RecordData } from './types';

export interface DailySummary {
  stoolCount: number;
  urineCount: number;
  totalFeed: number;
  averageTemperature: number | null;
  averageWeight: number | null;
}

export function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function dailySummary(dayMs: number, records: RecordData[]): DailySummary {
  const dayRecords = records.filter((r) => sameLocalDay(r.timestamp, dayMs));

  const stoolCount = dayRecords.filter((r) => r.stoolColor != null).length;
  const urineCount = dayRecords.filter((r) => r.hasUrine).length;
  const feeds = dayRecords.map((r) => r.feedAmount).filter((v): v is number => v != null);
  const temps = dayRecords.map((r) => r.temperature).filter((v): v is number => v != null);
  const weights = dayRecords.map((r) => r.weight).filter((v): v is number => v != null);

  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

  return {
    stoolCount,
    urineCount,
    totalFeed: feeds.reduce((a, b) => a + b, 0),
    averageTemperature: avg(temps),
    averageWeight: avg(weights),
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/dailyStats.ts web/tests/dailyStats.test.ts
git commit -m "Add daily stats calculation (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 年齡計算 babyAge（TDD）

**Files:**
- Create: `web/src/logic/babyAge.ts`
- Test: `web/tests/babyAge.test.ts`

**Interfaces:**
- Produces: `interface BabyAge { years: number; months: number; days: number }`、`babyAge(birthMs: number, asOfMs: number): BabyAge`、`ageDisplayText(a: BabyAge): string`（格式 `X 歲 X 個月又 X 天`）
- 語意對齊 Swift `Calendar.dateComponents([.year,.month,.day])`：先整月數（不足日則借位），錨點日以「月底 clamp」處理（1/31 + 1 個月 = 2/28）。

- [ ] **Step 1: 寫失敗測試**（案例鏡射 iOS `BabyAgeTests.swift`）

`web/tests/babyAge.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { ageDisplayText, babyAge } from '../src/logic/babyAge';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

describe('babyAge', () => {
  it('生日當天', () => {
    expect(babyAge(d(2026, 1, 15), d(2026, 1, 15))).toEqual({ years: 0, months: 0, days: 0 });
  });
  it('只有天數', () => {
    expect(babyAge(d(2026, 1, 1), d(2026, 1, 11))).toEqual({ years: 0, months: 0, days: 10 });
  });
  it('月又天', () => {
    expect(babyAge(d(2026, 1, 10), d(2026, 3, 15))).toEqual({ years: 0, months: 2, days: 5 });
  });
  it('跨月借位（1/31 → 3/1）', () => {
    const a = babyAge(d(2026, 1, 31), d(2026, 3, 1));
    expect(a.years).toBe(0);
    expect(a.months).toBe(1);
  });
  it('滿兩歲', () => {
    expect(babyAge(d(2024, 5, 20), d(2026, 7, 15))).toEqual({ years: 2, months: 1, days: 25 });
  });
  it('顯示文字', () => {
    expect(ageDisplayText({ years: 1, months: 2, days: 3 })).toBe('1 歲 2 個月又 3 天');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

`web/src/logic/babyAge.ts`：

```ts
export interface BabyAge {
  years: number;
  months: number;
  days: number;
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** 語意對齊 Swift Calendar.dateComponents([.year,.month,.day]，from:to:)。 */
export function babyAge(birthMs: number, asOfMs: number): BabyAge {
  const b = new Date(birthMs);
  const a = new Date(asOfMs);

  let totalMonths = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (a.getDate() < b.getDate()) totalMonths -= 1;
  if (totalMonths < 0) return { years: 0, months: 0, days: 0 };

  const anchorY = b.getFullYear() + Math.floor((b.getMonth() + totalMonths) / 12);
  const anchorM = (b.getMonth() + totalMonths) % 12;
  const anchorD = Math.min(b.getDate(), daysInMonth(anchorY, anchorM)); // 月底 clamp
  const anchor = new Date(anchorY, anchorM, anchorD).getTime();
  const asOfStart = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  // round 而非 floor：吸收 DST 造成的 ±1 小時
  const days = Math.max(0, Math.round((asOfStart - anchor) / 86_400_000));

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days };
}

export function ageDisplayText(a: BabyAge): string {
  return `${a.years} 歲 ${a.months} 個月又 ${a.days} 天`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/babyAge.ts web/tests/babyAge.test.ts
git commit -m "Add baby age calculation (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 趨勢序列 trendSeries（TDD）

**Files:**
- Create: `web/src/logic/trendSeries.ts`
- Test: `web/tests/trendSeries.test.ts`

**Interfaces:**
- Consumes: `dailySummary`（Task 3）、`RecordData`（Task 2）
- Produces: `type TrendMetric = 'stoolCount'|'urineCount'|'totalFeed'|'avgTemperature'|'avgWeight'`、`TREND_METRIC_NAMES: Record<TrendMetric, string>`（大便次數/小便次數/總喝奶量/平均體溫/平均體重）、`TREND_METRIC_UNITS: Record<TrendMetric, string>`（次/次/ml/°C/g）、`interface TrendPoint { dayMs: number; value: number | null }`、`trendSeries(metric: TrendMetric, days: number, endingOnMs: number, records: RecordData[]): TrendPoint[]`
- 行為鏡射 iOS `TrendSeries.swift`：每天一點；次數與喝奶量無資料日 = 0；平均體溫/體重無資料日 = null；`days <= 0` 回空陣列。

- [ ] **Step 1: 寫失敗測試**

`web/tests/trendSeries.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { trendSeries } from '../src/logic/trendSeries';
import type { RecordData } from '../src/logic/types';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h).getTime();

function rec(ts: number, extra: Partial<RecordData> = {}): RecordData {
  return { id: crypto.randomUUID(), babyId: 'b1', timestamp: ts, hasUrine: false, ...extra };
}

describe('trendSeries', () => {
  it('產生 days 個點、日期由舊到新、無資料日次數為 0', () => {
    const s = trendSeries('stoolCount', 3, d(2026, 7, 15), []);
    expect(s).toHaveLength(3);
    expect(new Date(s[0].dayMs).getDate()).toBe(13);
    expect(new Date(s[2].dayMs).getDate()).toBe(15);
    expect(s.map((p) => p.value)).toEqual([0, 0, 0]);
  });

  it('平均體溫在無資料日為 null（斷點）', () => {
    const records = [rec(d(2026, 7, 14), { temperature: 37 })];
    const s = trendSeries('avgTemperature', 3, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([null, 37, null]);
  });

  it('總喝奶量逐日加總', () => {
    const records = [
      rec(d(2026, 7, 14, 8), { feedAmount: 100 }),
      rec(d(2026, 7, 14, 20), { feedAmount: 50 }),
      rec(d(2026, 7, 15, 8), { feedAmount: 120 }),
    ];
    const s = trendSeries('totalFeed', 2, d(2026, 7, 15), records);
    expect(s.map((p) => p.value)).toEqual([150, 120]);
  });

  it('days <= 0 回空陣列', () => {
    expect(trendSeries('stoolCount', 0, d(2026, 7, 15), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

`web/src/logic/trendSeries.ts`：

```ts
import { dailySummary } from './dailyStats';
import type { RecordData } from './types';

export type TrendMetric = 'stoolCount' | 'urineCount' | 'totalFeed' | 'avgTemperature' | 'avgWeight';

export const TREND_METRIC_NAMES: Record<TrendMetric, string> = {
  stoolCount: '大便次數',
  urineCount: '小便次數',
  totalFeed: '總喝奶量',
  avgTemperature: '平均體溫',
  avgWeight: '平均體重',
};

export const TREND_METRIC_UNITS: Record<TrendMetric, string> = {
  stoolCount: '次',
  urineCount: '次',
  totalFeed: 'ml',
  avgTemperature: '°C',
  avgWeight: 'g',
};

export interface TrendPoint {
  dayMs: number;
  value: number | null;
}

export function trendSeries(
  metric: TrendMetric,
  days: number,
  endingOnMs: number,
  records: RecordData[],
): TrendPoint[] {
  if (days <= 0) return [];
  const end = new Date(endingOnMs);
  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const dayMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset).getTime();
    const s = dailySummary(dayMs, records);
    const value =
      metric === 'stoolCount' ? s.stoolCount
      : metric === 'urineCount' ? s.urineCount
      : metric === 'totalFeed' ? s.totalFeed
      : metric === 'avgTemperature' ? s.averageTemperature
      : s.averageWeight;
    return { dayMs, value };
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/trendSeries.ts web/tests/trendSeries.test.ts
git commit -m "Add trend series calculation (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 匯出/匯入編解碼 dataTransfer — codec（TDD）

**Files:**
- Create: `web/src/logic/dataTransfer.ts`
- Test: `web/tests/dataTransferCodec.test.ts`

**Interfaces:**
- Consumes: `ProfileData`, `RecordData`, `StoolAmount`, `BristolType`（Task 2）
- Produces:
  - `interface BackupPayloadV2 { profiles: ProfileData[]; records: RecordData[] }`
  - `isoFromMs(ms: number): string` — `YYYY-MM-DDTHH:mm:ssZ`（UTC、無毫秒）
  - `msFromIso(iso: string): number` — 接受無毫秒/含毫秒/時區偏移；無效丟 `Error`
  - `encodeV2(p: BackupPayloadV2): string` — JSON 文字，`version: 2`、鍵排序、undefined 欄位省略、日期轉 ISO
  - `decodeAny(text: string): BackupPayloadV2` — v2 或 v1 自動判別＋逐筆驗證；不合法丟 `Error`（整檔拒絕）。v1 檔：profile 產生新 UUID，所有 records 綁該 babyId。
- ⚠️ 相容性硬規則見 spec §7.1：這是與 iOS 互通的邊界，格式錯了會讓 Swift `JSONDecoder(.iso8601)` 整檔解不開。

- [ ] **Step 1: 寫失敗測試**

`web/tests/dataTransferCodec.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { decodeAny, encodeV2, isoFromMs, msFromIso } from '../src/logic/dataTransfer';
import type { BackupPayloadV2 } from '../src/logic/dataTransfer';

const P1 = '11111111-1111-1111-1111-111111111111';
const R1 = '22222222-2222-2222-2222-222222222222';

function payload(): BackupPayloadV2 {
  return {
    profiles: [{ id: P1, name: '小明', birthDate: Date.UTC(2025, 10, 2) }],
    records: [
      {
        id: R1,
        babyId: P1,
        timestamp: Date.UTC(2026, 6, 18, 4, 56),
        feedAmount: 120,
        stoolColor: 7,
        stoolAmount: 'medium',
        stoolShape: 4,
        hasUrine: true,
        temperature: 36.5,
        weight: 4000,
        note: '備註',
      },
    ],
  };
}

describe('ISO 8601 日期（相容性關鍵）', () => {
  it('輸出 UTC 秒級、無毫秒', () => {
    expect(isoFromMs(Date.UTC(2026, 6, 18, 4, 56, 0, 789))).toBe('2026-07-18T04:56:00Z');
    expect(isoFromMs(Date.UTC(2026, 6, 18, 4, 56))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
  it('解析寬鬆：無毫秒、含毫秒、時區偏移都接受', () => {
    expect(msFromIso('2026-07-18T04:56:00Z')).toBe(Date.UTC(2026, 6, 18, 4, 56));
    expect(msFromIso('2026-07-18T04:56:00.789Z')).toBe(Date.UTC(2026, 6, 18, 4, 56, 0, 789));
    expect(msFromIso('2026-07-18T12:56:00+08:00')).toBe(Date.UTC(2026, 6, 18, 4, 56));
  });
  it('無效日期丟錯', () => {
    expect(() => msFromIso('2026-07-18')).toThrow();
    expect(() => msFromIso('not a date')).toThrow();
  });
});

describe('encodeV2', () => {
  it('round-trip 等值', () => {
    const p = payload();
    expect(decodeAny(encodeV2(p))).toEqual(p);
  });
  it('JSON 內日期全部無毫秒、含 version 2', () => {
    const obj = JSON.parse(encodeV2(payload()));
    expect(obj.version).toBe(2);
    expect(obj.profiles[0].birthDate).toBe('2025-11-02T00:00:00Z');
    expect(obj.records[0].timestamp).toBe('2026-07-18T04:56:00Z');
  });
  it('選填欄位不存在時整個省略（不輸出 null）', () => {
    const p: BackupPayloadV2 = {
      profiles: [{ id: P1, name: 'x', birthDate: 0 }],
      records: [{ id: R1, babyId: P1, timestamp: 0, hasUrine: false }],
    };
    const rec = JSON.parse(encodeV2(p)).records[0];
    expect(Object.keys(rec).sort()).toEqual(['babyId', 'hasUrine', 'id', 'timestamp']);
  });
});

describe('decodeAny', () => {
  it('v1 檔（現行 iOS 匯出）轉 v2：records 全綁該寶寶', () => {
    const v1 = `{"profile":{"name":"Old","birthDate":"2024-05-20T00:00:00Z"},
      "records":[{"id":"${R1}","timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}`;
    const v2 = decodeAny(v1);
    expect(v2.profiles).toHaveLength(1);
    expect(v2.profiles[0].name).toBe('Old');
    expect(v2.records).toHaveLength(1);
    expect(v2.records[0].babyId).toBe(v2.profiles[0].id);
    expect(v2.records[0].hasUrine).toBe(true);
  });
  it('欄位不合法 → 整檔拒絕', () => {
    const bad = JSON.parse(encodeV2(payload()));
    bad.records[0].stoolColor = 12; // 超出 1–9
    expect(() => decodeAny(JSON.stringify(bad))).toThrow();
  });
  it('缺 hasUrine → 整檔拒絕', () => {
    const bad = JSON.parse(encodeV2(payload()));
    delete bad.records[0].hasUrine;
    expect(() => decodeAny(JSON.stringify(bad))).toThrow();
  });
  it('無法辨識的格式丟錯', () => {
    expect(() => decodeAny('{"foo":1}')).toThrow();
    expect(() => decodeAny('not json')).toThrow();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

`web/src/logic/dataTransfer.ts`：

```ts
import type { BristolType, ProfileData, RecordData, StoolAmount } from './types';

export interface BackupPayloadV2 {
  profiles: ProfileData[];
  records: RecordData[];
}

// ---- ISO 8601（相容性關鍵：Swift JSONDecoder(.iso8601) 不接受毫秒） ----

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function msFromIso(iso: string): number {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) throw new Error(`無效的日期格式：${iso}`);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`無效的日期：${iso}`);
  return ms;
}

// ---- encode ----

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeysDeep(o[k])]));
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function encodeV2(p: BackupPayloadV2): string {
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
        temperature: r.temperature,
        weight: r.weight,
        note: r.note,
      }),
    ),
  };
  return JSON.stringify(sortKeysDeep(wire), null, 2);
}

// ---- decode + 驗證（整檔拒絕） ----

type Raw = Record<string, unknown>;

const STOOL_AMOUNTS: readonly string[] = ['few', 'medium', 'many'];

function fail(where: string, msg: string): never {
  throw new Error(`${where}：${msg}`);
}

function parseProfile(raw: unknown, where: string): ProfileData {
  if (raw === null || typeof raw !== 'object') fail(where, '寶寶資料不是物件');
  const o = raw as Raw;
  if (typeof o.id !== 'string' || o.id === '') fail(where, '缺少 id');
  if (typeof o.name !== 'string') fail(where, '缺少名字');
  return { id: o.id, name: o.name, birthDate: msFromIso(o.birthDate as string) };
}

function optNumber(o: Raw, key: string, where: string): number | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `${key} 不是數字`);
  return v;
}

function parseRecord(raw: unknown, where: string, forcedBabyId?: string): RecordData {
  if (raw === null || typeof raw !== 'object') fail(where, '記錄不是物件');
  const o = raw as Raw;
  if (typeof o.id !== 'string' || o.id === '') fail(where, '缺少 id');
  const babyId = forcedBabyId ?? o.babyId;
  if (typeof babyId !== 'string' || babyId === '') fail(where, '缺少 babyId');
  if (typeof o.hasUrine !== 'boolean') fail(where, '缺少 hasUrine');

  const stoolColor = optNumber(o, 'stoolColor', where);
  if (stoolColor !== undefined && (!Number.isInteger(stoolColor) || stoolColor < 1 || stoolColor > 9))
    fail(where, 'stoolColor 需為 1–9');
  const stoolShape = optNumber(o, 'stoolShape', where);
  if (stoolShape !== undefined && (!Number.isInteger(stoolShape) || stoolShape < 1 || stoolShape > 7))
    fail(where, 'stoolShape 需為 1–7');
  const stoolAmount = o.stoolAmount === undefined || o.stoolAmount === null ? undefined : o.stoolAmount;
  if (stoolAmount !== undefined && (typeof stoolAmount !== 'string' || !STOOL_AMOUNTS.includes(stoolAmount)))
    fail(where, 'stoolAmount 不合法');
  const note = o.note === undefined || o.note === null ? undefined : o.note;
  if (note !== undefined && typeof note !== 'string') fail(where, 'note 不是字串');

  return stripUndefined({
    id: o.id,
    babyId,
    timestamp: msFromIso(o.timestamp as string),
    feedAmount: optNumber(o, 'feedAmount', where),
    stoolColor,
    stoolAmount: stoolAmount as StoolAmount | undefined,
    stoolShape: stoolShape as BristolType | undefined,
    hasUrine: o.hasUrine,
    temperature: optNumber(o, 'temperature', where),
    weight: optNumber(o, 'weight', where),
    note,
  }) as RecordData;
}

export function decodeAny(text: string): BackupPayloadV2 {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error('檔案不是有效的 JSON');
  }
  if (root === null || typeof root !== 'object') throw new Error('無法辨識的備份檔格式');
  const o = root as Raw;

  if (o.version === 2 && Array.isArray(o.profiles) && Array.isArray(o.records)) {
    const profiles = o.profiles.map((p, i) => parseProfile(p, `第 ${i + 1} 個寶寶`));
    const records = o.records.map((r, i) => parseRecord(r, `第 ${i + 1} 筆記錄`));
    return { profiles, records };
  }

  if (o.profile !== undefined && Array.isArray(o.records)) {
    // v1（現行 iOS 匯出檔）：單一 profile 無 id → 產生新 id，records 全綁定
    const p = o.profile as Raw;
    if (p === null || typeof p !== 'object' || typeof p.name !== 'string')
      throw new Error('v1 寶寶資料不合法');
    const profile: ProfileData = {
      id: crypto.randomUUID(),
      name: p.name,
      birthDate: msFromIso(p.birthDate as string),
    };
    const records = o.records.map((r, i) => parseRecord(r, `第 ${i + 1} 筆記錄`, profile.id));
    return { profiles: [profile], records };
  }

  throw new Error('無法辨識的備份檔格式');
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS（codec 全數通過，先前測試不退步）

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/dataTransfer.ts web/tests/dataTransferCodec.test.ts
git commit -m "Add v1/v2 backup codec with iOS-compatible ISO dates (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 匯入合併 mergeBabies（TDD）

**Files:**
- Modify: `web/src/logic/dataTransfer.ts`（檔尾加 mergeBabies）
- Test: `web/tests/dataTransferMerge.test.ts`

**Interfaces:**
- Consumes: `BackupPayloadV2`（Task 6）
- Produces: `mergeBabies(local: BackupPayloadV2, incoming: BackupPayloadV2): BackupPayloadV2`
- 規則（鏡射 iOS `DataTransferV2Tests.swift`）：寶寶 id 對中 → 保留本機；id 沒中名字全同 → 重對映其記錄 babyId；都沒中 → 新增。記錄以 id 聯集去重、本機優先、timestamp 排序；重對映在去重之前。

- [ ] **Step 1: 寫失敗測試**

`web/tests/dataTransferMerge.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { mergeBabies } from '../src/logic/dataTransfer';
import type { RecordData } from '../src/logic/types';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

function rec(id: string, babyId: string, ts: number, feed?: number): RecordData {
  return { id, babyId, timestamp: ts, hasUrine: false, ...(feed !== undefined ? { feedAmount: feed } : {}) };
}

describe('mergeBabies', () => {
  it('同 id 寶寶 → 保留本機名字', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '同id', birthDate: 0 }], records: [] },
      { profiles: [{ id: A, name: '改過名', birthDate: 0 }], records: [rec('r1', A, 1)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0].name).toBe('同id');
    expect(r.records).toHaveLength(1);
  });

  it('不同 id 同名 → 不新增寶寶、babyId 重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [] },
      { profiles: [{ id: B, name: '小明', birthDate: 50 }], records: [rec('r1', B, 1000, 60)] },
    );
    expect(r.profiles).toHaveLength(1);
    expect(r.records[0].babyId).toBe(A);
  });

  it('全新寶寶 → 新增且不重對映', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [] },
      { profiles: [{ id: B, name: '小美', birthDate: 99 }], records: [rec('r1', B, 1000)] },
    );
    expect(r.profiles).toHaveLength(2);
    expect(r.records[0].babyId).toBe(B);
  });

  it('記錄同 id 去重、本機優先', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('dup', A, 1000, 100)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('dup', A, 1000, 999)] },
    );
    expect(r.records).toHaveLength(1);
    expect(r.records[0].feedAmount).toBe(100);
  });

  it('結果依 timestamp 排序', () => {
    const r = mergeBabies(
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('r2', A, 2000)] },
      { profiles: [{ id: A, name: '小明', birthDate: 0 }], records: [rec('r1', A, 1000)] },
    );
    expect(r.records.map((x) => x.id)).toEqual(['r1', 'r2']);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（`mergeBabies` is not exported）

- [ ] **Step 3: 實作**（加到 `web/src/logic/dataTransfer.ts` 檔尾）

```ts
// ---- 匯入合併（規則見 spec §7.3–7.4） ----

export function mergeBabies(local: BackupPayloadV2, incoming: BackupPayloadV2): BackupPayloadV2 {
  const profiles = [...local.profiles];
  const remap = new Map<string, string>(); // incoming babyId -> local babyId

  for (const p of incoming.profiles) {
    if (profiles.some((x) => x.id === p.id)) continue; // id 對中：保留本機
    const byName = profiles.find((x) => x.name === p.name);
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
  return { profiles, records };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS（全部測試通過）

- [ ] **Step 5: Commit**

```bash
git add web/src/logic/dataTransfer.ts web/tests/dataTransferMerge.test.ts
git commit -m "Add import merge with baby matching and remapping (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 資料層 db + repository（TDD, fake-indexeddb）

**Files:**
- Create: `web/src/db/db.ts`, `web/src/db/repository.ts`
- Test: `web/tests/repository.test.ts`

**Interfaces:**
- Consumes: `mergeBabies`, `BackupPayloadV2`（Task 6/7）、`ProfileData`/`RecordData`（Task 2）
- Produces:
  - `db.ts`: `class BabyDB extends Dexie`，`db: BabyDB`（表：`profiles` 主鍵 `id`；`records` 主鍵 `id`、索引 `babyId`, `timestamp`；DB 名 `babymonster`）
  - `repository.ts`:
    - `allData(): Promise<BackupPayloadV2>`
    - `importMerge(incoming: BackupPayloadV2): Promise<void>` — 單一 rw transaction，失敗全回滾
    - `deleteBabyCascade(babyId: string): Promise<void>` — 刪寶寶＋其全部記錄（單一 transaction）
    - `createDefaultBaby(): Promise<ProfileData>` — 名字 `BabyMonster`、生日 = 今天 00:00
    - `resolveCurrentBaby(profiles: ProfileData[], storedId: string | null): ProfileData | null`（純函式）
    - `loadCurrentBabyId(): string | null` / `saveCurrentBabyId(id: string): void`（localStorage key `currentBabyId`）

- [ ] **Step 1: 寫失敗測試**

`web/tests/repository.test.ts`（**第一行必須先 import fake-indexeddb**，才能在 node 環境跑 Dexie）：

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import {
  allData,
  createDefaultBaby,
  deleteBabyCascade,
  importMerge,
  resolveCurrentBaby,
} from '../src/db/repository';
import type { ProfileData, RecordData } from '../src/logic/types';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

const baby = (id: string, name: string): ProfileData => ({ id, name, birthDate: 0 });
const rec = (id: string, babyId: string, ts: number): RecordData => ({
  id, babyId, timestamp: ts, hasUrine: false,
});

beforeEach(async () => {
  await db.profiles.clear();
  await db.records.clear();
});

describe('importMerge', () => {
  it('空庫匯入 → 全數寫入', async () => {
    await importMerge({ profiles: [baby(A, '小明')], records: [rec('r1', A, 1000)] });
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.records).toHaveLength(1);
  });

  it('重複 id 本機優先、同名寶寶重對映（走 mergeBabies）', async () => {
    await db.profiles.add(baby(A, '小明'));
    await db.records.add({ ...rec('dup', A, 1000), feedAmount: 100 });
    await importMerge({
      profiles: [baby(B, '小明')],
      records: [{ ...rec('dup', B, 1000), feedAmount: 999 }, rec('r2', B, 2000)],
    });
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.records).toHaveLength(2);
    expect(d.records.find((r) => r.id === 'dup')?.feedAmount).toBe(100);
    expect(d.records.find((r) => r.id === 'r2')?.babyId).toBe(A);
  });

  it('匯入失敗 → 回滾，現有資料不動', async () => {
    await db.profiles.add(baby(A, '小明'));
    // incoming 內部 record id 重複 → bulkAdd 觸發 ConstraintError → transaction 中止
    const dupRecords = [rec('same', A, 1), rec('same', A, 2)];
    await expect(importMerge({ profiles: [], records: dupRecords })).rejects.toThrow();
    const d = await allData();
    expect(d.profiles).toHaveLength(1);
    expect(d.records).toHaveLength(0);
  });
});

describe('deleteBabyCascade', () => {
  it('刪寶寶連動刪其全部記錄，不動別的寶寶', async () => {
    await db.profiles.bulkAdd([baby(A, '小明'), baby(B, '小美')]);
    await db.records.bulkAdd([rec('r1', A, 1), rec('r2', A, 2), rec('r3', B, 3)]);
    await deleteBabyCascade(A);
    const d = await allData();
    expect(d.profiles.map((p) => p.id)).toEqual([B]);
    expect(d.records.map((r) => r.id)).toEqual(['r3']);
  });
});

describe('createDefaultBaby', () => {
  it('建立預設寶寶 BabyMonster、生日為今天 00:00', async () => {
    const b = await createDefaultBaby();
    expect(b.name).toBe('BabyMonster');
    const t = new Date();
    expect(b.birthDate).toBe(new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime());
    expect(await db.profiles.get(b.id)).toBeTruthy();
  });
});

describe('resolveCurrentBaby（純函式）', () => {
  const list = [baby(A, '小明'), baby(B, '小美')];
  it('存的 id 找得到 → 該寶寶', () => {
    expect(resolveCurrentBaby(list, B)?.id).toBe(B);
  });
  it('找不到或 null → 退回第一個', () => {
    expect(resolveCurrentBaby(list, 'nope')?.id).toBe(A);
    expect(resolveCurrentBaby(list, null)?.id).toBe(A);
  });
  it('沒有寶寶 → null', () => {
    expect(resolveCurrentBaby([], A)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npm test`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

`web/src/db/db.ts`：

```ts
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
```

`web/src/db/repository.ts`：

```ts
import { db } from './db';
import { mergeBabies, type BackupPayloadV2 } from '../logic/dataTransfer';
import type { ProfileData } from '../logic/types';

export async function allData(): Promise<BackupPayloadV2> {
  return {
    profiles: await db.profiles.toArray(),
    records: await db.records.toArray(),
  };
}

/** 匯入合併：單一 transaction，任何失敗全回滾。 */
export async function importMerge(incoming: BackupPayloadV2): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, async () => {
    const local = {
      profiles: await db.profiles.toArray(),
      records: await db.records.toArray(),
    };
    const merged = mergeBabies(local, incoming);
    await db.profiles.clear();
    await db.records.clear();
    await db.profiles.bulkAdd(merged.profiles);
    await db.records.bulkAdd(merged.records);
  });
}

/** 刪寶寶＋其全部記錄（手動 cascade）。 */
export async function deleteBabyCascade(babyId: string): Promise<void> {
  await db.transaction('rw', db.profiles, db.records, async () => {
    await db.records.where('babyId').equals(babyId).delete();
    await db.profiles.delete(babyId);
  });
}

/** 無寶寶時自動建立的預設寶寶（名字 BabyMonster、生日 = 今天）。 */
export async function createDefaultBaby(): Promise<ProfileData> {
  const t = new Date();
  const p: ProfileData = {
    id: crypto.randomUUID(),
    name: 'BabyMonster',
    birthDate: new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(),
  };
  await db.profiles.add(p);
  return p;
}

/** 解析當前寶寶：存的 id 找不到 → 第一個寶寶；沒寶寶 → null。 */
export function resolveCurrentBaby(
  profiles: ProfileData[],
  storedId: string | null,
): ProfileData | null {
  return profiles.find((p) => p.id === storedId) ?? profiles[0] ?? null;
}

const CURRENT_BABY_KEY = 'currentBabyId';

export function loadCurrentBabyId(): string | null {
  return localStorage.getItem(CURRENT_BABY_KEY);
}

export function saveCurrentBabyId(id: string): void {
  localStorage.setItem(CURRENT_BABY_KEY, id);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npm test`
Expected: PASS（全部測試通過）

- [ ] **Step 5: Commit**

```bash
git add web/src/db/ web/tests/repository.test.ts
git commit -m "Add Dexie data layer with transactional import merge (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: App 殼層 + tab bar + PWA + 樣式

**Files:**
- Create: `web/src/ui/format.ts`, `web/src/ui/styles.css`, `web/src/ui/BabySwitcher.tsx`, `web/public/icon.svg`, `web/scripts/make-icons.mjs`
- Modify: `web/src/ui/App.tsx`（全面改寫）, `web/src/main.tsx`（引入 styles.css）, `web/vite.config.ts`（加 VitePWA）, `web/index.html`（加 apple-touch-icon）

**Interfaces:**
- Consumes: `db`（Task 8 useLiveQuery 用）、`resolveCurrentBaby`/`loadCurrentBabyId`/`saveCurrentBabyId`（Task 8）
- Produces（Task 10–13 依賴）:
  - 每個分頁元件收到 props `interface PageProps { profiles: ProfileData[]; currentBaby: ProfileData | null; onSelectBaby: (id: string) => void }`
  - `BabySwitcher({ profiles, currentBaby, onSelect }: { profiles: ProfileData[]; currentBaby: ProfileData | null; onSelect: (id: string) => void })` — 無寶寶時 render null
  - `format.ts`: `pad2(n)`, `ymdCompact(ms)`（`20260718`）, `dateInputValue(ms)`（`2026-07-18`）, `msFromDateInput(v)`, `datetimeLocalValue(ms)`（`2026-07-18T13:05`）, `msFromDatetimeLocal(v)`, `timeHM(ms)`（`13:05`）, `monthDay(ms)`（`7/18`）
  - `styles.css` 類別：`.tabbar`, `.tab`, `.tab.active`, `.page`, `.page-header`, `.card`, `.field`, `.field-label`, `.seg`, `.seg button`, `.seg button.selected`, `.stool-grid`, `.stool-cell`, `.stool-cell.selected`, `.warn`, `.hint`, `.timeline`, `.timeline-item`, `.chips`, `.chip`, `.stat-grid`, `.stat-card`, `.stat-value`, `.list-row`, `.btn`, `.btn-primary`, `.btn-danger`, `.toast`
- 本 task 完成後 4 個分頁先放佔位文字（`<p>施工中</p>`），Task 10–13 逐頁替換。

- [ ] **Step 1: 建立 format.ts**

`web/src/ui/format.ts`：

```ts
export const pad2 = (n: number) => String(n).padStart(2, '0');

export function ymdCompact(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export function dateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function msFromDateInput(v: string): number {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function datetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  return `${dateInputValue(ms)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function msFromDatetimeLocal(v: string): number {
  return new Date(v).getTime();
}

export function timeHM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
```

- [ ] **Step 2: 建立 styles.css**

`web/src/ui/styles.css`：

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif;
  background: #faf7f2;
  color: #333;
  -webkit-font-smoothing: antialiased;
}
#root { min-height: 100dvh; display: flex; flex-direction: column; }

.page {
  flex: 1;
  padding: 12px 16px calc(72px + env(safe-area-inset-bottom));
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
}
.page-header {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: calc(8px + env(safe-area-inset-top)) 0 8px;
}
.page-header h1 { font-size: 20px; margin: 0; }
.page-header .age { color: #888; font-size: 13px; }

.card {
  background: #fff; border-radius: 12px; padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); margin-bottom: 14px;
}
.card h2 { font-size: 15px; margin: 0 0 10px; color: #666; }

.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 13px; color: #888; margin-bottom: 4px; }
.field input[type="number"], .field input[type="text"], .field input[type="date"],
.field input[type="datetime-local"], .field select, .field textarea {
  width: 100%; padding: 10px; font-size: 16px;
  border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #333;
}
.field textarea { resize: vertical; min-height: 56px; }

.seg { display: flex; gap: 6px; flex-wrap: wrap; }
.seg button {
  padding: 8px 14px; font-size: 15px; border: 1px solid #ddd; border-radius: 999px;
  background: #fff; color: #333;
}
.seg button.selected { background: #f4a940; border-color: #f4a940; color: #fff; }

.stool-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.stool-cell {
  aspect-ratio: 1; border-radius: 10px; border: 2px solid transparent;
  font-size: 18px; font-weight: 700;
}
.stool-cell.selected { border-color: #e2574c; box-shadow: 0 0 0 2px rgba(226, 87, 76, 0.3); }

.warn {
  background: #fdecea; color: #b3261e; border-radius: 8px;
  padding: 10px; font-size: 14px; margin: 10px 0 0;
}
.hint { color: #888; font-size: 13px; margin: 8px 0 0; }

.timeline { list-style: none; margin: 0; padding: 0; }
.timeline-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 0; border-bottom: 1px solid #f0ece5;
}
.timeline-item:last-child { border-bottom: none; }
.timeline-item .time { color: #888; font-size: 13px; min-width: 44px; padding-top: 2px; }
.timeline-item .body { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  background: #f6f1e7; border-radius: 6px; padding: 3px 8px; font-size: 13px;
}
.chip.abnormal { background: #fdecea; color: #b3261e; }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-card { background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.stat-card .label { color: #888; font-size: 13px; }
.stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
.stat-value .unit { font-size: 13px; font-weight: 400; color: #888; margin-left: 2px; }

.list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 0; border-bottom: 1px solid #f0ece5;
}
.list-row:last-child { border-bottom: none; }

.btn {
  padding: 10px 16px; font-size: 15px; border: 1px solid #ddd;
  border-radius: 8px; background: #fff; color: #333;
}
.btn-primary { background: #f4a940; border-color: #f4a940; color: #fff; font-weight: 600; width: 100%; }
.btn-danger { color: #b3261e; border-color: #f2c6c2; }

.tabbar {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex;
  background: #fff; border-top: 1px solid #e8e2d8;
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  flex: 1; padding: 8px 0 6px; text-align: center; font-size: 12px;
  color: #999; background: none; border: none;
}
.tab .icon { display: block; font-size: 20px; margin-bottom: 2px; }
.tab.active { color: #f4a940; font-weight: 600; }

.toast {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(84px + env(safe-area-inset-bottom));
  background: rgba(50, 50, 50, 0.92); color: #fff; padding: 10px 16px;
  border-radius: 999px; font-size: 14px; max-width: 90vw; z-index: 10;
}

select.baby-switcher {
  border: 1px solid #eadfcc; background: #fff8ec; color: #7a5c1e;
  border-radius: 999px; padding: 4px 10px; font-size: 14px;
}
```

- [ ] **Step 3: BabySwitcher 與 App 殼層**

`web/src/ui/BabySwitcher.tsx`：

```tsx
import type { ProfileData } from '../logic/types';

interface Props {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelect: (id: string) => void;
}

export function BabySwitcher({ profiles, currentBaby, onSelect }: Props) {
  if (profiles.length === 0) return null;
  return (
    <select
      className="baby-switcher"
      value={currentBaby?.id ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="切換寶寶"
    >
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
```

`web/src/ui/App.tsx`（全面改寫；四頁先佔位，Task 10–13 逐頁替換 import 與 JSX）：

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadCurrentBabyId, resolveCurrentBaby, saveCurrentBabyId } from '../db/repository';
import type { ProfileData } from '../logic/types';

export interface PageProps {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelectBaby: (id: string) => void;
}

type Tab = 'record' | 'stats' | 'trend' | 'settings';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'record', label: '記錄', icon: '📝' },
  { key: 'stats', label: '每日統計', icon: '📊' },
  { key: 'trend', label: '趨勢', icon: '📈' },
  { key: 'settings', label: '設定', icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('record');
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [] as ProfileData[]);
  const [storedBabyId, setStoredBabyId] = useState<string | null>(loadCurrentBabyId);
  const currentBaby = resolveCurrentBaby(profiles, storedBabyId);

  const onSelectBaby = (id: string) => {
    saveCurrentBabyId(id);
    setStoredBabyId(id);
  };

  const pageProps: PageProps = { profiles, currentBaby, onSelectBaby };
  void pageProps; // Task 10–13 接上各頁後移除此行

  return (
    <>
      {tab === 'record' && <main className="page"><p>記錄頁施工中</p></main>}
      {tab === 'stats' && <main className="page"><p>每日統計頁施工中</p></main>}
      {tab === 'trend' && <main className="page"><p>趨勢頁施工中</p></main>}
      {tab === 'settings' && <main className="page"><p>設定頁施工中</p></main>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
```

`web/src/main.tsx` 在 `import App` 之後加一行：

```ts
import './ui/styles.css';
```

- [ ] **Step 4: 圖示與 PWA**

`web/public/icon.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#f4a940"/>
  <circle cx="256" cy="290" r="150" fill="#fff"/>
  <circle cx="203" cy="265" r="24" fill="#3a3a3a"/>
  <circle cx="309" cy="265" r="24" fill="#3a3a3a"/>
  <path d="M192 340q64 52 128 0" stroke="#3a3a3a" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M256 140q0-50 40-60" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round"/>
  <circle cx="304" cy="72" r="26" fill="#fff"/>
</svg>
```

`web/scripts/make-icons.mjs`：

```js
import sharp from 'sharp';

const src = new URL('../public/icon.svg', import.meta.url).pathname;
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;

await sharp(src, { density: 300 }).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(src, { density: 300 }).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(src, { density: 300 }).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
console.log('icons generated');
```

Run: `cd web && node scripts/make-icons.mjs`
Expected: `icons generated`，`web/public/` 出現三個 png

`web/vite.config.ts` 全檔改為：

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/BabyMonster/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'BabyMonster',
        short_name: 'BabyMonster',
        lang: 'zh-Hant',
        display: 'standalone',
        theme_color: '#f4a940',
        background_color: '#faf7f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
```

`web/index.html` 的 `<head>` 內、`<title>` 前加：

```html
    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />
```

- [ ] **Step 5: 驗證**

Run: `cd web && npm test && npm run build`
Expected: 測試全過；build 成功且 `dist/` 含 `manifest.webmanifest` 與 `sw.js`

Run: `cd web && npm run dev`（開瀏覽器檢查 `http://localhost:5173/BabyMonster/`）
Expected: 看到 4 個 tab 的殼層、佔位文字、tab 可切換

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "Add app shell with tab bar, styles, and PWA setup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 記錄頁（表單 + 色卡 + 今日時間軸）

**Files:**
- Create: `web/src/ui/RecordPage.tsx`, `web/src/ui/components/StoolColorPicker.tsx`
- Modify: `web/src/ui/App.tsx`（把 record 佔位換成 `<RecordPage {...pageProps} />`）

**Interfaces:**
- Consumes: `PageProps`（Task 9）、`db`（Task 8）、`createDefaultBaby`（Task 8）、`babyAge`/`ageDisplayText`（Task 4）、`sameLocalDay`（Task 3）、色卡（Task 2）、`BabySwitcher`、`format.ts`（Task 9）
- Produces: `RecordPage(props: PageProps)`（default export）、`StoolColorPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void })`

- [ ] **Step 1: StoolColorPicker**

`web/src/ui/components/StoolColorPicker.tsx`：

```tsx
import { STOOL_NUMBERS, isAbnormalStoolColor, stoolColorHex, stoolTextHex } from '../../logic/stoolColorCard';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function StoolColorPicker({ value, onChange }: Props) {
  return (
    <div>
      <div className="stool-grid">
        {STOOL_NUMBERS.map((n) => (
          <button
            key={n}
            type="button"
            className={'stool-cell' + (value === n ? ' selected' : '')}
            style={{ background: stoolColorHex(n), color: stoolTextHex(n) }}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== null && isAbnormalStoolColor(value) && (
        <p className="warn">
          ⚠️ {value} 號屬異常（白陶土色系），可能是膽道閉鎖等警訊，請儘速就醫確認。
        </p>
      )}
      <p className="hint">色塊為近似色，實體大便卡為最終判讀依據。再點一次可取消選擇。</p>
    </div>
  );
}
```

- [ ] **Step 2: RecordPage**

`web/src/ui/RecordPage.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createDefaultBaby } from '../db/repository';
import { sameLocalDay } from '../logic/dailyStats';
import { ageDisplayText, babyAge } from '../logic/babyAge';
import { BRISTOL_NAMES, STOOL_AMOUNT_NAMES, type BristolType, type RecordData, type StoolAmount } from '../logic/types';
import { isAbnormalStoolColor } from '../logic/stoolColorCard';
import { BabySwitcher } from './BabySwitcher';
import { StoolColorPicker } from './components/StoolColorPicker';
import { datetimeLocalValue, msFromDatetimeLocal, timeHM } from './format';
import type { PageProps } from './App';

const BRISTOL_TYPES: BristolType[] = [1, 2, 3, 4, 5, 6, 7];
const AMOUNTS: StoolAmount[] = ['few', 'medium', 'many'];

export default function RecordPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [timestamp, setTimestamp] = useState(() => datetimeLocalValue(Date.now()));
  const [feed, setFeed] = useState('');
  const [stoolColor, setStoolColor] = useState<number | null>(null);
  const [stoolAmount, setStoolAmount] = useState<StoolAmount | null>(null);
  const [stoolShape, setStoolShape] = useState<BristolType | null>(null);
  const [urine, setUrine] = useState(false);
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');

  const todayRecords = useLiveQuery(
    async () => {
      if (!currentBaby) return [] as RecordData[];
      const recs = await db.records.where('babyId').equals(currentBaby.id).toArray();
      return recs
        .filter((r) => sameLocalDay(r.timestamp, Date.now()))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    [currentBaby?.id],
    [] as RecordData[],
  );

  useEffect(() => {
    if (!editing) return;
    setTimestamp(datetimeLocalValue(editing.timestamp));
    setFeed(editing.feedAmount != null ? String(editing.feedAmount) : '');
    setStoolColor(editing.stoolColor ?? null);
    setStoolAmount(editing.stoolAmount ?? null);
    setStoolShape(editing.stoolShape ?? null);
    setUrine(editing.hasUrine);
    setTemp(editing.temperature != null ? String(editing.temperature) : '');
    setWeight(editing.weight != null ? String(editing.weight) : '');
    setNote(editing.note ?? '');
  }, [editing]);

  function reset() {
    setEditing(null);
    setTimestamp(datetimeLocalValue(Date.now()));
    setFeed('');
    setStoolColor(null);
    setStoolAmount(null);
    setStoolShape(null);
    setUrine(false);
    setTemp('');
    setWeight('');
    setNote('');
  }

  async function save() {
    let baby = currentBaby;
    if (!baby) {
      baby = await createDefaultBaby();
      onSelectBaby(baby.id);
    }
    const rec: RecordData = {
      id: editing?.id ?? crypto.randomUUID(),
      babyId: editing?.babyId ?? baby.id,
      timestamp: msFromDatetimeLocal(timestamp),
      hasUrine: urine,
      ...(feed !== '' ? { feedAmount: Number(feed) } : {}),
      ...(stoolColor !== null ? { stoolColor } : {}),
      ...(stoolColor !== null && stoolAmount !== null ? { stoolAmount } : {}),
      ...(stoolColor !== null && stoolShape !== null ? { stoolShape } : {}),
      ...(temp !== '' ? { temperature: Number(temp) } : {}),
      ...(weight !== '' ? { weight: Number(weight) } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    };
    await db.records.put(rec);
    reset();
  }

  async function remove(r: RecordData) {
    if (confirm('刪除這筆記錄？')) {
      await db.records.delete(r.id);
      if (editing?.id === r.id) reset();
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>{currentBaby?.name ?? 'BabyMonster'}</h1>
        {currentBaby && <span className="age">{ageDisplayText(babyAge(currentBaby.birthDate, Date.now()))}</span>}
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>{editing ? '編輯記錄' : '新增記錄'}</h2>
        <div className="field">
          <label className="field-label">時間</label>
          <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">喝奶量（ml）</label>
          <input type="number" inputMode="decimal" placeholder="例：120" value={feed} onChange={(e) => setFeed(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">大便顏色（大便卡 1–9 號，1–6 異常）</label>
          <StoolColorPicker value={stoolColor} onChange={setStoolColor} />
        </div>
        {stoolColor !== null && (
          <>
            <div className="field">
              <label className="field-label">大便量</label>
              <div className="seg">
                {AMOUNTS.map((a) => (
                  <button key={a} type="button" className={stoolAmount === a ? 'selected' : ''}
                    onClick={() => setStoolAmount(stoolAmount === a ? null : a)}>
                    {STOOL_AMOUNT_NAMES[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field-label">大便形狀（布里斯托分類）</label>
              <select value={stoolShape ?? ''} onChange={(e) => setStoolShape(e.target.value === '' ? null : (Number(e.target.value) as BristolType))}>
                <option value="">不記錄</option>
                {BRISTOL_TYPES.map((t) => (
                  <option key={t} value={t}>{BRISTOL_NAMES[t]}</option>
                ))}
              </select>
              <p className="hint">新生兒／母乳寶寶的便便天生偏軟，常落在 6–7 型，此量表僅供描述參考。</p>
            </div>
          </>
        )}
        <div className="field">
          <label className="field-label">小便</label>
          <div className="seg">
            <button type="button" className={urine ? 'selected' : ''} onClick={() => setUrine(!urine)}>
              {urine ? '有小便 ✓' : '有小便？'}
            </button>
          </div>
        </div>
        <div className="field">
          <label className="field-label">體溫（°C）</label>
          <input type="number" inputMode="decimal" placeholder="例：36.5" value={temp} onChange={(e) => setTemp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">體重（g）</label>
          <input type="number" inputMode="decimal" placeholder="例：4000" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">備註</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          {editing ? '儲存變更' : '儲存記錄'}
        </button>
        {editing && (
          <button className="btn" type="button" style={{ width: '100%', marginTop: 8 }} onClick={reset}>
            取消編輯
          </button>
        )}
      </section>

      <section className="card">
        <h2>今日記錄</h2>
        {todayRecords.length === 0 && <p className="hint">今天還沒有記錄。</p>}
        <ul className="timeline">
          {todayRecords.map((r) => (
            <li key={r.id} className="timeline-item">
              <span className="time">{timeHM(r.timestamp)}</span>
              <div className="body" onClick={() => setEditing(r)}>
                <div className="chips">
                  {r.feedAmount != null && <span className="chip">🍼 {r.feedAmount} ml</span>}
                  {r.stoolColor != null && (
                    <span className={'chip' + (isAbnormalStoolColor(r.stoolColor) ? ' abnormal' : '')}>
                      💩 {r.stoolColor} 號
                      {r.stoolAmount ? `・${STOOL_AMOUNT_NAMES[r.stoolAmount]}` : ''}
                      {r.stoolShape ? `・第${r.stoolShape}型` : ''}
                    </span>
                  )}
                  {r.hasUrine && <span className="chip">💧 小便</span>}
                  {r.temperature != null && <span className="chip">🌡 {r.temperature} °C</span>}
                  {r.weight != null && <span className="chip">⚖️ {r.weight} g</span>}
                  {r.note && <span className="chip">📝 {r.note}</span>}
                </div>
              </div>
              <button className="btn btn-danger" type="button" onClick={() => void remove(r)}>刪除</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: 接上 App**

`web/src/ui/App.tsx`：檔頭加 `import RecordPage from './RecordPage';`，刪除 `void pageProps; // Task 10–13 接上各頁後移除此行` 該行（若 Task 11–13 尚未完成，改為保留其餘佔位頁），並把

```tsx
      {tab === 'record' && <main className="page"><p>記錄頁施工中</p></main>}
```

改為

```tsx
      {tab === 'record' && <RecordPage {...pageProps} />}
```

- [ ] **Step 4: 驗證**

Run: `cd web && npm test && npm run build`
Expected: 測試全過、build 成功（無 TS 錯誤）

Run: `cd web && npm run dev`，瀏覽器操作：新增一筆含喝奶＋大便 3 號的記錄
Expected: 時間軸出現該筆、3 號 chip 顯示異常紅底；選 3 號時表單顯示異常警告；點時間軸可進編輯、可刪除；重新整理資料仍在（IndexedDB）；首筆儲存自動建立「BabyMonster」寶寶（切換器出現）

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/
git commit -m "Add record page with entry form and today timeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 每日統計頁

**Files:**
- Create: `web/src/ui/DailyStatsPage.tsx`
- Modify: `web/src/ui/App.tsx`（stats 佔位換成 `<DailyStatsPage {...pageProps} />`）

**Interfaces:**
- Consumes: `PageProps`、`BabySwitcher`、`format.ts`（Task 9）、`dailySummary`（Task 3）、`db`（Task 8）
- Produces: `DailyStatsPage(props: PageProps)`（default export）

- [ ] **Step 1: 實作**

`web/src/ui/DailyStatsPage.tsx`：

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { dailySummary } from '../logic/dailyStats';
import type { RecordData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { dateInputValue, msFromDateInput } from './format';
import type { PageProps } from './App';

export default function DailyStatsPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [dateStr, setDateStr] = useState(() => dateInputValue(Date.now()));

  const records = useLiveQuery(
    () => (currentBaby ? db.records.where('babyId').equals(currentBaby.id).toArray() : Promise.resolve([] as RecordData[])),
    [currentBaby?.id],
    [] as RecordData[],
  );

  const s = dailySummary(msFromDateInput(dateStr), records);
  const fmt = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits).replace(/\.0$/, ''));

  return (
    <main className="page">
      <header className="page-header">
        <h1>每日統計</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="field">
          <label className="field-label">日期</label>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">大便次數</div>
          <div className="stat-value">{s.stoolCount}<span className="unit">次</span></div>
        </div>
        <div className="stat-card">
          <div className="label">小便次數</div>
          <div className="stat-value">{s.urineCount}<span className="unit">次</span></div>
        </div>
        <div className="stat-card">
          <div className="label">總喝奶量</div>
          <div className="stat-value">{s.totalFeed}<span className="unit">ml</span></div>
        </div>
        <div className="stat-card">
          <div className="label">平均體溫</div>
          <div className="stat-value">{fmt(s.averageTemperature)}<span className="unit">°C</span></div>
        </div>
        <div className="stat-card">
          <div className="label">平均體重</div>
          <div className="stat-value">{fmt(s.averageWeight, 0)}<span className="unit">g</span></div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 接上 App**

`web/src/ui/App.tsx`：加 `import DailyStatsPage from './DailyStatsPage';`，stats 佔位行改為

```tsx
      {tab === 'stats' && <DailyStatsPage {...pageProps} />}
```

- [ ] **Step 3: 驗證**

Run: `cd web && npm test && npm run build`
Expected: 全過

Run: `cd web && npm run dev`，切到每日統計、選有記錄的日期
Expected: 5 張卡片數字正確；無資料的平均顯示「—」；切寶寶會重算

- [ ] **Step 4: Commit**

```bash
git add web/src/ui/
git commit -m "Add daily stats page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: 趨勢頁（Recharts）

**Files:**
- Create: `web/src/ui/TrendPage.tsx`
- Modify: `web/src/ui/App.tsx`（trend 佔位換成 `<TrendPage {...pageProps} />`）

**Interfaces:**
- Consumes: `PageProps`、`BabySwitcher`、`monthDay`（Task 9）、`trendSeries`/`TREND_METRIC_NAMES`/`TREND_METRIC_UNITS`（Task 5）、`db`（Task 8）
- Produces: `TrendPage(props: PageProps)`（default export）

- [ ] **Step 1: 實作**

`web/src/ui/TrendPage.tsx`：

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '../db/db';
import {
  TREND_METRIC_NAMES, TREND_METRIC_UNITS, trendSeries, type TrendMetric,
} from '../logic/trendSeries';
import type { RecordData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { monthDay } from './format';
import type { PageProps } from './App';

const DAY_CHOICES = [7, 14, 30] as const;
const METRICS = Object.keys(TREND_METRIC_NAMES) as TrendMetric[];

export default function TrendPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState('');
  const [metric, setMetric] = useState<TrendMetric>('stoolCount');

  const records = useLiveQuery(
    () => (currentBaby ? db.records.where('babyId').equals(currentBaby.id).toArray() : Promise.resolve([] as RecordData[])),
    [currentBaby?.id],
    [] as RecordData[],
  );

  const series = trendSeries(metric, days, Date.now(), records);
  const data = series.map((p) => ({ label: monthDay(p.dayMs), value: p.value }));

  function applyCustom(v: string) {
    setCustomDays(v);
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && n <= 365) setDays(n);
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>趨勢</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="field">
          <label className="field-label">天數</label>
          <div className="seg">
            {DAY_CHOICES.map((d) => (
              <button key={d} type="button" className={days === d && customDays === '' ? 'selected' : ''}
                onClick={() => { setDays(d); setCustomDays(''); }}>
                {d} 天
              </button>
            ))}
            <input
              type="number" inputMode="numeric" placeholder="自訂" value={customDays}
              onChange={(e) => applyCustom(e.target.value)}
              style={{ width: 72, padding: '8px 10px', fontSize: 15, border: '1px solid #ddd', borderRadius: 999 }}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label">指標</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{TREND_METRIC_NAMES[m]}（{TREND_METRIC_UNITS[m]}）</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h2>{TREND_METRIC_NAMES[metric]}（{TREND_METRIC_UNITS[metric]}）・近 {days} 天</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => [`${v} ${TREND_METRIC_UNITS[metric]}`, TREND_METRIC_NAMES[metric]]} />
            <Line type="monotone" dataKey="value" stroke="#f4a940" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 接上 App**

`web/src/ui/App.tsx`：加 `import TrendPage from './TrendPage';`，trend 佔位行改為

```tsx
      {tab === 'trend' && <TrendPage {...pageProps} />}
```

- [ ] **Step 3: 驗證**

Run: `cd web && npm test && npm run build`
Expected: 全過

Run: `cd web && npm run dev`，切到趨勢頁
Expected: 折線圖渲染；7/14/30/自訂切換；換指標曲線更新；平均體溫在無資料日呈斷點（不連線）

- [ ] **Step 4: Commit**

```bash
git add web/src/ui/
git commit -m "Add trend page with Recharts line chart

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: 設定頁（寶寶管理 + 匯出匯入）

**Files:**
- Create: `web/src/ui/SettingsPage.tsx`, `web/src/ui/components/Toast.tsx`
- Modify: `web/src/ui/App.tsx`（settings 佔位換成 `<SettingsPage {...pageProps} />`，並刪除已無用的佔位相關程式碼）

**Interfaces:**
- Consumes: `PageProps`、`format.ts`（Task 9）、`babyAge`/`ageDisplayText`（Task 4）、`allData`/`importMerge`/`deleteBabyCascade`（Task 8）、`encodeV2`/`decodeAny`（Task 6）、`db`（Task 8）
- Produces: `SettingsPage(props: PageProps)`（default export）、`Toast({ message }: { message: string | null })`

- [ ] **Step 1: Toast**

`web/src/ui/components/Toast.tsx`：

```tsx
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
```

- [ ] **Step 2: SettingsPage**

`web/src/ui/SettingsPage.tsx`：

```tsx
import { useRef, useState } from 'react';
import { db } from '../db/db';
import { allData, deleteBabyCascade, importMerge } from '../db/repository';
import { decodeAny, encodeV2 } from '../logic/dataTransfer';
import { ageDisplayText, babyAge } from '../logic/babyAge';
import type { ProfileData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { Toast } from './components/Toast';
import { dateInputValue, msFromDateInput, ymdCompact } from './format';
import type { PageProps } from './App';

export default function SettingsPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新增
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(() => dateInputValue(Date.now()));
  const [exportScope, setExportScope] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function show(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function startEdit(p: ProfileData) {
    setEditingId(p.id);
    setName(p.name);
    setBirth(dateInputValue(p.birthDate));
  }

  function startAdd() {
    setEditingId('new');
    setName('');
    setBirth(dateInputValue(Date.now()));
  }

  async function saveBaby() {
    const n = name.trim() || 'BabyMonster';
    const b = msFromDateInput(birth);
    if (editingId === 'new') {
      const p: ProfileData = { id: crypto.randomUUID(), name: n, birthDate: b };
      await db.profiles.add(p);
      onSelectBaby(p.id);
    } else if (editingId) {
      await db.profiles.update(editingId, { name: n, birthDate: b });
    }
    setEditingId(null);
  }

  async function removeBaby(p: ProfileData) {
    const count = await db.records.where('babyId').equals(p.id).count();
    if (confirm(`將一併刪除「${p.name}」的 ${count} 筆記錄，確定刪除？`)) {
      await deleteBabyCascade(p.id);
      if (editingId === p.id) setEditingId(null);
    }
  }

  async function doExport() {
    try {
      const data = await allData();
      const scoped =
        exportScope === 'all'
          ? data
          : {
              profiles: data.profiles.filter((p) => p.id === exportScope),
              records: data.records.filter((r) => r.babyId === exportScope),
            };
      const babyName = exportScope === 'all' ? null : scoped.profiles[0]?.name ?? null;
      const filename = babyName
        ? `BabyMonster-${babyName}-${ymdCompact(Date.now())}.json`
        : `BabyMonster-${ymdCompact(Date.now())}.json`;
      const json = encodeV2(scoped);
      const file = new File([json], filename, { type: 'application/json' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'BabyMonster 備份' });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      show('已匯出');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') show(`匯出失敗：${(e as Error).message}`);
    }
  }

  async function onImportFile(f: File | undefined) {
    if (!f) return;
    try {
      const payload = decodeAny(await f.text());
      await importMerge(payload);
      show(`匯入成功：${payload.profiles.length} 位寶寶、${payload.records.length} 筆記錄已合併`);
    } catch (e) {
      show(`匯入失敗：${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>設定</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>寶寶</h2>
        {profiles.map((p) => (
          <div key={p.id} className="list-row">
            <div onClick={() => startEdit(p)}>
              <div>{p.name}</div>
              <div className="hint" style={{ margin: 0 }}>{ageDisplayText(babyAge(p.birthDate, Date.now()))}</div>
            </div>
            <button className="btn btn-danger" type="button" onClick={() => void removeBaby(p)}>刪除</button>
          </div>
        ))}
        {profiles.length === 0 && <p className="hint">尚未建立寶寶；第一筆記錄儲存時會自動建立。</p>}

        {editingId !== null ? (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label className="field-label">名字</label>
              <input type="text" placeholder="BabyMonster" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">生日</label>
              <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="button" onClick={() => void saveBaby()}>
              {editingId === 'new' ? '新增寶寶' : '儲存變更'}
            </button>
            <button className="btn" type="button" style={{ width: '100%', marginTop: 8 }} onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        ) : (
          <button className="btn" type="button" style={{ width: '100%', marginTop: 12 }} onClick={startAdd}>
            ＋ 新增寶寶
          </button>
        )}
      </section>

      <section className="card">
        <h2>匯出資料</h2>
        <div className="field">
          <label className="field-label">範圍</label>
          <select value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
            <option value="all">全部寶寶</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>只有 {p.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void doExport()}>
          匯出 / 分享（JSON）
        </button>
        <p className="hint">iPhone 上會開分享面板，可直接傳 LINE；電腦上會下載檔案。</p>
      </section>

      <section className="card">
        <h2>匯入資料</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        <p className="hint">
          支援本 App（v2）與 iOS 版（v1）匯出檔。以記錄 id 聯集合併，重複記錄保留本機版本；驗證失敗不會變動現有資料。
        </p>
      </section>

      <Toast message={toast} />
    </main>
  );
}
```

- [ ] **Step 3: 接上 App**

`web/src/ui/App.tsx`：加 `import SettingsPage from './SettingsPage';`，settings 佔位行改為

```tsx
      {tab === 'settings' && <SettingsPage {...pageProps} />}
```

四頁全部接上後，App.tsx 應已無佔位 `<main>` 與 `void pageProps` 行。

- [ ] **Step 4: 驗證**

Run: `cd web && npm test && npm run build`
Expected: 全過

Run: `cd web && npm run dev`，瀏覽器操作：
1. 新增第二位寶寶 → 切換器兩位可切；記錄/統計/趨勢隨切換過濾
2. 匯出（全部）→ 下載檔案，打開確認日期無毫秒、有 `"version": 2`
3. 改一筆資料後把剛剛的檔案匯回 → toast 顯示合併結果、重複記錄保留本機
4. 匯入壞檔（隨便存個 `{"foo":1}`）→ toast 顯示錯誤、資料不變
5. 刪除寶寶 → 確認框含記錄筆數；確認後其記錄一併消失

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/
git commit -m "Add settings page with baby management and import/export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: GitHub Actions 部署 + 端對端驗收 + 進度更新

**Files:**
- Create: `.github/workflows/deploy-web.yml`
- Modify: `PROGRESS.md`（加「網頁版」區塊）

**Interfaces:**
- Consumes: Task 1–13 完成的 `web/`
- Produces: push main 自動部署到 `https://wsturkey6-hash.github.io/BabyMonster/`

- [ ] **Step 1: workflow**

`.github/workflows/deploy-web.yml`：

```yaml
name: Deploy web

on:
  push:
    branches: [main]
    paths: ['web/**', '.github/workflows/deploy-web.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 端對端驗收（production build）**

Run: `cd web && npm run build && npm run preview`
瀏覽器開 `http://localhost:4173/BabyMonster/`，完整走一遍：新增記錄（含異常色卡）→ 每日統計 → 趨勢 → 新增第二位寶寶並切換 → 匯出 → 匯入 → 刪寶寶。
Expected: 全部功能正常、console 無錯誤、重新整理資料仍在。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 檔尾加：

```markdown
## 網頁版（PWA）
- Spec：`docs/superpowers/specs/2026-07-18-babymonster-web-design.md`
- Plan：`docs/superpowers/plans/2026-07-18-babymonster-web-implementation.md`（14 Task）
- [ ] Task 1–14（完成逐項勾選並附 commit hash）
- 部署：GitHub Pages（`.github/workflows/deploy-web.yml`）；首次需在 repo Settings → Pages 選 Source = GitHub Actions（使用者操作）
- 待使用者同意後推送 GitHub 觸發部署
```

（若前面 task 執行時已逐項更新，這一步只補部署與驗收狀態。）

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-web.yml PROGRESS.md
git commit -m "Add GitHub Pages deploy workflow for web app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 交付前確認（不自行推送）**

向使用者回報：分支 `feature/web` 已完成，等待指示 —— 合併到 main、推送 GitHub（需明確同意）、以及首次啟用 GitHub Pages（repo Settings → Pages → Source: GitHub Actions）。

---

## Self-Review 紀錄

- **Spec coverage**：spec §3 技術棧（Task 1/9/12）、§4 目錄（Task 1–13）、§5 資料模型/currentBabyId/預設寶寶（Task 2/8/10）、§6 統計/年齡/色卡/布里斯托/趨勢（Task 2–5）、§7 匯出匯入相容（Task 6/7/13）、§8 四分頁（Task 9–13）、§9 錯誤處理（Task 6 整檔拒絕、Task 8 transaction 回滾、Task 13 toast）、§10 測試（Task 2–8）、§11 部署（Task 14）。無缺口。
- **Placeholder scan**：無 TBD/TODO；佔位頁為刻意的漸進接線設計，於 Task 13 收尾移除。
- **Type consistency**：`PageProps`（Task 9 定義，10–13 引用）、`BackupPayloadV2`（Task 6 定義，7/8/13 引用）、`RecordData`/`ProfileData`（Task 2 定義，全部引用）、`resolveCurrentBaby(profiles, storedId)`（Task 8 定義，Task 9 引用）簽名一致。
