import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 「重新登入」能不能真的登回去，靠的是兩處設定互相配合，而兩處都沒有其他測試會碰到：
// 按鈕導向 /login，而 /login 必須排除在 SW 的 navigateFallback 之外。少了任何一邊，
// 安裝在主畫面的 App 會被 SW 從 precache 回應、請求到不了 Access，家長就永遠登不回去。
// 這裡只能比對原始碼文字，但這兩行被誤刪時 CI 會紅，比沒有好。
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('重新登入的導覽會打到網路', () => {
  it('/login 與 /api/ 都排除在 navigateFallback 之外', () => {
    const line = read('../vite.config.ts')
      .split('\n')
      .find((l) => l.includes('navigateFallbackDenylist:'));
    expect(line).toBeDefined();
    expect(line).toContain(String.raw`/^\/login$/`);
    expect(line).toContain(String.raw`/^\/api\//`);
  });

  it('按鈕導向 /login，不是 reload', () => {
    const app = read('../src/ui/App.tsx');
    expect(app).toContain("onClick={() => location.assign('/login')}");
    expect(app).not.toContain('onClick={() => location.reload()}');
  });
});
