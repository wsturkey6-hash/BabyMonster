/** 請求本體的大小上限（2 MB）：要在 JSON.parse 之前就擋下來。 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('請求內容過大');
    this.name = 'BodyTooLargeError';
  }
}

/** 只用到 headers 與 body，測試可以直接餵一個假的（例如 Content-Length 說謊的那種）。 */
export interface ReadableRequest {
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * 讀取請求本體，超過 limit 就丟 BodyTooLargeError。
 *
 * 兩道都要：
 * 1. 先看 Content-Length，省掉一次無謂的傳輸
 * 2. 再邊讀邊累加，超過就立刻 cancel。Content-Length 可以說謊（或根本不帶，chunked），
 *    只看 header 的話 50 MB 照樣會進到記憶體裡；這台機器只有 8 GB，還跑著 Audiobookshelf。
 */
export async function readCappedText(req: ReadableRequest, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > limit) throw new BodyTooLargeError();
  }
  if (req.body === null) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // 超過就不再留著任何東西，已讀的 chunk 交給 GC
      if (total > limit) {
        chunks.length = 0;
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (err) {
    void reader.cancel().catch(() => {});
    throw err;
  }
  return Buffer.concat(chunks).toString('utf8');
}
