/**
 * Upload ảnh sản phẩm trên PostgreSQL thật với driver kho ảnh `local` (FR-PRD-01, ADR-0020):
 * kiểm loại tệp theo nội dung, giới hạn dung lượng, mã hóa lại sang WebP và bỏ metadata, cô lập giữa
 * thương hiệu (BR-012), thay/xóa ảnh dọn đối tượng cũ, và kiosk nhận đúng `imageUrl`.
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
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

/** Hạ ngưỡng để ca "quá dung lượng" không phải tạo tệp 5 MB. */
const MAX_BYTES = 300_000;

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let ops: PlatformStaff;
let asBrandA: ReturnType<typeof asUser>;
let asBrandB: ReturnType<typeof asUser>;
let tokenA: string;
let tokenB: string;
let tokenOps: string;
let productA: string;

beforeAll(async () => {
  process.env['PRODUCT_IMAGE_MAX_BYTES'] = String(MAX_BYTES);
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  ops = await seedPlatformStaff(raw, fx, 'OPERATIONS_STAFF', ['machine.view', 'alert.handle']);
  app = await createTestApp();
  const token = async (email: string) => (await login(app, email, TEST_PASSWORD)).accessToken;
  tokenA = await token(fx.brandAdminAEmail);
  tokenB = await token(fx.brandAdminBEmail);
  tokenOps = await token(ops.email);
  asBrandA = asUser(app, tokenA);
  asBrandB = asUser(app, tokenB);
  productA = fx.products[0]!;
});

afterAll(async () => {
  delete process.env['PRODUCT_IMAGE_MAX_BYTES'];
  await app?.close();
  await ops?.cleanup();
  if (fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
  await rm(join(TEST_MEDIA_DIR, 'products'), { recursive: true, force: true });
});

/** Thân multipart/form-data với một tệp ở trường `field`. */
function multipart(file: Buffer, filename: string, contentType: string, field = 'file') {
  const boundary = '----scentstation-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function postImage(
  token: string,
  productId: string,
  file: Buffer,
  filename = 'bottle.jpg',
  contentType = 'image/jpeg',
) {
  const { payload, headers } = multipart(file, filename, contentType);
  return app.inject({
    method: 'POST',
    url: `/api/v1/products/${productId}/image`,
    headers: { ...headers, authorization: `Bearer ${token}` },
    payload,
  });
}

/** Ảnh JPEG lớn hơn cạnh tối đa, mang EXIF (tên máy chụp, GPS giả). */
async function jpegWithExif(width = 2400, height = 1600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#8a5a3c' } })
    .jpeg({ quality: 80 })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Secret-Model' } })
    .toBuffer();
}

function localPath(url: string): string {
  return join(TEST_MEDIA_DIR, url.slice(TEST_MEDIA_PUBLIC_BASE_URL.length + 1));
}

describe('Upload ảnh sản phẩm (FR-PRD-01, ADR-0020)', () => {
  let firstUrl: string;

  it('test_FR_PRD_01_upload_image_reencodes_webp_within_max_edge_and_strips_metadata', async () => {
    const res = await postImage(tokenA, productA, await jpegWithExif());
    expect(res.statusCode).toBe(200);
    const product = res.json<{ id: string; imageUrl: string }>();
    expect(product.imageUrl).toMatch(
      new RegExp(`^${TEST_MEDIA_PUBLIC_BASE_URL}/products/${productA}-[0-9a-f]{16}\\.webp$`),
    );
    firstUrl = product.imageUrl;

    const stored = await readFile(localPath(firstUrl));
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1200);
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from('Secret-Model'))).toBe(false);

    const db = await raw.query<{ image_url: string }>(
      'SELECT image_url FROM fragrance_products WHERE id = $1',
      [productA],
    );
    expect(db.rows[0]!.image_url).toBe(firstUrl);
  });

  it('test_FR_PRD_01_uploaded_image_served_with_immutable_cache', async () => {
    const res = await app.inject({ method: 'GET', url: new URL(firstUrl).pathname });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-type']).toContain('image/webp');
  });

  it('test_FR_PRD_01_kiosk_catalog_returns_uploaded_image_url', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/kiosk/machines/${fx.machineSerial}/catalog`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: { product?: { id: string; imageUrl: string | null } }[] }>()
      .items;
    const item = items.find((i) => i.product?.id === productA);
    expect(item?.product?.imageUrl).toBe(firstUrl);
  });

  it('test_FR_PRD_01_replacing_image_deletes_previous_object', async () => {
    const png = await sharp({
      create: { width: 400, height: 500, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const res = await postImage(tokenA, productA, png, 'bottle.png', 'image/png');
    expect(res.statusCode).toBe(200);
    const url = res.json<{ imageUrl: string }>().imageUrl;
    expect(url).not.toBe(firstUrl);
    expect(existsSync(localPath(url))).toBe(true);
    expect(existsSync(localPath(firstUrl))).toBe(false);
    // Ảnh nhỏ hơn cạnh tối đa không bị phóng to.
    const meta = await sharp(await readFile(localPath(url))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 500]);
    firstUrl = url;
  });

  it('test_FR_PRD_01_rejects_non_image_even_with_image_extension_and_content_type', async () => {
    const res = await postImage(tokenA, productA, Buffer.from('<svg onload="alert(1)"/>'));
    expect(res.statusCode).toBe(415);
    expect(res.json<{ code: string }>().code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('test_FR_PRD_01_rejects_corrupt_image_with_valid_signature', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    const res = await postImage(tokenA, productA, fake);
    expect(res.statusCode).toBe(415);
    expect(res.json<{ code: string }>().code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('test_FR_PRD_01_rejects_file_over_max_bytes', async () => {
    // Nhiễu ngẫu nhiên nén kém nên PNG vượt MAX_BYTES.
    const noise = Buffer.alloc(600 * 600 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
    const big = await sharp(noise, { raw: { width: 600, height: 600, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(MAX_BYTES);
    const res = await postImage(tokenA, productA, big, 'big.png', 'image/png');
    expect(res.statusCode).toBe(413);
    expect(res.json<{ code: string }>().code).toBe('FILE_TOO_LARGE');
  });

  it('test_FR_PRD_01_requires_multipart_file_field', async () => {
    const res = await asBrandA('POST', `/products/${productA}/image`, { payload: { file: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('test_FR_PRD_01_other_brand_cannot_change_image', async () => {
    const res = await postImage(tokenB, productA, await jpegWithExif(300, 300));
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
    const del = await asBrandB('DELETE', `/products/${productA}/image`);
    expect(del.statusCode).toBe(403);
    const db = await raw.query<{ image_url: string }>(
      'SELECT image_url FROM fragrance_products WHERE id = $1',
      [productA],
    );
    expect(db.rows[0]!.image_url).toBe(firstUrl);
  });

  it('test_FR_PRD_01_staff_without_product_manage_cannot_upload', async () => {
    const res = await postImage(tokenOps, productA, await jpegWithExif(300, 300));
    expect(res.statusCode).toBe(403);
  });

  it('test_FR_PRD_01_delete_image_clears_url_and_removes_object', async () => {
    const res = await asBrandA('DELETE', `/products/${productA}/image`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ imageUrl: string | null }>().imageUrl).toBeNull();
    expect(existsSync(localPath(firstUrl))).toBe(false);
    const again = await asBrandA('DELETE', `/products/${productA}/image`);
    expect(again.statusCode).toBe(200);
  });

  it('test_FR_PRD_01_delete_keeps_external_url_object_untouched', async () => {
    await raw.query('UPDATE fragrance_products SET image_url = $1 WHERE id = $2', [
      'https://cdn.example.com/brand/bottle.jpg',
      productA,
    ]);
    const res = await asBrandA('DELETE', `/products/${productA}/image`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ imageUrl: string | null }>().imageUrl).toBeNull();
  });
});
