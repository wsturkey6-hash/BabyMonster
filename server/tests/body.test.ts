import { beforeEach, describe, expect, it } from 'vitest';
import { BodyTooLargeError, MAX_BODY_BYTES, readCappedText } from '../src/body';
import { harness, silenceLogs, type Harness } from './harness';

let h: Harness;
beforeEach(() => {
  silenceLogs();
  h = harness();
});

const CHUNK = 64 * 1024;

/** 邊讀邊產生的串流，記錄實際被拉走幾塊，用來證明我們沒把整個 body 讀進記憶體。 */
function stream(totalBytes: number, counter: { pulled: number }): ReadableStream<Uint8Array> {
  let sent = 0;
  const chunk = new Uint8Array(CHUNK).fill(0x78); // 'x'
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      counter.pulled++;
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
}

describe('2 MB 上限在 parse 之前就擋下來', () => {
  it('Content-Length 說得過大 → 413，連 body 都不讀', async () => {
    const counter = { pulled: 0 };
    const req = {
      headers: new Headers({ 'content-length': String(50 * 1024 * 1024) }),
      body: stream(50 * 1024 * 1024, counter),
    };
    await expect(readCappedText(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    // 1 塊是 ReadableStream 自己為了填佇列預先拉的，我們一塊都沒讀
    expect(counter.pulled).toBeLessThanOrEqual(1);
  });

  it('Content-Length 說謊（說 10 bytes、實際 50 MB）→ 還是 413，而且只讀到剛過上限就停', async () => {
    const counter = { pulled: 0 };
    const req = {
      headers: new Headers({ 'content-length': '10' }),
      body: stream(50 * 1024 * 1024, counter),
    };
    await expect(readCappedText(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    // 2 MB / 64 KB = 32 塊，加上讓它超過上限的那一塊
    expect(counter.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / CHUNK + 1);
  });

  it('完全不帶 Content-Length（chunked）的 50 MB → 413，記憶體不會爆', async () => {
    const counter = { pulled: 0 };
    const req = { headers: new Headers(), body: stream(50 * 1024 * 1024, counter) };
    await expect(readCappedText(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(counter.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / CHUNK + 1);
  });

  it('Content-Length 不是數字 → 413', async () => {
    const req = { headers: new Headers({ 'content-length': 'abc' }), body: null };
    await expect(readCappedText(req)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('剛好 2 MB 讀得進來', async () => {
    const counter = { pulled: 0 };
    const req = { headers: new Headers(), body: stream(MAX_BODY_BYTES, counter) };
    const text = await readCappedText(req);
    expect(text).toHaveLength(MAX_BODY_BYTES);
  });

  it('走完整個 HTTP 路徑：過大的 body 回 413 JSON，而且沒有被 parse', async () => {
    const counter = { pulled: 0 };
    const res = await h.request('/api/sync', {
      method: 'POST',
      // @ts-expect-error duplex 是 Node 的 Request 才有的欄位
      duplex: 'half',
      headers: { 'content-type': 'application/json' },
      body: stream(50 * 1024 * 1024, counter),
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: '請求內容過大' });
    expect(counter.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / CHUNK + 1);
    expect(h.rows()).toHaveLength(0);
  });
});
