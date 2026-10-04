/**
 * Swagger UI phục vụ nguyên văn spec/contracts/openapi.yaml (contract-first, ADR-0003).
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findOpenApiSpec, withCurrentServer } from '../../apps/api/src/entrypoints/swagger.js';
import { loadConfig } from '../../apps/api/src/shared/config/index.js';

const BASE_ENV = { DATABASE_URL: 'postgres://unused', JWT_SECRET: 'unit-test-secret' };

describe('Swagger UI', () => {
  it('tìm thấy contract khi chạy từ apps/api (cwd của npm run api:dev)', () => {
    const fromApi = findOpenApiSpec(join(process.cwd(), 'apps', 'api'));
    expect(fromApi).toBe(join(process.cwd(), 'spec', 'contracts', 'openapi.yaml'));
  });

  it('đưa máy chủ đang mở tài liệu lên đầu servers, không trùng lặp', () => {
    const spec = {
      openapi: '3.1.0',
      servers: [{ url: 'http://localhost:3000/api/v1' }, { url: 'https://api.example/api/v1' }],
    };

    const lan = withCurrentServer(spec, 'http://192.168.1.10:3000');
    expect((lan['servers'] as { url: string }[]).map((s) => s.url)).toEqual([
      'http://192.168.1.10:3000/api/v1',
      'http://localhost:3000/api/v1',
      'https://api.example/api/v1',
    ]);

    const local = withCurrentServer(spec, 'http://localhost:3000');
    expect((local['servers'] as { url: string }[]).map((s) => s.url)).toEqual([
      'http://localhost:3000/api/v1',
      'https://api.example/api/v1',
    ]);
  });

  it('mặc định bật ở development, tắt ở production; SWAGGER_ENABLED ghi đè', () => {
    expect(loadConfig(BASE_ENV).swaggerEnabled).toBe(true);
    expect(loadConfig({ ...BASE_ENV, SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(false);
    expect(() => loadConfig({ ...BASE_ENV, SWAGGER_ENABLED: 'yes' })).toThrow(/SWAGGER_ENABLED/);
  });
});
