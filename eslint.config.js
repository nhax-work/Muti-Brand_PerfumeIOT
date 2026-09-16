// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'migrations/**',
      'infra/**',
      // Thư mục runtime/cấu hình của dev-harness — không thuộc quyền kiểm soát của dự án
      // (spec/PROJECT.md §7 "Do not touch")
      '.agents/**',
      '.claude/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
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
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
