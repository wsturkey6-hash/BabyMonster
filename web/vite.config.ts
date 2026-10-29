/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 開發時把 /api 轉給本機 API；沒設 VITE_DEV_API_ORIGIN 就不代理。proxy 只存在於 dev server，不影響 build。
const apiOrigin = process.env.VITE_DEV_API_ORIGIN;

export default defineConfig({
  base: '/', // Cloudflare Pages 是網域根目錄；GitHub Pages 時代是 /BabyMonster/
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'BabyMonster',
        short_name: 'BabyMonster',
        lang: 'zh-Hant',
        display: 'standalone',
        theme_color: '#fff7ed',
        background_color: '#fff7ed',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // /api/* 是 API 不是頁面。SPA 的 navigateFallback 會把導覽請求都換成 index.html，
        // 若把它套到 /api/*，同步就會收到一頁 HTML，而客戶端把非 JSON 一律當成
        // 「登入過期」，兩支手機就會掛著一個假的重新登入橫幅。
        // /login 是「重新登入」按鈕的去處：這個導覽必須真的打到網路，Access 才有機會攔下來跑登入流程；
        // 被 SW 從 precache 回 index.html 的話，請求永遠到不了 Access，使用者就永遠登不回去。
        navigateFallbackDenylist: [/^\/api\//, /^\/login$/],
        // 字型是 119 個子集檔、共 2.6 MB，全部 precache 會讓第一次安裝白等很久，
        // 而瀏覽器照 unicode-range 只會抓它真正需要的那幾個。改成用到才快取、之後長期沿用。
        globIgnores: ['**/fonts/*.woff2'],
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-fonts',
              expiration: { maxEntries: 140, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // 圖表庫獨立 chunk，非趨勢頁先不用下載。react 一定要明確切到自己的 chunk：
        // Rollup 會把手動 chunk 的依賴一起拉進去，不切的話 react 就跟著進了 recharts chunk，
        // 主程式為了 react 得在啟動時載入整個圖表庫（物件寫法 { react: ['react'] } 也不夠，
        // 只會切到 react/index.js 那個空殼，真正的 cjs 檔照樣被拉走）
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('/node_modules/recharts/')) return 'recharts';
        },
      },
    },
  },
  resolve: { alias: { shared: fileURLToPath(new URL('../shared', import.meta.url)) } },
  // web/ 有自己的 package-lock.json，Vite 會把它當 workspace 根目錄，不放行 ../shared 的話 dev 會回 403
  server: {
    fs: { allow: ['.', '../shared'] }, // 不放行整個 repo 根目錄：根目錄還有刻意不公開的內部文件
    ...(apiOrigin ? { proxy: { '/api': apiOrigin } } : {}),
  },
  test: { environment: 'node' },
});
