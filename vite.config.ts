/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dev/preview proxy so the app also works in environments where direct
// browser calls to TheTVDB are blocked. The API client tries the direct
// URL first and falls back to this path automatically.
const tvdbProxy = {
  '/tvdb': {
    target: 'https://api4.thetvdb.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/tvdb/, '/v4'),
  },
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PanimuTV',
        short_name: 'PanimuTV',
        description:
          'Personal TV show tracker powered by TheTVDB. Data stays in your browser.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell so the app opens (with cached data) offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Posters/fanart: cache-first, they're immutable by URL.
            urlPattern: /^https:\/\/artworks\.thetvdb\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tvdb-artwork',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  server: { proxy: tvdbProxy },
  preview: { proxy: tvdbProxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
