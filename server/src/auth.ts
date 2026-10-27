import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 比對 X-Proxy-Secret。
 *
 * 兩邊都先 sha256 成固定的 32 bytes 再比，因為 timingSafeEqual 長度不同會「丟例外」而不是回 false：
 * 直接拿原字串比，一個長度不對的 secret 就會變成 500 加一份 stack trace（還會暗示正確長度）。
 * 雜湊之後長度恆等，所有失敗路徑都安安靜靜地回 false，再由呼叫端一律回 401。
 *
 * 這個函式不會丟例外，也不會把 secret 或其雜湊回傳或記錄到任何地方。
 */
export function proxySecretOk(provided: string | undefined, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  if (expected.length === 0) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

// RFC 5321 的上限；再長的一律當不合法
const MAX_EMAIL = 254;
// 刻意保守：只收得下常見的 Email。重點是擋掉空白、控制字元與換行（log 偽造），不是完整支援 RFC 5322
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * X-Family-User（Cloudflare Access 認證過的登入者 Email）。
 *
 * 這個值**只是署名**（entities.updated_by、log 的 user 欄位），**絕對不可以拿來做授權判斷**。
 * 真正的授權在前面兩道 Cloudflare Access（Pages 只放行爸爸媽媽的 Email、API 只放行 service token）
 * 加上這支程式的 X-Proxy-Secret。header 本身是可以偽造的，所以程式裡不能有任何
 * 「if (user === ...)」之類的分支。
 *
 * 形狀對不上就回 null：這個值會進 DB、也會進 log，換行或控制字元會被用來偽造 log 行。
 */
export function familyUser(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_EMAIL) return null;
  if (!EMAIL.test(raw)) return null;
  return raw;
}
