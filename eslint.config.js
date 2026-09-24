// @ts-check
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Hai ứng dụng React (ADR-0003). */
const WEB_APPS = ['apps/admin-web/**/*.{ts,tsx}', 'apps/kiosk/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'apps/*/dist/**',
      'node_modules/**',
      'coverage/**',
      'migrations/**',
      'infra/**',
      // Thư mục runtime/cấu hình của dev-harness — không thuộc quyền kiểm soát của dự án
      // (spec/PROJECT.md §7 "Do not touch")
      '.agents/**',
      '.claude/**',
      // Sinh tự động từ openapi.yaml
      'packages/contracts/src/openapi.ts',
      '**/*.generated.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Ngưỡng số phải đọc từ cấu hình theo spec/constraints.md, không hardcode.
      // Rule này không kiểm được điều đó — CI có bước grep riêng (ci.yml §"Không hardcode ngưỡng số").
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: WEB_APPS,
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: WEB_APPS,
    ...reactRefresh.configs.vite,
  },
  {
    // Test và cấu hình Vite không phải module component, fast refresh không áp dụng.
    files: ['apps/*/src/**/*.test.{ts,tsx}', 'apps/*/vite.config.ts'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
