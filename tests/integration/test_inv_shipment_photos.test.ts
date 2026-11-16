/**
 * Ảnh khai báo gửi hàng trên PostgreSQL thật với driver kho ảnh `local` (FR-INV-22, ADR-0024): thêm
 * ảnh lô hàng trước khi đóng gói và kiện hàng đã đóng gói, giới hạn số ảnh mỗi loại, kiểm loại tệp,
 * ảnh bị khóa sau khi kho nhận hàng, thương hiệu khác không chạm được, xóa ảnh dọn đối tượng.
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

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let inventoryStaff: PlatformStaff;
let tokenA: string;
let tokenB: string;
let asBrandA: ReturnType<typeof asUser>;
let asStaff: ReturnType<typeof asUser>;

interface Photo {
  id: string;
  kind: 'BEFORE_PACKING' | 'PACKED';
  url: string;
}
interface Declaration {
  id: string;
  status: string;
  photos: Photo[];
}

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  inventoryStaff = await seedPlatformStaff(raw, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  tokenA = (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken;
  tokenB = (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken;
  asBrandA = asUser(app, tokenA);
  asStaff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
}, 60_000);

afterAll(async () => {
  await app?.close();
  // Khai báo còn trỏ tới nhân viên kho (received_by): dọn fixture trước, nhân viên sau.
  if (fx) await cleanupIsolationFixture(raw, fx);
  await inventoryStaff?.cleanup();
  await raw?.end();
  await rm(join(TEST_MEDIA_DIR, 'shipments'), { recursive: true, force: true });
});

async function declare(): Promise<Declaration> {
  const res = await asBrandA('POST', '/shipment-declarations', {
    payload: {
      fragranceProductId: fx.products[0],
      declaredQuantity: 4,
      declaredBottleVolumeMl: 500,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Declaration>();
}

/** Ảnh JPEG khác nhau theo `seed` để mỗi lần upload là một nội dung mới. */
async function jpeg(seed: number): Promise<Buffer> {
  return sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: seed, g: 90, b: 60 } },
  })
    .jpeg({ quality: 80 })
    .withExif({ IFD0: { Make: 'TestCam' } })
    .toBuffer();
}

async function postPhoto(token: string, id: string, kind: string, file: Buffer) {
  const boundary = '----scentstation-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/v1/shipment-declarations/${id}/photos?kind=${kind}`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${token}`,
    },
    payload,
  });
}

function localPath(url: string): string {
  return join(TEST_MEDIA_DIR, url.slice(TEST_MEDIA_PUBLIC_BASE_URL.length + 1));
}

describe('Ảnh khai báo gửi hàng (FR-INV-22, ADR-0024)', () => {
  let decl: Declaration;

  beforeAll(async () => {
    decl = await declare();
    expect(decl.photos).toEqual([]);
  });

  it('test_FR_INV_22_adds_photo_of_each_kind_reencoded_webp', async () => {
    const before = await postPhoto(tokenA, decl.id, 'BEFORE_PACKING', await jpeg(10));
    expect(before.statusCode, before.body).toBe(200);
    const packed = await postPhoto(tokenA, decl.id, 'PACKED', await jpeg(20));
    expect(packed.statusCode, packed.body).toBe(200);

    const photos = packed.json<Declaration>().photos;
    expect(photos.map((p) => p.kind)).toEqual(['BEFORE_PACKING', 'PACKED']);
    for (const p of photos) {
      expect(p.url).toMatch(
        new RegExp(`^${TEST_MEDIA_PUBLIC_BASE_URL}/shipments/${decl.id}-[0-9a-f]{16}\\.webp$`),
      );
      // Đọc ra buffer: sharp(đường dẫn) giữ tệp mở trong cache, Windows sẽ không cho xóa tệp đó.
      const meta = await sharp(await readFile(localPath(p.url))).metadata();
      expect(meta.format).toBe('webp');
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
      expect(meta.exif).toBeUndefined();
    }
  });

  it('test_FR_INV_22_photos_listed_with_declaration_for_warehouse', async () => {
    const res = await asStaff('GET', '/shipment-declarations');
    const found = res.json<{ items: Declaration[] }>().items.find((d) => d.id === decl.id);
    expect(found?.photos).toHaveLength(2);
  });

  it('test_FR_INV_22_rejects_more_than_max_photos_per_kind', async () => {
    for (const seed of [30, 40]) {
      const ok = await postPhoto(tokenA, decl.id, 'PACKED', await jpeg(seed));
      expect(ok.statusCode).toBe(200);
    }
    const over = await postPhoto(tokenA, decl.id, 'PACKED', await jpeg(50));
    expect(over.statusCode).toBe(400);
    expect(over.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('test_FR_INV_22_rejects_non_image_and_unknown_kind', async () => {
    const svg = await postPhoto(tokenA, decl.id, 'BEFORE_PACKING', Buffer.from('<svg/>'));
    expect(svg.statusCode).toBe(415);
    const kind = await postPhoto(tokenA, decl.id, 'SELFIE', await jpeg(60));
    expect(kind.statusCode).toBe(400);
  });

  it('test_FR_INV_22_other_brand_cannot_touch_photos', async () => {
    const res = await postPhoto(tokenB, decl.id, 'PACKED', await jpeg(70));
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
    const photoId = decl.id; // bất kỳ — phải dừng ở kiểm phạm vi trước khi tìm ảnh
    const del = await asUser(app, tokenB)(
      'DELETE',
      `/shipment-declarations/${decl.id}/photos/${photoId}`,
    );
    expect(del.statusCode).toBe(403);
  });

  it('test_FR_INV_22_delete_photo_removes_object', async () => {
    const list = await asBrandA('GET', '/shipment-declarations');
    const photo = list.json<{ items: Declaration[] }>().items.find((d) => d.id === decl.id)!
      .photos[0]!;
    const res = await asBrandA('DELETE', `/shipment-declarations/${decl.id}/photos/${photo.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<Declaration>().photos.some((p) => p.id === photo.id)).toBe(false);
    expect(existsSync(localPath(photo.url))).toBe(false);
  });

  it('test_FR_INV_22_photos_locked_after_receive', async () => {
    const received = await asStaff('POST', `/shipment-declarations/${decl.id}/receive`, {
      payload: { receivedQuantity: 4, batchNumber: `LOT-PHOTO-${fx.runId}` },
    });
    expect(received.statusCode, received.body).toBe(200);

    const add = await postPhoto(tokenA, decl.id, 'BEFORE_PACKING', await jpeg(80));
    expect(add.statusCode).toBe(409);
    expect(add.json<{ code: string }>().code).toBe('SHIPMENT_ALREADY_PROCESSED');
    const photo = received.json<{ declaration: Declaration }>().declaration.photos[0]!;
    const del = await asBrandA('DELETE', `/shipment-declarations/${decl.id}/photos/${photo.id}`);
    expect(del.statusCode).toBe(409);
  });
});
