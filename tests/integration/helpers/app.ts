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

/** Bí mật ký webhook mock trong test tích hợp — test tự ký bằng `signMockPayload` với giá trị này. */
export const TEST_PAYMENT_WEBHOOK_SECRET = 'integration-test-webhook-secret';

/** Khóa mã hóa phiếu khiếu nại trong test (32 byte 0x11) — không dùng ở môi trường thật. */
export const TEST_REFUND_ACCOUNT_ENC_KEY = Buffer.alloc(32, 0x11).toString('base64');
/** Bí mật ký mã khiếu nại trong test — test tự tính mã bằng `claimTokenFor` với giá trị này. */
export const TEST_REFUND_CLAIM_TOKEN_SECRET = 'integration-test-refund-claim-secret';

/** Khóa checksum PayOS trong test — test tự ký webhook bằng `payosSignatureOf` với giá trị này. */
export const TEST_PAYOS_CHECKSUM_KEY = 'integration-test-payos-checksum-key';

export interface TestAppOptions {
  /** Cổng tạo thanh toán mới. Mặc định `mock`. `payos` thì test phải giả lập `fetch` (ADR-0016). */
  readonly paymentProvider?: 'mock' | 'payos';
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  // `loadConfig()` đọc process.env NGAY lúc CoreModule khởi tạo, nên phải đặt trước khi import
  // AppModule — vì vậy các import dưới đây là import động, không phải import tĩnh ở đầu file.
  process.env['DATABASE_URL'] = resolveTestDatabaseUrl();
  process.env['JWT_SECRET'] ??= 'integration-test-secret-khong-dung-o-that';
  // Gán đè, không `??=`: test tự ký webhook bằng đúng bí mật này, bất kể .env của máy đang có gì.
  process.env['PAYMENT_PROVIDER'] = options.paymentProvider ?? 'mock';
  process.env['PAYMENT_WEBHOOK_SECRET'] = TEST_PAYMENT_WEBHOOK_SECRET;
  // PayOS luôn được cấu hình trong test để webhook /payos xử lý được; chỉ gọi API khi là cổng hiện tại.
  process.env['PAYOS_BASE_URL'] = 'https://payos.test.invalid';
  process.env['PAYOS_CLIENT_ID'] = 'test-client-id';
  process.env['PAYOS_API_KEY'] = 'test-api-key';
  process.env['PAYOS_CHECKSUM_KEY'] = TEST_PAYOS_CHECKSUM_KEY;
  process.env['PAYOS_RETURN_URL'] = 'https://admin.test.invalid/rentals/payment-return';
  process.env['PAYOS_CANCEL_URL'] = 'https://admin.test.invalid/rentals/payment-cancel';
  // Phiếu khiếu nại hoàn tiền (ADR-0012): khóa AES-256 32 byte và bí mật ký mã khiếu nại — chỉ cho test.
  process.env['REFUND_ACCOUNT_ENC_KEY'] = TEST_REFUND_ACCOUNT_ENC_KEY;
  process.env['REFUND_CLAIM_TOKEN_SECRET'] = TEST_REFUND_CLAIM_TOKEN_SECRET;

  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('../../../apps/api/src/app.module.js');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
    // Khớp entrypoints/http.ts: webhook thanh toán cần body thô để kiểm chữ ký (FR-ORD-13).
    rawBody: true,
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
