/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
  base: './',
  server: { proxy: tvdbProxy },
  preview: { proxy: tvdbProxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
