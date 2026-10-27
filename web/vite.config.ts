/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 開發時把 /api 轉給本機 API；沒設 VITE_DEV_API_ORIGIN 就不代理。proxy 只存在於 dev server，不影響 build。
const apiOrigin = process.env.VITE_DEV_API_ORIGIN;

export default defineConfig({
  base: '/BabyMonster/',
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
        // Google Fonts 離線快取：CSS 用 SWR、字型檔長期 CacheFirst
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
        manualChunks: { recharts: ['recharts'] }, // 圖表庫獨立 chunk，非趨勢頁先不用下載
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
