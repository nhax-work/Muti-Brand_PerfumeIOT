/**
 * Dựng ứng dụng Nest thật cho test tích hợp.
 *
 * `apps/api/src/entrypoints/http.ts` không xuất ra factory — `bootstrap()` là hàm riêng tư và tự
 * chạy khi import, nên import file đó trong test sẽ mở cổng thật. Helper này dựng lại đúng cấu hình
 * của nó: `FastifyAdapter` + tiền tố `api/v1` (khớp `servers` trong spec/contracts/openapi.yaml).
 *
 * Gọi endpoint bằng `app.inject()` của Fastify: không cần cổng, không cần supertest, nhưng vẫn đi
 * qua đủ AccessGuard -> PrincipalLoader -> resolveBrandScope như một request thật.
 */

import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveTestDatabaseUrl } from './db.js';

export async function createTestApp(): Promise<NestFastifyApplication> {
  // `loadConfig()` đọc process.env NGAY lúc CoreModule khởi tạo, nên phải đặt trước khi import
  // AppModule — vì vậy các import dưới đây là import động, không phải import tĩnh ở đầu file.
  process.env['DATABASE_URL'] = resolveTestDatabaseUrl();
  process.env['JWT_SECRET'] ??= 'integration-test-secret-khong-dung-o-that';

  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('../../../apps/api/src/app.module.js');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Đăng nhập thật qua `POST /auth/login` thay vì tự ký token.
 *
 * Tự ký sẽ bỏ qua PrincipalLoader — mà chính nó là chỗ `users.brand_id` biến thành phạm vi. Test cô
 * lập dữ liệu không được phép bỏ qua đoạn đó.
 */
export async function login(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Đăng nhập thất bại cho ${email}: ${res.statusCode} ${res.body}`);
  }
  const body = res.json<{ accessToken: string; refreshToken: string }>();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

/** Lấy token xác thực lại cho các endpoint nhạy cảm (FR-AUTH-09). */
export async function reauth(
  app: NestFastifyApplication,
  accessToken: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/reauth',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Xác thực lại thất bại: ${res.statusCode} ${res.body}`);
  }
  return res.json<{ reauthToken: string }>().reauthToken;
}

/** Gói gọn request đã kèm Bearer để thân test không lặp header. */
export function asUser(app: NestFastifyApplication, accessToken: string) {
  return (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    opts: { payload?: Record<string, unknown>; headers?: Record<string, string> } = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${accessToken}`, ...(opts.headers ?? {}) },
      ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
    });
}
