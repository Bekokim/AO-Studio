import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Именно localhost, а не 127.0.0.1: в режиме разработки бэкенд перенаправляет 127.0.0.1
// на localhost (ради Google Sign-In), и POST через прокси терял бы тело на редиректе
const BACKEND = 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    // Хуки трогают document и window, поэтому по умолчанию — браузерное окружение
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND,
      '/media': BACKEND,
      // Админка Django и её статика. Host не меняем — иначе CSRF при входе в админку не пройдёт
      '^/admin(/|$)': { target: BACKEND, changeOrigin: false },
      '/static': { target: BACKEND, changeOrigin: false },
    },
  },
})
