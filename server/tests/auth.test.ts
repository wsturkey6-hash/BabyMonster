import { beforeEach, describe, expect, it, vi } from 'vitest';
import { familyUser, proxySecretOk } from '../src/auth';
import { SECRET, T0, harness, silenceLogs, type Harness } from './harness';

let h: Harness;
beforeEach(() => {
  silenceLogs();
  h = harness();
});

const body = { cursor: 0, changes: [], clientNow: T0 };

describe('X-Proxy-Secret', () => {
  it('對的 secret 兩個 endpoint 都通', async () => {
    expect((await h.request('/api/health')).status).toBe(200);
    expect(await (await h.request('/api/health')).json()).toEqual({ ok: true });
    expect((await h.sync(body)).status).toBe(200);
  });

  // timingSafeEqual 長度不同會丟例外，所以兩邊都先 sha256 成固定長度；否則這一條會變成 500 + stack trace
  it('長度不對的 secret 回 401，不是 500，也不吐 stack trace', async () => {
    for (const wrong of ['', 'x', `${SECRET}x`, SECRET.slice(0, 5)]) {
      const res = await h.request('/api/health', { secret: wrong });
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(JSON.parse(text)).toEqual({ error: '未授權' });
      expect(text).not.toContain('at ');
      expect(text).not.toContain(SECRET);
    }
  });

  it('長度一樣但值不對的 secret 也回 401', async () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);
    expect((await h.request('/api/health', { secret: wrong })).status).toBe(401);
    expect((await h.sync(body, { secret: wrong })).status).toBe(401);
  });

  it('沒帶 header 回 401', async () => {
    expect((await h.request('/api/health', { secret: null })).status).toBe(401);
    expect((await h.sync(body, { secret: null })).status).toBe(401);
  });

  it('401 的時候什麼都還沒寫進 DB', async () => {
    await h.sync({ cursor: 0, changes: [{ kind: 'record', id: 'r1', op: 'delete', updatedAt: T0 }], clientNow: T0 }, { secret: 'nope' });
    expect(h.rows()).toHaveLength(0);
  });

  it('401 的 log 不含 secret、也不含任何 header', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await h.request('/api/health', { secret: 'wrong-but-long-enough-secret' });
    const printed = log.mock.calls.flat().join('\n');
    expect(printed).toContain('"status":401');
    expect(printed).not.toContain('wrong-but-long-enough-secret');
    expect(printed).not.toContain(SECRET);
    expect(printed.toLowerCase()).not.toContain('x-proxy-secret');
  });

  it('proxySecretOk 不會丟例外，且 expected 為空字串時恆為 false', () => {
    expect(() => proxySecretOk(undefined, SECRET)).not.toThrow();
    expect(proxySecretOk('a'.repeat(10_000), SECRET)).toBe(false);
    expect(proxySecretOk('', '')).toBe(false);
    expect(proxySecretOk('anything', '')).toBe(false);
    expect(proxySecretOk(SECRET, SECRET)).toBe(true);
  });
});

describe('X-Family-User 只是署名，而且要先驗形狀', () => {
  it('像 Email 的留著', () => {
    expect(familyUser('parent@example.com')).toBe('parent@example.com');
    expect(familyUser('a.b+c@sub.example.co.uk')).toBe('a.b+c@sub.example.co.uk');
  });

  it('含換行、空白、控制字元或根本不是 Email 的一律 null（log 偽造）', () => {
    const bad = [
      undefined,
      '',
      'not-an-email',
      'a@b',
      'a@@b.com',
      'parent@example.com\n{"ev":"sync","user":"admin"}',
      'parent@example.com\r\nX',
      'parent @example.com',
      'parent@exam ple.com',
      '<script>@example.com',
      `${'a'.repeat(300)}@example.com`,
    ];
    for (const v of bad) expect(familyUser(v)).toBeNull();
  });
});

describe('路徑', () => {
  it('不存在的路徑回 JSON 404（客戶端看到非 JSON 會以為要重新登入）', async () => {
    const res = await h.request('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
