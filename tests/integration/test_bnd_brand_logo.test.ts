/**
 * Upload logo thương hiệu trên PostgreSQL thật với driver kho ảnh `local` (FR-BND-06, ADR-0022):
 * kiểm loại tệp theo nội dung, giới hạn dung lượng, mã hóa lại sang WebP và bỏ metadata, mỗi
 * thương hiệu chỉ đổi được logo của mình, thay/xóa logo dọn đối tượng cũ.
 */

import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUser,
  createTestApp,
  login,
  TEST_MEDIA_DIR,
  TEST_MEDIA_PUBLIC_BASE_URL,
} from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

/** Hạ ngưỡng để ca "quá dung lượng" không phải tạo tệp 2 MB. */
const MAX_BYTES = 300_000;

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let asBrandA: ReturnType<typeof asUser>;
let tokenA: string;
let tokenSuper: string;

beforeAll(async () => {
  process.env['BRAND_LOGO_MAX_BYTES'] = String(MAX_BYTES);
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  const token = async (email: string) => (await login(app, email, TEST_PASSWORD)).accessToken;
  tokenA = await token(fx.brandAdminAEmail);
  tokenSuper = await token(fx.superAdminEmail);
  asBrandA = asUser(app, tokenA);
});

afterAll(async () => {
  delete process.env['BRAND_LOGO_MAX_BYTES'];
  await app?.close();
  if (fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
  await rm(join(TEST_MEDIA_DIR, 'brands'), { recursive: true, force: true });
});

/** Thân multipart/form-data với một tệp ở trường `file`. */
function multipart(file: Buffer, filename: string, contentType: string) {
  const boundary = '----scentstation-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function postLogo(
  token: string,
  file: Buffer,
  filename = 'logo.jpg',
  contentType = 'image/jpeg',
) {
  const { payload, headers } = multipart(file, filename, contentType);
  return app.inject({
    method: 'POST',
    url: '/api/v1/brands/me/logo',
    headers: { ...headers, authorization: `Bearer ${token}` },
    payload,
  });
}

/** Ảnh JPEG lớn hơn cạnh tối đa, mang EXIF. */
async function jpegWithExif(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#1e293b' } })
    .jpeg({ quality: 80 })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Secret-Model' } })
    .toBuffer();
}

function localPath(url: string): string {
  return join(TEST_MEDIA_DIR, url.slice(TEST_MEDIA_PUBLIC_BASE_URL.length + 1));
}

async function logoInDb(brandId: string): Promise<string | null> {
  const db = await raw.query<{ logo_url: string | null }>(
    'SELECT logo_url FROM brands WHERE id = $1',
    [brandId],
  );
  return db.rows[0]!.logo_url;
}

describe('Upload logo thương hiệu (FR-BND-06, ADR-0022)', () => {
  let firstUrl: string;

  it('test_FR_BND_06_upload_logo_reencodes_webp_within_max_edge_and_strips_metadata', async () => {
    const res = await postLogo(tokenA, await jpegWithExif());
    expect(res.statusCode).toBe(200);
    const brand = res.json<{ id: string; logoUrl: string }>();
    expect(brand.id).toBe(fx.brandA);
    expect(brand.logoUrl).toMatch(
      new RegExp(`^${TEST_MEDIA_PUBLIC_BASE_URL}/brands/${fx.brandA}-[0-9a-f]{16}\\.webp$`),
    );
    firstUrl = brand.logoUrl;

    const stored = await readFile(localPath(firstUrl));
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(512);
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from('Secret-Model'))).toBe(false);
    expect(await logoInDb(fx.brandA)).toBe(firstUrl);
  });

  it('test_FR_BND_06_replacing_logo_deletes_previous_object', async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const res = await postLogo(tokenA, png, 'logo.png', 'image/png');
    expect(res.statusCode).toBe(200);
    const url = res.json<{ logoUrl: string }>().logoUrl;
    expect(url).not.toBe(firstUrl);
    expect(existsSync(localPath(url))).toBe(true);
    expect(existsSync(localPath(firstUrl))).toBe(false);
    // Ảnh nhỏ hơn cạnh tối đa không bị phóng to.
    const meta = await sharp(await readFile(localPath(url))).metadata();
    expect([meta.width, meta.height]).toEqual([200, 200]);
    firstUrl = url;
  });

  it('test_FR_BND_06_logo_rejects_non_image_even_with_image_extension', async () => {
    const res = await postLogo(tokenA, Buffer.from('<svg onload="alert(1)"/>'));
    expect(res.statusCode).toBe(415);
    expect(res.json<{ code: string }>().code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(await logoInDb(fx.brandA)).toBe(firstUrl);
  });

  it('test_FR_BND_06_logo_rejects_file_over_max_bytes', async () => {
    const noise = Buffer.alloc(600 * 600 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
    const big = await sharp(noise, { raw: { width: 600, height: 600, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(MAX_BYTES);
    const res = await postLogo(tokenA, big, 'big.png', 'image/png');
    expect(res.statusCode).toBe(413);
    expect(res.json<{ code: string }>().code).toBe('FILE_TOO_LARGE');
  });

  it('test_FR_BND_06_logo_requires_multipart_file_field', async () => {
    const res = await asBrandA('POST', '/brands/me/logo', { payload: { file: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('test_FR_BND_06_platform_account_has_no_brand_logo', async () => {
    const res = await postLogo(tokenSuper, await jpegWithExif(300, 300));
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
    const del = await asUser(app, tokenSuper)('DELETE', '/brands/me/logo');
    expect(del.statusCode).toBe(403);
  });

  it('test_FR_BND_06_logo_change_only_touches_own_brand', async () => {
    expect(await logoInDb(fx.brandB)).toBeNull();
  });

  it('test_FR_BND_06_delete_logo_clears_url_and_removes_object', async () => {
    const res = await asBrandA('DELETE', '/brands/me/logo');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ logoUrl: string | null }>().logoUrl).toBeNull();
    expect(existsSync(localPath(firstUrl))).toBe(false);
    expect(await logoInDb(fx.brandA)).toBeNull();
    const again = await asBrandA('DELETE', '/brands/me/logo');
    expect(again.statusCode).toBe(200);
  });
});
