/**
 * Swagger UI phục vụ nguyên văn spec/contracts/openapi.yaml (contract-first, ADR-0003).
 */

import 'reflect-metadata';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import {
  findOpenApiSpec,
  registerSwagger,
  SWAGGER_ROUTE,
  withCurrentServer,
} from '../../apps/api/src/entrypoints/swagger.js';
import { loadConfig } from '../../apps/api/src/shared/config/index.js';

/** Swagger chỉ là plugin Fastify — không cần AppModule (và CSDL) để kiểm. */
@Module({})
class EmptyModule {}

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

  it('mọi CSS/JS mà trang tải về đều tồn tại — /api/docs chuyển sang /api/docs/', async () => {
    const app = await NestFactory.create<NestFastifyApplication>(
      EmptyModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    );
    await registerSwagger(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const bare = await app.inject({ method: 'GET', url: SWAGGER_ROUTE });
      expect(bare.statusCode).toBe(302);
      expect(bare.headers.location).toBe(`${SWAGGER_ROUTE}/`);

      const page = await app.inject({ method: 'GET', url: `${SWAGGER_ROUTE}/` });
      expect(page.statusCode).toBe(200);
      // Trình duyệt giải đường dẫn tương đối theo URL của trang — làm đúng như vậy rồi tải thử.
      const assets = [...page.body.matchAll(/(?:href|src)="([^"]+)"/g)].map(
        (m) => new URL(m[1] as string, `http://localhost${SWAGGER_ROUTE}/`).pathname,
      );
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of [...assets, `${SWAGGER_ROUTE}/json`]) {
        const res = await app.inject({ method: 'GET', url: asset });
        expect(res.statusCode, asset).toBe(200);
      }
    } finally {
      await app.close();
    }
  });

  it('mặc định bật ở development, tắt ở production; SWAGGER_ENABLED ghi đè', () => {
    expect(loadConfig(BASE_ENV).swaggerEnabled).toBe(true);
    expect(loadConfig({ ...BASE_ENV, SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(false);
    expect(() => loadConfig({ ...BASE_ENV, SWAGGER_ENABLED: 'yes' })).toThrow(/SWAGGER_ENABLED/);
  });
});
