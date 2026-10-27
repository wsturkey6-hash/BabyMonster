import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * tests/integration.test.ts 直接 import 真正的客戶端模組（web/src/sync/sync.ts）。
 * 那支程式裡的 `import 'dexie'` 是從 web/ 的角度解析的，而 CI 只在 server/ 跑 npm ci，
 * web/node_modules 不存在，所以把 dexie 指到 server 自己裝的那一份。
 */
export default defineConfig({
  resolve: {
    alias: { dexie: fileURLToPath(new URL('node_modules/dexie', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // 伺服器每個請求都印一行 JSON（pushed／pulled／skipped／ms），端到端測試也印一行總計。
    // 預設 reporter 會把 console 吃掉，這裡放行，`npm test` 一個指令就看得到那些數字。
    disableConsoleIntercept: true,
  },
});
