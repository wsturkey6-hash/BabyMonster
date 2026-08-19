#!/usr/bin/env node
// 由 data/who-growth-reference.json 產生兩平台的參考資料檔。
//
//   node scripts/generate-growth-reference.mjs          產生
//   node scripts/generate-growth-reference.mjs --check   驗證產出與 repo 內容一致（CI 用）
//
// 產出的兩個檔案都會 commit 進 repo，這樣 iOS 不必改手寫的 pbxproj、
// web 不必改建置流程。任一邊被手改，--check 就會失敗。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L_SCALE = 10000;
const M_SCALE = 10000;
const S_SCALE = 100000;
const KEYS = [
  'weight|male', 'weight|female',
  'height|male', 'height|female',
  'headCirc|male', 'headCirc|female',
];

/** 定點數 + 差分：相鄰日的差值很小，gzip 後整份表只剩 ~8 KB。 */
function encode(values, scale) {
  const fixed = values.map((v) => Math.round(v * scale));
  const out = [fixed[0]];
  for (let i = 1; i < fixed.length; i++) out.push(fixed[i] - fixed[i - 1]);
  return out;
}

function load() {
  const src = JSON.parse(readFileSync(join(ROOT, 'data', 'who-growth-reference.json'), 'utf8'));
  const [dayMin, dayMax] = src.dayRange;
  if (dayMin !== 0) throw new Error('dayRange 必須從 0 開始');
  const tables = {};
  for (const key of KEYS) {
    const t = src.tables[key];
    if (!t) throw new Error(`缺少 ${key}`);
    for (const p of ['L', 'M', 'S']) {
      if (t[p].length !== dayMax + 1) {
        throw new Error(`${key}.${p} 長度 ${t[p].length}，預期 ${dayMax + 1}`);
      }
    }
    tables[key] = {
      L: encode(t.L, L_SCALE),
      M: encode(t.M, M_SCALE),
      S: encode(t.S, S_SCALE),
    };
    // 立刻驗證定點數可完全還原，抓住精度設錯的情況
    for (const [p, scale] of [['L', L_SCALE], ['M', M_SCALE], ['S', S_SCALE]]) {
      let acc = 0;
      for (let i = 0; i <= dayMax; i++) {
        acc += tables[key][p][i];
        if (Math.abs(acc / scale - t[p][i]) > 1e-9) {
          throw new Error(`${key}.${p} 第 ${i} 天無法完全還原`);
        }
      }
    }
  }
  return { dayMax, tables, retrievedOn: src.retrievedOn, source: src.source };
}

const BANNER = (meta) => `本檔案由 scripts/generate-growth-reference.mjs 產生，請勿手動編輯。
來源：${meta.source}
取得日期：${meta.retrievedOn}
資料為 WHO 逐日 LMS 參數，以定點數 + 差分編碼（載入時做前綴和還原）。`;

function emitTypeScript(meta) {
  const rows = KEYS.map((k) => {
    const t = meta.tables[k];
    return `  '${k}': [\n    [${t.L.join(',')}],\n    [${t.M.join(',')}],\n    [${t.S.join(',')}],\n  ],`;
  }).join('\n');

  return `/* eslint-disable */
/**
${BANNER(meta).split('\n').map((l) => ` * ${l}`).join('\n')}
 */

export const GROWTH_DAY_MAX = ${meta.dayMax};

const L_SCALE = ${L_SCALE};
const M_SCALE = ${M_SCALE};
const S_SCALE = ${S_SCALE};

/** key = \`<指標>|<性別>\`；三個陣列依序是差分編碼的 L、M、S。 */
const ENCODED: Record<string, [number[], number[], number[]]> = {
${rows}
};

export interface Lms {
  L: number;
  M: number;
  S: number;
}

function decode(encoded: number[], scale: number): number[] {
  const out = new Array<number>(encoded.length);
  let acc = 0;
  for (let i = 0; i < encoded.length; i++) {
    acc += encoded[i];
    out[i] = acc / scale;
  }
  return out;
}

export interface GrowthTable {
  L: number[];
  M: number[];
  S: number[];
}

const cache = new Map<string, GrowthTable>();

/** 取得某指標／性別的逐日 LMS 表。未知的 key 回傳 null。 */
export function growthTable(key: string): GrowthTable | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const enc = ENCODED[key];
  if (!enc) return null;
  const table: GrowthTable = {
    L: decode(enc[0], L_SCALE),
    M: decode(enc[1], M_SCALE),
    S: decode(enc[2], S_SCALE),
  };
  cache.set(key, table);
  return table;
}
`;
}

function emitSwift(meta) {
  const rows = KEYS.map((k) => {
    const t = meta.tables[k];
    return `    "${k}": [\n      [${t.L.join(',')}],\n      [${t.M.join(',')}],\n      [${t.S.join(',')}],\n    ],`;
  }).join('\n');

  return `${BANNER(meta).split('\n').map((l) => `// ${l}`).join('\n')}

import Foundation

struct GrowthTable {
    let L: [Double]
    let M: [Double]
    let S: [Double]
}

enum GrowthReferenceData {
    static let dayMax = ${meta.dayMax}

    private static let lScale = ${L_SCALE}.0
    private static let mScale = ${M_SCALE}.0
    private static let sScale = ${S_SCALE}.0

    /// key = "<指標>|<性別>"；三個陣列依序是差分編碼的 L、M、S。
    private static let encoded: [String: [[Int]]] = [
${rows}
    ]

    private static func decode(_ values: [Int], _ scale: Double) -> [Double] {
        var acc = 0
        var out = [Double]()
        out.reserveCapacity(values.count)
        for v in values {
            acc += v
            out.append(Double(acc) / scale)
        }
        return out
    }

    /// 六張表在首次取用時一次解碼完（約 33,000 次加法，只發生一次）。
    private static let tables: [String: GrowthTable] = {
        var out = [String: GrowthTable]()
        for (key, enc) in encoded {
            out[key] = GrowthTable(L: decode(enc[0], lScale),
                                   M: decode(enc[1], mScale),
                                   S: decode(enc[2], sScale))
        }
        return out
    }()

    /// 取得某指標／性別的逐日 LMS 表。未知的 key 回傳 nil。
    static func table(_ key: String) -> GrowthTable? { tables[key] }
}
`;
}

const meta = load();
const targets = [
  [join(ROOT, 'web', 'src', 'logic', 'growthReference.generated.ts'), emitTypeScript(meta)],
  [join(ROOT, 'BabyMonster', 'Logic', 'GrowthReference.generated.swift'), emitSwift(meta)],
];

const check = process.argv.includes('--check');
let failed = false;
for (const [path, content] of targets) {
  if (check) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* 檔案不存在 → 視為不一致 */
    }
    if (current !== content) {
      console.error(`不一致：${path}`);
      failed = true;
    }
  } else {
    writeFileSync(path, content);
    console.log(`已產生 ${path}（${(content.length / 1024).toFixed(0)} KB）`);
  }
}
if (check && failed) {
  console.error('\n產生的檔案與 repo 內容不同。請執行：node scripts/generate-growth-reference.mjs');
  process.exit(1);
}
if (check) console.log('產生的檔案與 repo 內容一致。');
