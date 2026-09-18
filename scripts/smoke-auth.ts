/**
 * Kiểm thử khói đầu-cuối cho task Auth · RBAC · cô lập dữ liệu mức slot.
 *
 *   make up              # nếu Docker chưa chạy
 *   npm run smoke:auth
 *
 * Làm gì:
 *   1. Xóa sạch rồi dựng lại CSDL TEST (cổng 5433) — KHÔNG đụng CSDL dev, không đọc .env của bạn.
 *   2. Seed với một mật khẩu ngẫu nhiên sinh cho lần chạy này.
 *   3. Bật API ở cổng 3100 trỏ vào CSDL test.
 *   4. Gọi API thật như client, in ✓/✗ cho từng ca kèm mã FR.
 *   5. Chạy chốt chặn cô lập dữ liệu trên Postgres thật với 2 thương hiệu cùng một máy.
 *   6. Tắt API. Exit 1 nếu có ca nào sai.
 *
 * Đây KHÔNG phải test nghiệm thu thay cho 7 nhóm test người tự viết (spec/testing.md) — nó là cách
 * nhanh để tự xác nhận hệ thống đang chạy đúng.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDatabase } from '../apps/api/src/shared/db/database.js';
import {
  brandOccupiesSlotNow,
  brandScopedBySlotAndTime,
  brandScopedOrders,
  type BrandScope,
} from '../apps/api/src/shared/scoping/brand-scope.js';

const TEST_DB = 'postgresql://scent:scent_test@localhost:5433/scentstation_test';
const PORT = 3100;
const BASE = `http://localhost:${PORT}/api/v1`;
const PASSWORD = `smoke-${randomBytes(6).toString('hex')}`;

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const BRAND_B = '11111111-1111-4111-8111-000000000002';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `  — ${detail}` : ''}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

interface Reply {
  status: number;
  body: Record<string, any>;
  raw: string;
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const raw = await response.text();
  let body: Record<string, any> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // phản hồi không phải JSON
  }
  return { status: response.status, body, raw };
}

const login = (email: string, password = PASSWORD) =>
  call('POST', '/auth/login', { body: { email, password } });

// ---------------------------------------------------------------------------------------------
// Dựng môi trường
// ---------------------------------------------------------------------------------------------

function run(command: string): void {
  execSync(command, {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DB, SEED_DEFAULT_PASSWORD: PASSWORD },
  });
}

async function prepareDatabase(): Promise<void> {
  const probe = new pg.Client({ connectionString: TEST_DB });
  try {
    await probe.connect();
    await probe.end();
  } catch {
    console.error('Không kết nối được CSDL test ở cổng 5433. Chạy `make up` trước.');
    process.exit(1);
  }
  run('npx node-pg-migrate down -m migrations -t pgmigrations');
  run('npx node-pg-migrate up -m migrations -t pgmigrations');
  run('npx tsx scripts/seed.ts');
}

async function startApi(): Promise<ChildProcess> {
  // Chạy từ apps/api như `npm run api:dev`: tsx lấy tsconfig (experimentalDecorators) theo cwd.
  const api = spawn(process.execPath, ['--import', 'tsx', 'src/entrypoints/http.ts'], {
    cwd: 'apps/api',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB,
      JWT_SECRET: randomBytes(32).toString('hex'),
      PORT: String(PORT),
      APP_ENV: 'test',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/auth/me`);
      return api;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  api.kill();
  throw new Error('API không khởi động được trong 30 giây');
}

// ---------------------------------------------------------------------------------------------
// Các ca kiểm
// ---------------------------------------------------------------------------------------------

async function authCases(): Promise<void> {
  section('FR-AUTH-01 — đăng nhập');
  const ok = await login('admin@maison-aurore.local');
  check('đăng nhập đúng trả cặp token', ok.status === 200 && !!ok.body.accessToken, ok.raw);
  check(
    'Brand Admin gắn đúng thương hiệu (FR-AUTH-05)',
    ok.body.user?.brandId === BRAND_A && ok.body.user?.roles?.[0] === 'BRAND_ADMIN',
  );

  const unknown = await login('khong-ton-tai@x.local', 'sai-mat-khau-123');
  const wrong = await login('admin@maison-aurore.local', 'sai-mat-khau-123');
  check(
    'email lạ và sai mật khẩu trả phản hồi y hệt nhau (AC2)',
    unknown.status === 401 && unknown.raw === wrong.raw,
    `${unknown.raw} vs ${wrong.raw}`,
  );
  check(
    'email không phân biệt hoa thường',
    (await login('ADMIN@MAISON-AURORE.LOCAL')).status === 200,
  );
  const invalid = await call('POST', '/auth/login', { body: { email: 'khong-phai-email' } });
  check('thiếu trường trả VALIDATION_ERROR 400', invalid.body.code === 'VALIDATION_ERROR');

  section('FR-AUTH-02 — token');
  check('không có token → 401', (await call('GET', '/auth/me')).status === 401);
  check(
    'token giả → 401',
    (await call('GET', '/auth/me', { token: 'eyJhbGciOiJIUzI1NiJ9.e30.gia' })).status === 401,
  );
  check('expiresIn = ACCESS_TOKEN_TTL_MIN × 60 = 3600', ok.body.expiresIn === 3600);
  const rotated = await call('POST', '/auth/refresh', {
    body: { refreshToken: ok.body.refreshToken },
  });
  check(
    'refresh cấp token mới và xoay vòng',
    rotated.status === 200 && rotated.body.refreshToken !== ok.body.refreshToken,
  );
  const replay = await call('POST', '/auth/refresh', {
    body: { refreshToken: ok.body.refreshToken },
  });
  check('dùng lại refresh token cũ bị từ chối', replay.status === 401);

  section('FR-AUTH-04 — đăng xuất');
  const a = await login('admin@maison-aurore.local');
  const b = await login('admin@maison-aurore.local');
  await call('POST', '/auth/logout', { token: a.body.accessToken });
  check(
    'access token phiên A chết',
    (await call('GET', '/auth/me', { token: a.body.accessToken })).status === 401,
  );
  check(
    'refresh token phiên A chết',
    (await call('POST', '/auth/refresh', { body: { refreshToken: a.body.refreshToken } }))
      .status === 401,
  );
  check(
    'phiên B vẫn sống (AC2)',
    (await call('GET', '/auth/me', { token: b.body.accessToken })).status === 200,
  );

  section('FR-AUTH-09 — xác thực lại');
  const bad = await call('POST', '/auth/reauth', {
    token: b.body.accessToken,
    body: { password: 'sai' },
  });
  check('sai mật khẩu → INVALID_CREDENTIALS', bad.body.code === 'INVALID_CREDENTIALS');
  const good = await call('POST', '/auth/reauth', {
    token: b.body.accessToken,
    body: { password: PASSWORD },
  });
  check(
    'đúng mật khẩu → reauth token sống REAUTH_TOKEN_TTL_SEC = 300',
    good.status === 200 && good.body.expiresIn === 300,
  );

  section('FR-AUTH-03 — khóa tài khoản');
  for (let i = 0; i < 5; i++) await login('ops@scentstation.local', 'sai-mat-khau-123');
  const locked = await login('ops@scentstation.local');
  check(
    'sau 5 lần sai, mật khẩu ĐÚNG vẫn bị khóa → 423 (AC1)',
    locked.status === 423 && locked.body.code === 'ACCOUNT_LOCKED',
  );
  for (let i = 0; i < 3; i++) await login('inventory@scentstation.local', 'sai-mat-khau-123');
  await login('inventory@scentstation.local');
  for (let i = 0; i < 2; i++) await login('inventory@scentstation.local', 'sai-mat-khau-123');
  check(
    '3 sai + 1 đúng + 2 sai → KHÔNG khóa (AC3)',
    (await login('inventory@scentstation.local')).status === 200,
  );
}

async function usrCases(): Promise<void> {
  const psa = (await login('admin@scentstation.local')).body.accessToken as string;
  const brandAdmin = (await login('admin@huong-viet.local')).body.accessToken as string;

  section('FR-USR-05 — chỉ Super Admin quản trị tài khoản');
  const denied = await call('GET', '/users', { token: brandAdmin });
  check('Brand Admin gọi /users → 403 FORBIDDEN_SCOPE', denied.body.code === 'FORBIDDEN_SCOPE');
  const listed = await call('GET', '/users?pageSize=2', { token: psa });
  check(
    'Super Admin liệt kê có phân trang',
    listed.body.items?.length === 2 && listed.body.meta?.total === 5,
  );

  section('FR-USR-01, FR-AUTH-05 — tạo tài khoản');
  const noBrand = await call('POST', '/users', {
    token: psa,
    body: { email: 'x@a.local', fullName: 'X', role: 'BRAND_ADMIN' },
  });
  check('Brand Admin thiếu brandId → 400 (AUTH-05 AC3)', noBrand.status === 400);
  const withBrand = await call('POST', '/users', {
    token: psa,
    body: { email: 'y@a.local', fullName: 'Y', role: 'OPERATIONS_STAFF', brandId: BRAND_A },
  });
  check('vai trò nền tảng kèm brandId → 400 (AUTH-05 AC4)', withBrand.status === 400);

  const created = await call('POST', '/users', {
    token: psa,
    body: {
      email: 'moi@maison-aurore.local',
      fullName: 'Mới',
      role: 'BRAND_ADMIN',
      brandId: BRAND_A,
    },
  });
  const temporary = created.body.temporaryPassword as string;
  check(
    'tạo tài khoản → INVITED kèm mật khẩu tạm',
    created.status === 201 && created.body.status === 'INVITED' && temporary?.length >= 12,
  );
  const reread = await call('GET', `/users/${created.body.id}`, { token: psa });
  check('đọc lại không còn thấy mật khẩu tạm', !('temporaryPassword' in reread.body));
  const duplicate = await call('POST', '/users', {
    token: psa,
    body: {
      email: 'MOI@maison-aurore.local',
      fullName: 'Trùng',
      role: 'BRAND_ADMIN',
      brandId: BRAND_A,
    },
  });
  check('email trùng (khác hoa thường) → 400', duplicate.status === 400);

  section('ADR-0004 — đổi mật khẩu tạm');
  const invited = await login('moi@maison-aurore.local', temporary);
  check(
    'đăng nhập bằng mật khẩu tạm → mustChangePassword',
    invited.body.user?.mustChangePassword === true,
  );
  const invitedToken = invited.body.accessToken as string;
  check(
    'INVITED gọi được /auth/me',
    (await call('GET', '/auth/me', { token: invitedToken })).status === 200,
  );
  check(
    'INVITED bị chặn ở endpoint khác → 403',
    (await call('POST', '/auth/reauth', { token: invitedToken, body: { password: temporary } }))
      .status === 403,
  );
  const changed = await call('POST', '/auth/change-password', {
    token: invitedToken,
    body: { currentPassword: temporary, newPassword: 'mat-khau-moi-2026' },
  });
  check('đổi mật khẩu → 204', changed.status === 204);
  check(
    'token cũ chết sau khi đổi',
    (await call('GET', '/auth/me', { token: invitedToken })).status === 401,
  );
  check(
    'mật khẩu tạm hết dùng được',
    (await login('moi@maison-aurore.local', temporary)).status === 401,
  );
  const active = await login('moi@maison-aurore.local', 'mat-khau-moi-2026');
  check('mật khẩu mới → ACTIVE', active.body.user?.mustChangePassword === false);

  section('FR-USR-03, FR-AUTH-10 — vô hiệu hóa');
  await call('POST', `/users/${created.body.id}/disable`, { token: psa });
  check(
    'phiên đang mở của tài khoản bị vô hiệu hóa chết ngay',
    (await call('GET', '/auth/me', { token: active.body.accessToken })).status === 401,
  );
  check(
    'không đăng nhập lại được',
    (await login('moi@maison-aurore.local', 'mat-khau-moi-2026')).status === 401,
  );
  const self = (await call('GET', '/auth/me', { token: psa })).body.id as string;
  check(
    'không tự vô hiệu hóa chính mình → 400',
    (await call('POST', `/users/${self}/disable`, { token: psa })).status === 400,
  );

  section('FR-USR-04 — đặt lại mật khẩu');
  check(
    'không đặt lại cho tài khoản đã vô hiệu hóa → 400',
    (await call('POST', `/users/${created.body.id}/reset-password`, { token: psa })).status === 400,
  );
  const victimId = (await call('GET', '/users?role=BRAND_ADMIN', { token: psa })).body.items.find(
    (u: { email: string }) => u.email === 'admin@huong-viet.local',
  ).id as string;
  const reset = await call('POST', `/users/${victimId}/reset-password`, { token: psa });
  check('đặt lại trả mật khẩu tạm mới', reset.status === 200 && !!reset.body.temporaryPassword);
  check(
    'phiên cũ của người bị đặt lại chết',
    (await call('GET', '/auth/me', { token: brandAdmin })).status === 401,
  );
  check('mật khẩu cũ hết dùng được', (await login('admin@huong-viet.local')).status === 401);
}

async function isolationCases(): Promise<void> {
  section('FR-AUTH-07, FR-BND-05 — chốt chặn cô lập dữ liệu trên Postgres thật');

  const raw = new pg.Client({ connectionString: TEST_DB });
  await raw.connect();
  // Một đơn cho mỗi thương hiệu, cộng một đơn của A phát sinh SAU THANH LÝ (revenue_owner PLATFORM).
  await raw.query(`
    INSERT INTO orders (brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                        fragrance_product_id, product_name_snapshot, amount, currency,
                        payment_reference, idempotency_key, expires_at)
    SELECT r.brand_id, r.id, v.owner::revenue_owner_type, s.machine_id, r.slot_id,
           r.fragrance_product_id, 'x', 1000, 'VND', 'ref-' || v.tag, 'idem-' || v.tag, now()
      FROM (VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'BRAND', 'a'),
                   ('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', 'BRAND', 'b'),
                   ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'PLATFORM', 'a-thanh-ly')) v(rid, owner, tag)
      JOIN slot_rentals r ON r.id = v.rid::uuid
      JOIN machine_slots s ON s.id = r.slot_id`);
  await raw.query(`
    INSERT INTO sensor_readings (machine_id, slot_id, reading_type, numeric_value, measured_at)
    SELECT machine_id, id, 'LOAD_CELL_G', 100, now() FROM machine_slots`);

  const leak = await raw.query(`
    SELECT count(*)::int AS n FROM audit_logs
     WHERE after_data::text ILIKE '%temporaryPassword%' OR metadata::text ILIKE '%temporaryPassword%'`);
  await raw.end();

  const db = createDatabase(TEST_DB);
  const refs = async (scope: BrandScope) =>
    (
      await db
        .selectFrom('orders')
        .select('payment_reference')
        .where(brandScopedOrders(scope))
        .execute()
    )
      .map((o) => o.payment_reference)
      .sort()
      .join(',');
  const readings = async (scope: BrandScope) =>
    (
      await db
        .selectFrom('sensor_readings as sr')
        .select('sr.id')
        .where(brandScopedBySlotAndTime(scope, 'sr.slot_id', 'sr.measured_at'))
        .execute()
    ).length;
  const slots = async (scope: BrandScope) =>
    (
      await db
        .selectFrom('machine_slots as ms')
        .select('ms.slot_number')
        .where(brandOccupiesSlotNow(scope, 'ms.id'))
        .orderBy('ms.slot_number')
        .execute()
    )
      .map((s) => s.slot_number)
      .join(',');

  const A: BrandScope = { kind: 'BRAND', brandId: BRAND_A };
  const B: BrandScope = { kind: 'BRAND', brandId: BRAND_B };
  const ALL: BrandScope = { kind: 'UNRESTRICTED' };

  check('Brand A chỉ thấy đơn của mình', (await refs(A)) === 'ref-a', await refs(A));
  check(
    'Brand A KHÔNG thấy đơn sau thanh lý dù cùng brand_id (FR-EXP-20)',
    !(await refs(A)).includes('thanh-ly'),
  );
  check('Brand B chỉ thấy đơn của mình', (await refs(B)) === 'ref-b', await refs(B));
  check('Nền tảng thấy mọi đơn', (await refs(ALL)) === 'ref-a,ref-a-thanh-ly,ref-b');
  check(
    'Số đo cảm biến tách theo slot đã thuê',
    (await readings(A)) === 2 && (await readings(B)) === 2,
  );
  check(
    'Slot đang chiếm: A = 1,2 — B = 3,4',
    (await slots(A)) === '1,2' && (await slots(B)) === '3,4',
  );
  check('Không bản ghi audit nào chứa mật khẩu tạm', leak.rows[0].n === 0);

  await db.destroy();
}

// ---------------------------------------------------------------------------------------------

console.log('Dựng lại CSDL test (cổng 5433)...');
await prepareDatabase();
console.log('Bật API ở cổng 3100...');
const api = await startApi();

try {
  await authCases();
  await usrCases();
  await isolationCases();
} finally {
  api.kill();
}

console.log(`\n${failed === 0 ? '✓ TẤT CẢ ĐẠT' : '✗ CÓ CA SAI'} — ${passed} đạt, ${failed} sai`);
process.exit(failed === 0 ? 0 : 1);
