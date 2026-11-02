/**
 * Dashboard, chuỗi thời gian và báo cáo tồn kho trên PostgreSQL thật, cùng quyền đọc danh sách
 * thương hiệu/sản phẩm cho nhân sự nền tảng:
 *   - FR-RPT-01: `orders.revenue` là Money dạng chuỗi như contract, không phải object (màn Dashboard
 *     từng hiện "NaN VND").
 *   - FR-RPT-02: chuỗi thời gian nhóm được theo ngày/tuần/tháng — trước đây Postgres từ chối vì
 *     `date_trunc` nhận tham số rời ở SELECT và GROUP BY; Operations Staff xem được qua report.platform.
 *   - FR-RPT-07: Inventory Staff và Operations Staff xem được báo cáo tồn kho; tài khoản không có quyền
 *     nào trong ba quyền liên quan vẫn bị chặn.
 *   - FR-BND-07, FR-PRD-03: nhân sự nền tảng có machine.view đọc được tên thương hiệu và sản phẩm để
 *     màn Chi tiết máy hiển thị đúng slot đang thuê; Brand Admin không đọc được danh sách thương hiệu.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

const MONEY = /^-?\d+(\.\d{1,4})?$/;

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let ops: PlatformStaff;
let inventory: PlatformStaff;
let viewerOnly: PlatformStaff;
let asSuperAdmin: ReturnType<typeof asUser>;
let asBrandA: ReturnType<typeof asUser>;
let asOps: ReturnType<typeof asUser>;
let asInventory: ReturnType<typeof asUser>;
let asViewerOnly: ReturnType<typeof asUser>;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  ops = await seedPlatformStaff(raw, fx, 'OPERATIONS_STAFF', [
    'machine.view',
    'machine.operate',
    'alert.handle',
    'order.view',
    'report.platform',
  ]);
  inventory = await seedPlatformStaff(raw, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'inventory.adjust',
    'refill.fulfill',
    'machine.view',
  ]);
  viewerOnly = await seedPlatformStaff(raw, fx, 'INVENTORY_STAFF', ['refill.fulfill']);
  app = await createTestApp();
  const token = async (email: string) => (await login(app, email, TEST_PASSWORD)).accessToken;
  asSuperAdmin = asUser(app, await token(fx.superAdminEmail));
  asBrandA = asUser(app, await token(fx.brandAdminAEmail));
  asOps = asUser(app, await token(ops.email));
  asInventory = asUser(app, await token(inventory.email));
  asViewerOnly = asUser(app, await token(viewerOnly.email));
});

afterAll(async () => {
  await app?.close();
  for (const staff of [ops, inventory, viewerOnly]) await staff?.cleanup();
  if (fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
});

function period(): string {
  const earliest = Math.min(...fx.orders.map((o) => o.createdAt.getTime()));
  const from = new Date(earliest - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

describe('Dashboard nền tảng (FR-RPT-01)', () => {
  it('test_FR_RPT_01_platform_dashboard_revenue_is_money_string', async () => {
    const res = await asSuperAdmin('GET', `/reports/platform-dashboard?${period()}`);
    expect(res.statusCode).toBe(200);
    const revenue = res.json<{ orders: { revenue: unknown } }>().orders.revenue;
    expect(typeof revenue).toBe('string');
    expect(revenue).toMatch(MONEY);
    expect(Number(revenue)).toBeGreaterThan(0);
  });
});

describe('Chuỗi thời gian đơn hàng (FR-RPT-02)', () => {
  it.each(['DAY', 'WEEK', 'MONTH'])(
    'test_FR_RPT_02_orders_timeseries_groups_by_%s',
    async (granularity) => {
      const res = await asSuperAdmin(
        'GET',
        `/reports/orders-timeseries?${period()}&granularity=${granularity}`,
      );
      expect(res.statusCode).toBe(200);
      const points = res.json<{ bucket: string; orderCount: number; revenue: unknown }[]>();
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(typeof p.revenue).toBe('string');
        expect(p.revenue).toMatch(MONEY);
      }
    },
  );

  it('test_FR_RPT_02_orders_timeseries_brand_scope_counts_only_own_brand_orders', async () => {
    const res = await asBrandA('GET', `/reports/orders-timeseries?${period()}&granularity=MONTH`);
    expect(res.statusCode).toBe(200);
    const points = res.json<{ orderCount: number; revenue: string }[]>();
    const expected = fx.orders.filter(
      (o) => o.brandId === fx.brandA && o.revenueOwner === 'BRAND',
    ).length;
    expect(points.reduce((sum, p) => sum + p.orderCount, 0)).toBe(expected);
    expect(points.reduce((sum, p) => sum + Number(p.revenue), 0)).toBe(expected * 35000);
  });

  it('test_FR_RPT_02_orders_timeseries_allowed_for_operations_staff', async () => {
    const res = await asOps('GET', `/reports/orders-timeseries?${period()}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Báo cáo tồn kho (FR-RPT-07)', () => {
  it('test_FR_RPT_07_inventory_report_allowed_for_inventory_and_operations_staff', async () => {
    for (const as of [asInventory, asOps]) {
      const res = await as('GET', '/reports/inventory');
      expect(res.statusCode).toBe(200);
      const slotIds = res.json<{ slotId: string | null }[]>().map((i) => i.slotId);
      // Nhân sự nền tảng thấy slot của cả hai thương hiệu.
      expect(slotIds).toEqual(expect.arrayContaining([fx.slots[0], fx.slots[2]]));
    }
  });

  it('test_FR_RPT_07_inventory_report_rejects_account_without_report_permission', async () => {
    const res = await asViewerOnly('GET', '/reports/inventory');
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
  });

  it('test_FR_RPT_07_inventory_report_brand_admin_sees_only_own_slots', async () => {
    const res = await asBrandA('GET', '/reports/inventory');
    expect(res.statusCode).toBe(200);
    const items = res.json<{ brandId: string; slotId: string | null }[]>();
    expect(items.every((i) => i.brandId === fx.brandA)).toBe(true);
    expect(items.map((i) => i.slotId)).not.toContain(fx.slots[2]);
  });
});

describe('Tên thương hiệu và sản phẩm cho nhân sự nền tảng (FR-BND-07, FR-PRD-03)', () => {
  it('test_FR_BND_07_brand_list_readable_by_machine_viewer', async () => {
    const res = await asOps('GET', '/brands?pageSize=100');
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ items: { id: string }[] }>().items.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining([fx.brandA, fx.brandB]));
  });

  it('test_FR_BND_07_brand_list_still_forbidden_for_brand_admin', async () => {
    const res = await asBrandA('GET', '/brands');
    expect(res.statusCode).toBe(403);
  });

  it('test_FR_PRD_03_product_list_readable_by_machine_viewer', async () => {
    const res = await asInventory('GET', '/products?pageSize=100');
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ items: { id: string }[] }>().items.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([fx.products[0], fx.products[2]]));
  });

  it('test_FR_PRD_03_product_list_brand_admin_still_scoped', async () => {
    const res = await asBrandA('GET', '/products?pageSize=100');
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ items: { id: string }[] }>().items.map((p) => p.id);
    expect(ids).toContain(fx.products[0]);
    expect(ids).not.toContain(fx.products[2]);
  });
});
