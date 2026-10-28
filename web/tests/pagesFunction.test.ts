import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { handleRequest, type Env } from '../functions/api/[[path]]';

// 全部都是假值：真正的 team domain 與 AUD 只從 Pages 的環境變數來，不進 repo。
const AUD = 'aud-for-the-pages-app';
const OTHER_AUD = 'aud-for-the-audiobook-app';
const API_ORIGIN = 'https://home.example.invalid';
const KID = 'test-kid';
/** 在 vi.useFakeTimers() 之前抓住真的 setTimeout，假時鐘的測試還要靠它等真正的非同步運算。 */
const realSetTimeout = globalThis.setTimeout;

type Pair = { publicKey: CryptoKey; privateKey: CryptoKey };
let good: Pair;
let attacker: Pair;
let goodJwk: JWK;

// jose 的 JWKS resolver 是以 URL 為單位快取的，所以每個測試用自己的 team domain，
// 免得前一個測試的金鑰被後一個測試拿去用。
let domainSeq = 0;
let teamDomain: string;

interface UpstreamCall {
  url: string;
  method: string;
  headerNames: string[];
  headers: Record<string, string>;
  body: string;
}
let calls: UpstreamCall[];
let upstream: (url: string, init: RequestInit) => Promise<Response>;

function jsonUpstream(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(async () => {
  if (!good) {
    good = (await generateKeyPair('RS256', { extractable: true })) as Pair;
    attacker = (await generateKeyPair('RS256', { extractable: true })) as Pair;
    goodJwk = await exportJWK(good.publicKey);
  }
  teamDomain = `team-${++domainSeq}.example.invalid`;
  calls = [];
  upstream = jsonUpstream(200, { ok: true });

  vi.stubGlobal('fetch', async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes('/cdn-cgi/access/certs')) {
      return new Response(JSON.stringify({ keys: [{ ...goodJwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: String(init.method),
      headerNames: [...headers.keys()].sort(),
      headers: Object.fromEntries(headers.entries()),
      body: init.body ? new TextDecoder().decode(init.body as Uint8Array) : '',
    });
    return upstream(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function env(over: Partial<Env> = {}): Env {
  return {
    ACCESS_TEAM_DOMAIN: teamDomain,
    ACCESS_AUD: AUD,
    API_ORIGIN,
    CF_ACCESS_CLIENT_ID: 'client-id',
    CF_ACCESS_CLIENT_SECRET: 'client-secret',
    PROXY_SECRET: 'proxy-secret',
    ...over,
  };
}

async function token(
  over: { aud?: string; iss?: string; email?: string; exp?: string | number; key?: CryptoKey } = {},
) {
  return new SignJWT({ email: over.email ?? 'mum@example.invalid' })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(over.iss ?? `https://${teamDomain}`)
    .setAudience(over.aud ?? AUD)
    .setExpirationTime(over.exp ?? '1h')
    .sign(over.key ?? good.privateKey);
}

function syncRequest(headers: Record<string, string>, body = '{"cursor":0,"changes":[],"clientNow":1}') {
  return new Request('https://pages.example.invalid/api/sync', { method: 'POST', headers, body });
}

async function callSync(headers: Record<string, string>, e = env()) {
  return handleRequest(syncRequest(headers), e);
}

describe('轉送', () => {
  it('帶著正確 aud 的 token 會被轉給上游，而且只帶那五個 header', async () => {
    const res = await callSync({
      'cf-access-jwt-assertion': await token(),
      cookie: 'CF_Authorization=secret-session',
      authorization: 'Bearer something',
      'x-debug': 'please-forward-me',
      'content-type': 'application/json',
    });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_ORIGIN}/api/sync`);
    expect(calls[0].headerNames).toEqual([
      'cf-access-client-id',
      'cf-access-client-secret',
      'content-type',
      'x-family-user',
      'x-proxy-secret',
    ]);
    expect(calls[0].headers['x-family-user']).toBe('mum@example.invalid');
    expect(calls[0].headers['cf-access-client-id']).toBe('client-id');
    expect(calls[0].headers['cf-access-client-secret']).toBe('client-secret');
    expect(calls[0].headers['x-proxy-secret']).toBe('proxy-secret');
    for (const gone of ['cookie', 'cf-access-jwt-assertion', 'authorization', 'x-debug']) {
      expect(calls[0].headers[gone]).toBeUndefined();
    }
    expect(calls[0].body).toBe('{"cursor":0,"changes":[],"clientNow":1}');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /api/health 也在白名單上', async () => {
    const res = await handleRequest(
      new Request(`https://pages.example.invalid/api/health`, {
        headers: { 'cf-access-jwt-assertion': await token() },
      }),
      env(),
    );
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe(`${API_ORIGIN}/api/health`);
    expect(calls[0].method).toBe('GET');
  });

  it('上游回的 4xx JSON 原樣帶回狀態碼', async () => {
    upstream = jsonUpstream(400, { error: 'bad' });
    const res = await callSync({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad' });
  });
});

describe('身分驗證', () => {
  it('aud 是別的 application（Audiobookshelf）→ 401', async () => {
    const res = await callSync({ 'cf-access-jwt-assertion': await token({ aud: OTHER_AUD }) });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('iss 不對 → 401', async () => {
    const res = await callSync({
      'cf-access-jwt-assertion': await token({ iss: 'https://evil.example.invalid' }),
    });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('已過期 → 401', async () => {
    const res = await callSync({ 'cf-access-jwt-assertion': await token({ exp: '-1h' }) });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('簽章對不上 JWKS（同一個 kid，別的金鑰）→ 401', async () => {
    const res = await callSync({ 'cf-access-jwt-assertion': await token({ key: attacker.privateKey }) });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('alg: none → 401', async () => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unsecured = `${b64({ alg: 'none', kid: KID })}.${b64({
      email: 'mum@example.invalid',
      iss: `https://${teamDomain}`,
      aud: AUD,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
    const res = await callSync({ 'cf-access-jwt-assertion': unsecured });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('沒有 Cf-Access-Jwt-Assertion → 401', async () => {
    const res = await callSync({});
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('header 是垃圾 → 401', async () => {
    const res = await callSync({ 'cf-access-jwt-assertion': 'not-a-jwt' });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('401 的 body 不含 Email 也不含 token 內容', async () => {
    const t = await token();
    const res = await callSync({ 'cf-access-jwt-assertion': await token({ aud: OTHER_AUD }) });
    const text = await res.text();
    expect(text).not.toContain('mum@example.invalid');
    expect(text).not.toContain(t.slice(0, 20));
  });

  it('偽造 Cf-Access-Authenticated-User-Email 而沒有 JWT → 401', async () => {
    const res = await callSync({ 'cf-access-authenticated-user-email': 'dad@example.invalid' });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('偽造的 Email header 不會影響 X-Family-User', async () => {
    const res = await callSync({
      'cf-access-jwt-assertion': await token({ email: 'mum@example.invalid' }),
      'cf-access-authenticated-user-email': 'attacker@example.invalid',
    });
    expect(res.status).toBe(200);
    expect(calls[0].headers['x-family-user']).toBe('mum@example.invalid');
  });

  it('email claim 不是字串 → 401', async () => {
    const t = await new SignJWT({ email: 42 })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt()
      .setIssuer(`https://${teamDomain}`)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(good.privateKey);
    const res = await callSync({ 'cf-access-jwt-assertion': t });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('JWKS 抓不到 → 401', async () => {
    vi.stubGlobal('fetch', async (input: unknown) => {
      if (String(input).includes('/cdn-cgi/access/certs')) throw new Error('network down');
      calls.push({ url: String(input), method: 'POST', headerNames: [], headers: {}, body: '' });
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    });
    const res = await handleRequest(
      syncRequest({ 'cf-access-jwt-assertion': await token() }),
      env(),
    );
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe('環境變數沒設就 fail closed', () => {
  for (const key of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'API_ORIGIN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET', 'PROXY_SECRET'] as const) {
    it(`${key} 沒設 → 401，而且完全沒碰上游`, async () => {
      const t = await token();
      for (const empty of [undefined, '']) {
        calls = [];
        const res = await callSync({ 'cf-access-jwt-assertion': t }, env({ [key]: empty }));
        expect(res.status).toBe(401);
        expect(calls).toHaveLength(0);
      }
    });
  }
});

describe('白名單', () => {
  it('路徑不在白名單上 → 404，沒碰上游', async () => {
    const res = await handleRequest(
      new Request('https://pages.example.invalid/api/entities', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': await token() },
        body: '{}',
      }),
      env(),
    );
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('方法不對 → 405，沒碰上游', async () => {
    const t = await token();
    const get = await handleRequest(
      new Request('https://pages.example.invalid/api/sync', { headers: { 'cf-access-jwt-assertion': t } }),
      env(),
    );
    expect(get.status).toBe(405);
    const post = await handleRequest(
      new Request('https://pages.example.invalid/api/health', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': t },
        body: '{}',
      }),
      env(),
    );
    expect(post.status).toBe(405);
    expect(calls).toHaveLength(0);
  });
});

describe('body 上限', () => {
  it('2.1 MB → 413，沒碰上游', async () => {
    const big = 'a'.repeat(2.1 * 1024 * 1024);
    const res = await callSync({ 'cf-access-jwt-assertion': await token() }, env());
    expect(res.status).toBe(200); // 先確認小 body 是通的
    calls = [];
    const res2 = await handleRequest(
      syncRequest({ 'cf-access-jwt-assertion': await token() }, big),
      env(),
    );
    expect(res2.status).toBe(413);
    expect(await res2.json()).toEqual({ error: '請求內容過大' });
    expect(calls).toHaveLength(0);
  });

  it('Content-Length 說謊（超過上限）也擋得住', async () => {
    const res = await handleRequest(
      new Request('https://pages.example.invalid/api/sync', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': await token(), 'content-length': '99999999' },
        body: '{}',
      }),
      env(),
    );
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});

describe('上游故障一律回 JSON', () => {
  it('上游 500 → JSON 502', async () => {
    upstream = jsonUpstream(500, { error: 'boom' });
    const res = await callSync({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });

  it('上游直接丟錯 → JSON 502', async () => {
    upstream = async () => {
      throw new Error('ECONNREFUSED');
    };
    const res = await callSync({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(502);
    expect(await res.json()).toHaveProperty('error');
  });

  // 204／205／304 不准帶 body，拿它們去 new Response 會丟 TypeError。那個例外會逃出整支函式，
  // 變成 Pages 自己的 HTML 錯誤頁，客戶端再把非 JSON 當成 session 過期——兩位家長就會看到
  // 一個重新登入也消不掉的橫幅。今天的伺服器不會回這三種狀態碼，這是擋住「會說謊的失敗」。
  it.each([204, 205, 304])('上游回 %i（不准帶 body 的狀態碼）→ JSON 502，不會丟例外', async (status) => {
    upstream = async () => new Response(null, { status, headers: { 'content-type': 'application/json' } });
    const res = await callSync({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toHaveProperty('error');
  });

  it('上游回 HTML（service token 設錯）→ JSON 502，不是把 HTML 轉回去', async () => {
    upstream = async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } });
    const res = await callSync({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });

  it('上游逾時 → JSON 504', async () => {
    // 先打一次正常請求，讓 jose 把 JWKS 快取起來：接下來用假時鐘時就不會有別的 timer 在跑
    expect((await callSync({ 'cf-access-jwt-assertion': await token() })).status).toBe(200);
    const t = await token();
    calls = [];

    upstream = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });

    vi.useFakeTimers();
    const pending = handleRequest(syncRequest({ 'cf-access-jwt-assertion': t }), env());
    // 等到請求真的送到上游才撥時鐘：驗簽是真正的非同步運算（不是 timer），
    // 在它完成之前 handler 還沒排下逾時的 timer，先撥時鐘就永遠不會觸發。
    for (let i = 0; calls.length === 0 && i < 1000; i++) await new Promise((r) => realSetTimeout(r, 0));
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('每一個回應都是 no-store 的 JSON', () => {
  it('所有狀態碼都帶 Cache-Control: no-store 與 JSON content-type', async () => {
    const t = await token();
    const cases: Response[] = [
      await callSync({ 'cf-access-jwt-assertion': t }), // 200
      await callSync({}), // 401
      await handleRequest(
        new Request('https://pages.example.invalid/api/nope', {
          method: 'POST',
          headers: { 'cf-access-jwt-assertion': t },
          body: '{}',
        }),
        env(),
      ), // 404
      await handleRequest(
        new Request('https://pages.example.invalid/api/sync', { headers: { 'cf-access-jwt-assertion': t } }),
        env(),
      ), // 405
      await handleRequest(
        syncRequest({ 'cf-access-jwt-assertion': t }, 'a'.repeat(2.1 * 1024 * 1024)),
        env(),
      ), // 413
    ];
    upstream = jsonUpstream(500, { error: 'boom' });
    cases.push(await callSync({ 'cf-access-jwt-assertion': t })); // 502

    expect(cases.map((r) => r.status)).toEqual([200, 401, 404, 405, 413, 502]);
    for (const res of cases) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-type')).toContain('application/json');
      await expect(res.json()).resolves.toBeTypeOf('object');
    }
  });
});
