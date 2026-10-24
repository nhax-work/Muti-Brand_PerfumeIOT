import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Biến VITE_* (trang khiếu nại, serial máy, kênh hỗ trợ) khai ở `.env` gốc theo `.env.example`.
  // Vite chỉ đưa biến có tiền tố VITE_ vào bundle — bí mật của backend trong cùng file không lộ.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5174,
    // Dev gọi API cùng origin rồi proxy sang backend, nên backend không cần bật CORS cho localhost.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
