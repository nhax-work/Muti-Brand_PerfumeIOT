/**
 * Giá mỗi lượt xịt theo sản phẩm trên PostgreSQL thật (FR-SLT-08, ADR-0023): sửa giá sản phẩm thì mọi
 * hóa đơn đang giữ slot bán sản phẩm đó đổi theo trong cùng giao dịch, gán sản phẩm thì slot nhận giá
 * sản phẩm, thương hiệu không đặt giá riêng cho slot được, hàng thanh lý giữ giá do nền tảng đặt
 * (FR-EXP-18).
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let asBrandA: ReturnType<typeof asUser>;
let asSuper: ReturnType<typeof asUser>;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  // Hóa đơn của fixture chưa ghi lúc thanh toán; gán sản phẩm cần hóa đơn đã thanh toán (FR-SLT-27).
  // Đã thanh toán thì phải có số hóa đơn (chk_rental_invoice_on_payment).
  await raw.query(
    `UPDATE slot_rentals SET paid_at = now(), invoice_number = 'HD-PRICE-' || left(id::text, 8)
      WHERE id = ANY($1)`,
    [fx.rentals],
  );
  app = await createTestApp();
  asBrandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  asSuper = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
});

afterAll(async () => {
  await app?.close();
  if (fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
});

async function priceOf(rentalId: string): Promise<string> {
  const res = await raw.query<{ price_per_spray: string }>(
    'SELECT price_per_spray FROM slot_rentals WHERE id = $1',
    [rentalId],
  );
  return res.rows[0]!.price_per_spray;
}

describe('Giá mỗi lượt xịt theo sản phẩm (FR-SLT-08, ADR-0023)', () => {
  it('test_FR_SLT_08_changing_product_price_updates_every_held_slot', async () => {
    // rentals[0] (ACTIVE) đang bán products[0] của thương hiệu A.
    const res = await asBrandA('PATCH', `/products/${fx.products[0]}`, {
      payload: { defaultPrice: '41000' },
    });
    expect(res.statusCode).toBe(200);
    expect(await priceOf(fx.rentals[0]!)).toBe('41000.0000');
  });

  it('test_FR_SLT_08_assigning_product_takes_product_price', async () => {
    // rentals[1] đang bán products[1] giá 35.000; đổi sang products[0] thì nhận giá 41.000.
    const res = await asBrandA('PUT', `/slot-rentals/${fx.rentals[1]}/product`, {
      payload: { fragranceProductId: fx.products[0] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ pricePerSpray: string }>().pricePerSpray).toBe('41000.0000');
    expect(await priceOf(fx.rentals[1]!)).toBe('41000.0000');
  });

  it('test_FR_SLT_08_brand_cannot_set_slot_price_directly', async () => {
    const res = await asBrandA('PUT', `/slot-rentals/${fx.rentals[0]}/price`, {
      payload: { pricePerSpray: '1000' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
    expect(await priceOf(fx.rentals[0]!)).toBe('41000.0000');
  });

  it('test_FR_SLT_08_rejects_non_positive_product_price', async () => {
    const res = await asBrandA('PATCH', `/products/${fx.products[0]}`, {
      payload: { defaultPrice: '0' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('test_FR_EXP_18_liquidated_slot_keeps_platform_price', async () => {
    // rentals[4] LIQUIDATED bán products[4]: đổi giá sản phẩm không chạm tới hàng thanh lý.
    const before = await priceOf(fx.rentals[4]!);
    const patch = await asBrandA('PATCH', `/products/${fx.products[4]}`, {
      payload: { defaultPrice: '99000' },
    });
    expect(patch.statusCode).toBe(200);
    expect(await priceOf(fx.rentals[4]!)).toBe(before);

    const set = await asSuper('PUT', `/slot-rentals/${fx.rentals[4]}/price`, {
      payload: { pricePerSpray: '12000' },
    });
    expect(set.statusCode).toBe(200);
    expect(await priceOf(fx.rentals[4]!)).toBe('12000.0000');
  });
});
