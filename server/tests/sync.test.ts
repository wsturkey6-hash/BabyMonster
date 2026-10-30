import { beforeEach, describe, expect, it } from 'vitest';
import { PULL_LIMIT } from '../src/sync';
import { BABY, T0, USER, deleteRecord, harness, putRecord, silenceLogs, type Harness } from './harness';

let h: Harness;
beforeEach(() => {
  silenceLogs();
  h = harness();
});

/** 時鐘沒有誤差的那支手機（clientNow = serverNow，skew = 0）。 */
const push = (changes: unknown[], cursor = 0, clientNow = T0) => h.sync({ cursor, changes, clientNow });

describe('LWW', () => {
  it('較新的蓋掉較舊的', async () => {
    await push([putRecord('r1', T0 - 2000, { note: '舊' })]);
    const res = await push([putRecord('r1', T0 - 1000, { note: '新' })]);
    expect(res.body.results).toEqual([{ kind: 'record', id: 'r1', applied: true }]);
    expect(JSON.parse(h.row('record', 'r1')!.data!).note).toBe('新');
  });

  it('較舊的被回報 stale，而且不會蓋掉既有的值', async () => {
    await push([putRecord('r1', T0 - 1000, { note: '新' })]);
    const res = await push([putRecord('r1', T0 - 2000, { note: '舊' })]);
    expect(res.body.results).toEqual([{ kind: 'record', id: 'r1', applied: false, reason: 'stale' }]);
    const row = h.row('record', 'r1')!;
    expect(JSON.parse(row.data!).note).toBe('新');
    expect(row.updated_at).toBe(T0 - 1000);
  });

  it('時間相同時後到的贏', async () => {
    await push([putRecord('r1', T0 - 1000, { note: '先到' })]);
    const res = await push([putRecord('r1', T0 - 1000, { note: '後到' })]);
    expect(res.body.results[0].applied).toBe(true);
    expect(JSON.parse(h.row('record', 'r1')!.data!).note).toBe('後到');
  });

  it('刪除寫成墓碑，不是真的刪掉那一列', async () => {
    await push([putRecord('r1', T0 - 2000)]);
    await push([deleteRecord('r1', T0 - 1000)]);
    const row = h.row('record', 'r1')!;
    expect(row.deleted).toBe(1);
    expect(row.data).toBeNull();
    expect(h.rows()).toHaveLength(1);
  });

  it('刪除輸掉 LWW 時不會留下墓碑', async () => {
    await push([putRecord('r1', T0 - 1000, { note: '贏家' })]);
    const res = await push([deleteRecord('r1', T0 - 5000)]);
    expect(res.body.results[0]).toMatchObject({ applied: false, reason: 'stale' });
    expect(h.row('record', 'r1')!.deleted).toBe(0);
  });

  it('updated_by 來自 X-Family-User，形狀不像 Email 就存 null', async () => {
    await push([putRecord('r1', T0 - 1000)]);
    expect(h.row('record', 'r1')!.updated_by).toBe(USER);
    // 換行與控制字元連 Headers 都送不出去，所以這裡用「形狀不對」的值；偽造 log 的那幾種在 auth.test.ts
    await h.sync({ cursor: 0, changes: [putRecord('r2', T0 - 1000)], clientNow: T0 }, { user: 'not-an-email' });
    expect(h.row('record', 'r2')!.updated_by).toBeNull();
  });
});

describe('時鐘平移（skew = serverNow - clientNow）', () => {
  // 客戶端送出前會把 updatedAt 夾到 min(updatedAt, clientNow)，所以最壞情況就是 updatedAt === clientNow
  const cases = [
    ['快 10 分鐘', 600_000],
    ['慢 10 分鐘', -600_000],
  ] as const;

  for (const [name, offset] of cases) {
    it(`手機${name} → 照樣寫入，而且 updated_at 落在伺服器的時間軸上`, async () => {
      const clientNow = T0 + offset;
      const res = await h.sync({ cursor: 0, changes: [putRecord('r1', clientNow)], clientNow });
      expect(res.status).toBe(200);
      expect(res.body.results[0].applied).toBe(true);
      expect(h.row('record', 'r1')!.updated_at).toBe(T0);
      expect(res.body.changes[0].updatedAt).toBe(T0);
    });
  }

  it('received_at 是伺服器自己的時鐘，和平移後的 updated_at 分開記（事後追查用，不參與 LWW）', async () => {
    const clientNow = T0 + 600_000; // 快 10 分鐘
    await h.sync({ cursor: 0, changes: [putRecord('r1', clientNow - 60_000)], clientNow });
    const row = h.row('record', 'r1')!;
    expect(row.updated_at).toBe(T0 - 60_000);
    expect(row.received_at).toBe(T0);
  });

  it('平移之後才做範圍檢查：慢 10 分鐘的手機送出 1 分鐘前的編輯不會被當成 invalid', async () => {
    const clientNow = T0 - 600_000;
    const res = await h.sync({ cursor: 0, changes: [putRecord('r1', clientNow - 60_000)], clientNow });
    expect(res.body.results[0]).toEqual({ kind: 'record', id: 'r1', applied: true });
    expect(h.row('record', 'r1')!.updated_at).toBe(T0 - 60_000);
  });

  it('真實時間較晚的贏，不管它來自快的還是慢的手機', async () => {
    // 快手機在世界時間 T0 動作
    await h.sync({ cursor: 0, changes: [putRecord('r1', T0 + 600_000, { note: '快手機' })], clientNow: T0 + 600_000 });
    // 慢手機在世界時間 T0 + 1 秒動作（伺服器的時鐘也前進 1 秒）
    h.setNow(T0 + 1000);
    const res = await h.sync({
      cursor: 0,
      changes: [putRecord('r1', T0 + 1000 - 600_000, { note: '慢手機' })],
      clientNow: T0 + 1000 - 600_000,
    });
    expect(res.body.results[0].applied).toBe(true);
    expect(JSON.parse(h.row('record', 'r1')!.data!).note).toBe('慢手機');
  });
});

describe('逐筆回報，單筆壞掉不會擋住整批', () => {
  it('updatedAt = 8.64e15 的刪除不寫入、回報 invalid，同批其他變更照樣寫進去', async () => {
    const changes = [
      putRecord('ok1', T0 - 1000),
      { ...deleteRecord('bad', 8.64e15) },
      putRecord('ok2', T0 - 1000),
    ];
    const res = await push(changes);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { kind: 'record', id: 'ok1', applied: true },
      { kind: 'record', id: 'bad', applied: false, reason: 'invalid' },
      { kind: 'record', id: 'ok2', applied: true },
    ]);
    expect(h.rows().map((r) => r.id).sort()).toEqual(['ok1', 'ok2']);
  });

  it('updatedAt 用秒而不是毫秒 → 明確回報 invalid，不是悄悄忽略', async () => {
    const res = await push([putRecord('r1', Math.floor(T0 / 1000))]);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ kind: 'record', id: 'r1', applied: false, reason: 'invalid' }]);
    expect(h.rows()).toHaveLength(0);
  });

  it('欄位驗證失敗、kind 不合法、op 不合法都是逐筆 invalid，不是 400', async () => {
    const res = await push([
      { kind: 'record', id: 'r1', op: 'put', data: { id: 'r1', babyId: BABY, timestamp: T0 }, updatedAt: T0 - 1 },
      { kind: 'baby', id: 'x', op: 'put', data: {}, updatedAt: T0 - 1 },
      { kind: 'record', id: 'r2', op: 'patch', data: {}, updatedAt: T0 - 1 },
      putRecord('r3', T0 - 1),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { applied: boolean }) => r.applied)).toEqual([false, false, false, true]);
    expect(res.body.results.slice(0, 3).every((r: { reason: string }) => r.reason === 'invalid')).toBe(true);
    expect(h.rows().map((r) => r.id)).toEqual(['r3']);
  });

  it('invalid 的回報帶著原本的 kind/id，客戶端才對得上 outbox', async () => {
    const res = await push([putRecord('r1', Math.floor(T0 / 1000))]);
    expect(res.body.results[0].kind).toBe('record');
    expect(res.body.results[0].id).toBe('r1');
  });
});

describe('輸掉 LWW 時把贏家的 seq 推到最新', () => {
  /** 已經拉過贏家（游標越過它）的那支手機再推一個較舊的版本，下一輪要能拿回贏家。 */
  async function loseAfterPulling(loser: unknown) {
    await push([putRecord('r1', T0 - 1000, { note: '贏家' })]);
    const pulled = await push([], 0);
    expect(pulled.body.changes).toHaveLength(1);
    const cursor = pulled.body.cursor; // 輸家的游標已經越過贏家

    const rejected = await push([loser], cursor);
    expect(rejected.body.results[0]).toMatchObject({ applied: false, reason: 'stale' });

    // 下一輪：同一個游標，贏家因為 seq 被推到最新而重新送達
    const again = await push([], cursor);
    return { cursor, again };
  }

  it('put 輸掉 → 輸家下一輪收到贏家', async () => {
    const { cursor, again } = await loseAfterPulling(putRecord('r1', T0 - 5000, { note: '輸家' }));
    expect(again.body.changes).toHaveLength(1);
    expect(again.body.changes[0].seq).toBeGreaterThan(cursor);
    expect(again.body.changes[0].deleted).toBe(false);
    expect(again.body.changes[0].data.note).toBe('贏家');
  });

  it('delete 輸掉 → 刪掉那一筆的手機會把它拿回來', async () => {
    const { cursor, again } = await loseAfterPulling(deleteRecord('r1', T0 - 5000));
    expect(again.body.changes).toHaveLength(1);
    expect(again.body.changes[0].seq).toBeGreaterThan(cursor);
    expect(again.body.changes[0].deleted).toBe(false);
    expect(again.body.changes[0].data.note).toBe('贏家');
  });

  it('推進 seq 只換序號：資料、updated_at、updated_by 都不動', async () => {
    await push([putRecord('r1', T0 - 1000, { note: '贏家' })]);
    const before = h.row('record', 'r1')!;
    await push([putRecord('r1', T0 - 5000, { note: '輸家' })]);
    const after = h.row('record', 'r1')!;
    expect(after.seq).toBeGreaterThan(before.seq);
    expect({ ...after, seq: 0 }).toEqual({ ...before, seq: 0 });
  });
});

describe('cursor 與 more', () => {
  it('cursor 是這一批的最大 seq，不是全域最大', async () => {
    h.seed(PULL_LIMIT + 200);
    const first = await push([], 0);
    expect(first.body.changes).toHaveLength(PULL_LIMIT);
    expect(first.body.more).toBe(true);
    expect(first.body.cursor).toBe(PULL_LIMIT); // 不是 1200
    expect(first.body.changes[PULL_LIMIT - 1].seq).toBe(PULL_LIMIT);

    const second = await push([], first.body.cursor);
    expect(second.body.changes).toHaveLength(200);
    expect(second.body.more).toBe(false);
    expect(second.body.cursor).toBe(PULL_LIMIT + 200);
  });

  it('剛好一批時 more 是 false', async () => {
    h.seed(PULL_LIMIT);
    const res = await push([], 0);
    expect(res.body.changes).toHaveLength(PULL_LIMIT);
    expect(res.body.more).toBe(false);
    expect(res.body.cursor).toBe(PULL_LIMIT);
  });

  it('空批次把原本的 cursor 奉還', async () => {
    h.seed(3);
    const res = await push([], 3);
    expect(res.body.changes).toEqual([]);
    expect(res.body.cursor).toBe(3);
    expect(res.body.more).toBe(false);
  });

  it('只回傳 seq 大於 cursor 的列，依 seq 排序', async () => {
    await push([putRecord('r1', T0 - 3000), putRecord('r2', T0 - 2000), putRecord('r3', T0 - 1000)]);
    const res = await push([], 1);
    expect(res.body.changes.map((c: { id: string }) => c.id)).toEqual(['r2', 'r3']);
    expect(res.body.changes.map((c: { seq: number }) => c.seq)).toEqual([2, 3]);
  });

  it('墓碑回傳 deleted: true 且不帶 data', async () => {
    await push([putRecord('r1', T0 - 2000)]);
    await push([deleteRecord('r1', T0 - 1000)]);
    const res = await push([], 1);
    expect(res.body.changes).toHaveLength(1);
    expect(res.body.changes[0].deleted).toBe(true);
    expect('data' in res.body.changes[0]).toBe(false);
  });
});

describe('存的是驗證函式回傳的正規化物件', () => {
  it('__proto__ 與其他未知 key 都不會進 DB', async () => {
    // 物件字面值的 __proto__ 會變成設定原型，所以直接送原始 JSON 字串
    const raw = JSON.stringify({
      cursor: 0,
      clientNow: T0,
      changes: [
        {
          kind: 'record',
          id: 'r1',
          op: 'put',
          updatedAt: T0 - 1000,
          data: JSON.parse(
            `{"id":"r1","babyId":"${BABY}","timestamp":${T0},"hasUrine":false,"note":"ok","__proto__":{"polluted":true},"constructor":"x","surprise":1}`,
          ),
        },
      ],
    });
    const res = await h.sync(undefined, { raw });
    expect(res.body.results[0].applied).toBe(true);

    const stored = h.row('record', 'r1')!.data!;
    expect(JSON.parse(stored)).toEqual({ id: 'r1', babyId: BABY, timestamp: T0, hasUrine: false, note: 'ok' });
    expect(stored).not.toContain('__proto__');
    expect(stored).not.toContain('surprise');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('id 一律小寫（iOS 匯出的 UUID 是大寫）', async () => {
    const upper = BABY.toUpperCase();
    const res = await push([
      { kind: 'profile', id: upper.toLowerCase(), op: 'put', data: { id: upper, name: '小明', birthDate: 0 }, updatedAt: T0 - 1 },
    ]);
    expect(res.body.results[0].applied).toBe(true);
    expect(JSON.parse(h.row('profile', BABY)!.data!).id).toBe(BABY);
  });

  it('超大的 data 回報 invalid（欄位長度上限先擋住，64 KB 是第二道）', async () => {
    const big = 'x'.repeat(70_000);
    const res = await push([putRecord('r1', T0 - 1000, { note: big })]);
    expect(res.body.results[0]).toEqual({ kind: 'record', id: 'r1', applied: false, reason: 'invalid' });
  });
});

describe('結構性錯誤才回 400', () => {
  const bad: [string, unknown][] = [
    ['changes 不是陣列', { cursor: 0, changes: {}, clientNow: T0 }],
    ['沒有 changes', { cursor: 0, clientNow: T0 }],
    ['沒有 cursor', { changes: [], clientNow: T0 }],
    ['cursor 不是數字', { cursor: 'x', changes: [], clientNow: T0 }],
    ['沒有 clientNow', { cursor: 0, changes: [] }],
    ['clientNow 是 NaN', { cursor: 0, changes: [], clientNow: Number.NaN }],
    ['body 不是物件', []],
  ];
  for (const [name, body] of bad) {
    it(`${name} → 400`, async () => {
      const res = await h.sync(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTypeOf('string');
    });
  }

  it('body 不是 JSON → 400', async () => {
    const res = await h.sync(undefined, { raw: '{這不是 JSON' });
    expect(res.status).toBe(400);
  });

  it('超過 500 筆 → 400（客戶端的批次上限就是 500，不該送得出來）', async () => {
    const changes = Array.from({ length: 501 }, (_, i) => putRecord(`r${i}`, T0 - 1000));
    const res = await push(changes);
    expect(res.status).toBe(400);
  });

  it('剛好 500 筆照收', async () => {
    const changes = Array.from({ length: 500 }, (_, i) => putRecord(`r${i}`, T0 - 1000));
    const res = await push(changes);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(500);
    expect(h.rows()).toHaveLength(500);
  });
});

describe('kinds：只送客戶端認得的種類', () => {
  const putFood = (id: string, updatedAt: number) => ({
    kind: 'foodRecord',
    id,
    op: 'put',
    updatedAt,
    data: { id, babyId: BABY, timestamp: T0 - 60_000, foods: ['米湯'], firstFoods: ['米湯'], reactions: [] },
  });
  const putMark = (food: string, updatedAt: number) => ({
    kind: 'foodMark',
    id: `${BABY}|${food}`,
    op: 'put',
    updatedAt,
    data: { babyId: BABY, food, status: 'reaction' },
  });
  const ALL = ['profile', 'record', 'vaccineDose', 'foodRecord', 'foodMark'];

  it('新版客戶端可以上傳並拉回副食品資料', async () => {
    const res = await h.sync({ cursor: 0, changes: [putFood('f1', T0 - 1000), putMark('米湯', T0 - 1000)], clientNow: T0, kinds: ALL });
    expect(res.body.results.every((r: { applied: boolean }) => r.applied)).toBe(true);
    expect(res.body.changes.map((c: { kind: string }) => c.kind).sort()).toEqual(['foodMark', 'foodRecord']);
  });

  it('沒帶 kinds 的舊版客戶端收不到副食品資料，但游標照樣前進', async () => {
    await h.sync({ cursor: 0, changes: [putRecord('r1', T0 - 2000), putFood('f1', T0 - 1000)], clientNow: T0, kinds: ALL });
    const old = await push([]);
    expect(old.body.changes.map((c: { kind: string }) => c.kind)).toEqual(['record']);
    expect(old.body.cursor).toBe(2);
    // 升級後從 0 重拉就拿得到
    const upgraded = await h.sync({ cursor: 0, changes: [], clientNow: T0, kinds: ALL });
    expect(upgraded.body.changes).toHaveLength(2);
  });

  it('不認得的 kinds 項目直接忽略', async () => {
    await push([putRecord('r1', T0 - 1000)]);
    const res = await h.sync({ cursor: 0, changes: [], clientNow: T0, kinds: ['record', 'future'] });
    expect(res.body.changes).toHaveLength(1);
  });

  it('副食品食材名稱與 key 不一致 → invalid', async () => {
    const bad = { ...putMark('米湯', T0 - 1000), id: `${BABY}|香蕉` };
    const res = await h.sync({ cursor: 0, changes: [bad], clientNow: T0, kinds: ALL });
    expect(res.body.results[0]).toMatchObject({ applied: false, reason: 'invalid' });
  });

  for (const kinds of ['record', [1], null]) {
    it(`kinds 是 ${JSON.stringify(kinds)} → 400`, async () => {
      const res = await h.sync({ cursor: 0, changes: [], clientNow: T0, kinds });
      expect(res.status).toBe(400);
    });
  }
});
