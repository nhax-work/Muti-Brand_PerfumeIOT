import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Dev gọi API cùng origin rồi proxy sang backend, nên backend không cần bật CORS cho localhost.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    // Test form antd (modal + validate + select) tốn CPU: ~1 giây khi chạy riêng, ~3 giây trong cả
    // suite, và quá 10 giây trên runner CI chậm (UsersPage, ProductsPage). Test hỏng thật vẫn báo ở
    // assertion; ngưỡng này chỉ chặn test treo.
    testTimeout: 30_000,
  },
});
