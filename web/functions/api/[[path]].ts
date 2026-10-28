/**
 * 家裡伺服器與公開網路之間唯一的一道門（Cloudflare Pages Function）。
 *
 * 責任只有兩件：
 * 1. 用「驗證過的」Cloudflare Access JWT 認出是哪位家長；
 * 2. 只把白名單上的 (method, path) 帶著瀏覽器永遠看不到的 service 憑證轉給家裡的 API。
 *
 * 所有失敗路徑都回 JSON（見下面 jsonResponse 的註解），而且一律 Cache-Control: no-store。
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { RemoteJWKSet } from 'jose';

/** Access 只用 RS256 簽；明確列出來，才不會有人塞 none 或對稱演算法進來。 */
const ALLOWED_ALGS = ['RS256'] as const;

/** 抓 JWKS 的逾時：抓不到就是驗不過，驗不過就是 401（絕不放行）。 */
const JWKS_TIMEOUT_MS = 5_000;

/** 轉給家裡伺服器的逾時。超過就回 504，不是 502：家裡只是慢/斷線，不是請求有問題。 */
const UPSTREAM_TIMEOUT_MS = 20_000;

/** 與伺服器同一個上限（server/src/body.ts 的 MAX_BODY_BYTES）。 */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * (method, path) 白名單。`[[path]]` 是 catch-all，所以上游網址只能從這張固定的表拿，
 * 絕對不可以用 API_ORIGIN 去接進來的 pathname / search——那等於把整個家裡 API 代理出去。
 */
const ROUTES: readonly { method: string; path: string; upstreamPath: string }[] = [
  { method: 'POST', path: '/api/sync', upstreamPath: '/api/sync' },
  { method: 'GET', path: '/api/health', upstreamPath: '/api/health' },
];

/**
 * 這六個名稱必須和 Pages 專案後台填的變數名**完全一致**，而且**只設 Production、
 * Preview 一個都不設**：Preview 若也有 secret，每一個預覽部署都是一道沒上鎖的後門。
 * 六個裡任何一個沒設，整支程式一律回 401（fail closed），不會退而求其次往上游送。
 * 所以在後台填完之前，部署上去的每個請求都會是 401——那是正常的。
 */
export interface Env {
  /** Access team domain（本身就是基礎設施主機名，只能從環境變數來，不進 repo）。 */
  ACCESS_TEAM_DOMAIN?: string;
  /** 保護 Pages 這個主機名的那個 Access application 的 AUD tag。 */
  ACCESS_AUD?: string;
  /** 家裡 API 的 origin（Cloudflare Tunnel 的那個主機名）。 */
  API_ORIGIN?: string;
  /** Access Service Auth 的 service token。瀏覽器永遠看不到這兩個值。 */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  /** 伺服器自己那道 X-Proxy-Secret。 */
  PROXY_SECRET?: string;
}

/**
 * 客戶端（web/src/sync/sync.ts）只要看到 content-type 不是 application/json，
 * 就判定「Access session 過期」並叫使用者重新登入。所以這支程式**任何**一個回應都必須是 JSON：
 * 家裡伺服器只是掛了的時候回一頁 HTML 錯誤頁，就會叫兩位家長去重新登入。
 */
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * 所有驗證失敗都回同一個 401、同一句話：不說是沒帶、簽章錯、aud 錯還是過期，
 * body 裡也不放 Email 或 token 的任何內容。
 */
function unauthorized(): Response {
  return jsonResponse(401, { error: '未授權' });
}

/**
 * 每個 team domain 一個 JWKS resolver，模組層快取：Pages Function 的 isolate 會重用，
 * 不必每個請求都去抓一次 certs。jose 自己管快取、cooldown 與 kid 挑選。
 */
const jwksCache = new Map<string, RemoteJWKSet>();

function jwksFor(teamDomain: string): RemoteJWKSet {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/**
 * 認人。唯一可接受的身分來源是**驗證過的** Cf-Access-Jwt-Assertion。
 *
 * 絕對不讀 Cf-Access-Authenticated-User-Email：那是一個純文字 header，
 * 在任何 Access 沒有覆蓋到的主機名上，一行 curl 就能偽造。這裡沒有 fallback，
 * 也沒有「JWT 不在但 Email header 在」這種分支——不要加。
 *
 * 為什麼 aud 的綁定是最吃重的一行，以及它**不該**綁到哪個值：
 * 到得了這支程式的 JWT，是由保護 **Pages 主機名**的那個 Access application 簽的。
 * 它不是「BabyMonster API」那個 Service Auth application 簽的——Service Auth 從來不發
 * 瀏覽器 token，綁到它的 AUD 會把每一個正常請求都擋掉。
 * 這個綁定要排除的是「同一個 Access team 裡**別的** application 簽出來的 token」：
 * 家裡還有一台 Audiobookshelf 也擺在 Access 後面，沒有這個綁定的話，
 * 一個發給 Audiobookshelf 的 token 就能一路通到寶寶的健康紀錄。
 * 下一個人會很想重用現成那個 application 的 AUD——不要。
 *
 * 回傳驗證過的 Email，驗不過回 null（呼叫端一律 401）。
 */
async function verifiedEmail(request: Request, env: Env): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  // 沒設就 fail closed：真正的值要等之後才填進 Pages 的設定，在那之前每個請求都 401 是對的。
  if (!teamDomain || !aud) return null;

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwksFor(teamDomain), {
      algorithms: [...ALLOWED_ALGS],
      issuer: `https://${teamDomain}`,
      audience: aud,
    }));
  } catch {
    // 簽章錯、iss 錯、aud 錯、過期、時鐘偏移、JWKS 抓不到或逾時、header 是垃圾——全都是這裡。
    return null;
  }

  // 身分只能來自驗證過的 email claim。
  const email = payload.email;
  if (typeof email !== 'string') return null;
  // 這個值會被放進 header（再進 DB 與 log）。控制字元會被用來偽造 header/log 行，形狀不對就不放行。
  if (email.length === 0 || email.length > 254) return null;
  if (!/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+$/.test(email)) return null;
  return email;
}

/**
 * 讀取 body，超過上限就丟 BodyTooLarge。
 * 先看 Content-Length 省一趟傳輸，再邊讀邊累加：Content-Length 可以說謊也可以不帶（chunked），
 * 只看 header 的話超大的 body 照樣會整個進到記憶體。
 */
class BodyTooLarge extends Error {}

async function readCappedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > limit) throw new BodyTooLarge();
  }
  if (request.body === null) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        chunks.length = 0;
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } catch (err) {
    void reader.cancel().catch(() => {});
    throw err;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  // 先認人：Access 沒覆蓋到的情況下，連「這個路徑存不存在」都不該回答。
  const email = await verifiedEmail(request, env);
  if (!email) return unauthorized();

  const url = new URL(request.url);
  const byPath = ROUTES.filter((r) => r.path === url.pathname);
  if (byPath.length === 0) return jsonResponse(404, { error: '找不到這個路徑' });
  const route = byPath.find((r) => r.method === request.method);
  if (!route) return jsonResponse(405, { error: '不支援這個方法' });

  // 其餘的設定值也一樣 fail closed：少了任何一個就不可能通過上游的 Access 與 X-Proxy-Secret，
  // 與其送出去換一頁 HTML 錯誤頁（客戶端會解讀成「要重新登入」），不如在這裡就擋掉。
  const { API_ORIGIN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, PROXY_SECRET } = env;
  if (!API_ORIGIN || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET || !PROXY_SECRET) return unauthorized();

  let body: Uint8Array | null = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await readCappedBody(request, MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof BodyTooLarge) return jsonResponse(413, { error: '請求內容過大' });
      return jsonResponse(502, { error: '無法讀取請求內容' });
    }
  }

  // 全新的 Headers，只放這五個名字。絕對不是「複製客戶端的 header 再蓋掉幾個」：
  // 那會把 Cookie（含 CF_Authorization）、客戶端自己的 Cf-Access-Jwt-Assertion、
  // Authorization 和每一個 X-* 都轉進家裡的伺服器。白名單，不是黑名單。
  const headers = new Headers();
  if (body !== null) headers.set('content-type', 'application/json');
  headers.set('cf-access-client-id', CF_ACCESS_CLIENT_ID);
  headers.set('cf-access-client-secret', CF_ACCESS_CLIENT_SECRET);
  headers.set('x-proxy-secret', PROXY_SECRET);
  // X-Family-User 只是署名：伺服器把它寫進 updated_by、也寫進 log，
  // 但**絕對不可以**拿來做授權判斷（上游不會有任何 if (user === ...) 的分支）。
  // 真正的授權是前面兩道 Access 加上 X-Proxy-Secret。
  headers.set('x-family-user', email);

  let upstream: Response;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  try {
    upstream = await fetch(new URL(route.upstreamPath, API_ORIGIN).toString(), {
      method: route.method,
      headers,
      ...(body !== null ? { body } : {}),
      signal: controller.signal,
    });
  } catch {
    return timedOut
      ? jsonResponse(504, { error: '家裡的伺服器沒有回應' })
      : jsonResponse(502, { error: '連不到家裡的伺服器' });
  } finally {
    clearTimeout(timer);
  }

  // 上游 5xx 當成「家裡壞了」，一律換成我們自己的 JSON 502：原本的 body 可能不是 JSON。
  if (upstream.status >= 500) return jsonResponse(502, { error: '家裡的伺服器出了問題' });
  // service token 設錯時，Access 會回一頁 HTML 轉址頁。原封不動轉回去的話，
  // 客戶端會把它當成 session 過期而叫兩位家長重新登入——所以不是 JSON 就換成 502。
  if (!upstream.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse(502, { error: '家裡的伺服器回了非預期的內容' });
  }

  let text: string;
  try {
    text = await upstream.text();
  } catch {
    return jsonResponse(502, { error: '家裡的伺服器回應中斷' });
  }
  // 204／205／304 不准帶 body，拿它們當 status 去建 Response 會丟 TypeError，
  // 而這裡是整支函式唯一不在 try 裡的地方：例外會逃出去變成 Pages 自己的 HTML 錯誤頁，
  // 客戶端再把非 JSON 當成 session 過期，兩位家長就會看到一個重新登入也消不掉的橫幅。
  // 今天的伺服器不會回這三種狀態碼，純粹是不讓「唯一會說謊的失敗」留在程式裡。
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return jsonResponse(502, { error: '家裡的伺服器回了非預期的內容' });
  }
  // 同樣地，回應的 header 也是重新組的，不是把上游的抄回來。
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleRequest(context.request, context.env);
