/**
 * 結構化 log，一列一行 JSON 到 stdout。
 *
 * 刻意只有這幾個欄位：時間、使用者、推送／寫入／略過／拉取筆數、耗時。
 * **不可以**寫進 log 的東西：request header（裡面有 X-Proxy-Secret）、secret 或任何由它算出來的值
 * （包含 401 那條路徑）、以及紀錄內容本身（data、note、寶寶名字）。這是家人的健康紀錄，
 * log 會留在伺服器上、也會進 docker logs。
 */
export interface SyncLog {
  user: string | null;
  pushed: number;
  applied: number;
  skipped: number;
  pulled: number;
  more: boolean;
  ms: number;
}

export function logSync(l: SyncLog): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ev: 'sync', ...l }));
}

/** 被拒絕的請求：只記狀態碼與原因代號，不記 header、不記本體。 */
export function logRejected(status: number, code: string): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ev: 'rejected', status, code }));
}

/**
 * 沒預期到的例外。只記 name：這些路徑不會碰到 secret（比對函式不丟例外），
 * 但訊息可能帶著紀錄的 id 或內容，所以連 message 都不寫。
 */
export function logCrash(where: string, err: unknown): void {
  const name = err instanceof Error ? err.name : typeof err;
  console.error(JSON.stringify({ t: new Date().toISOString(), ev: 'error', where, name }));
}
