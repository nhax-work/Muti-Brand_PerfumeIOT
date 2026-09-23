/**
 * CÔ LẬP DỮ LIỆU MỨC SLOT — test nghiệm thu, viết từ yêu cầu.
 *
 * Nguồn của từng khẳng định là acceptance criteria trong `spec/modules/`, KHÔNG phải mã nguồn:
 * FR-AUTH-07 (phạm vi theo tập slot đã thuê), FR-AUTH-08 (từ chối ngoài phạm vi), FR-BND-05 (chốt
 * chặn lọc), FR-BND-08 (không lộ thương hiệu khác), FR-EXP-20 và FR-REV-06 (đơn sau thanh lý).
 * NFR-SEC-04 đòi 100% endpoint có dữ liệu thương hiệu vượt được bộ này, mà Row-Level Security chưa
 * bật (schema.sql §12) nên tầng ứng dụng là lớp bảo vệ duy nhất.
 *
 * Bố cục: kịch bản một máy vật lý, hai thương hiệu (xem `helpers/seed-isolation.ts`).
 *
 * Phần 1 đi qua HTTP thật. Phần 2 kiểm thẳng chốt chặn `shared/scoping` trên CSDL thật, vì các
 * endpoint chứa đơn / doanh thu / tồn kho / telemetry (ORD, RPT, IOT, INV) CHƯA được hiện thực —
 * chỗ nào thiếu thì ghi rõ là thiếu, không bỏ trống.
 */

import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Schema } from '@scentstation/contracts';
import {
  brandHoldsSlotNow,
  brandOccupiesSlotNow,
  brandScopedByColumn,
  brandScopedBySlotAndTime,
  brandScopedOrders,
  type BrandScope,
} from '../../apps/api/src/shared/scoping/index.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient, openTestDb, type TestDb } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

type MachineMapSlot = Schema<'MachineMapSlot'>;

let app: NestFastifyApplication;
let raw: pg.Client;
let testDb: TestDb;
let fx: IsolationFixture;

let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let platform: ReturnType<typeof asUser>;
let platformToken: string;

/** Phạm vi của thương hiệu A, dựng đúng như `resolveBrandScope` sẽ dựng cho tài khoản của A. */
let scopeA: BrandScope;
let scopeB: BrandScope;
const UNRESTRICTED: BrandScope = { kind: 'UNRESTRICTED' };

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  testDb = openTestDb();
  app = await createTestApp();

  const tokenA = await login(app, fx.brandAdminAEmail, TEST_PASSWORD);
  const tokenB = await login(app, fx.brandAdminBEmail, TEST_PASSWORD);
  const tokenP = await login(app, fx.superAdminEmail, TEST_PASSWORD);
  brandA = asUser(app, tokenA.accessToken);
  brandB = asUser(app, tokenB.accessToken);
  platform = asUser(app, tokenP.accessToken);
  platformToken = tokenP.accessToken;

  scopeA = { kind: 'BRAND', brandId: fx.brandA };
  scopeB = { kind: 'BRAND', brandId: fx.brandB };
}, 120_000);

afterAll(async () => {
  await app?.close();
  await testDb?.close();
  if (raw && fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
});

// ===========================================================================================
// PHẦN 0 — Đối chứng: dữ liệu có thật và tài khoản nền tảng nhìn thấy đủ
//
// Không có phần này thì mọi khẳng định "A không thấy gì" đều vô nghĩa: một truy vấn hỏng cũng cho
// kết quả rỗng y hệt một truy vấn cô lập tốt.
// ===========================================================================================

describe('đối chứng', () => {
  it('test_FR_BND_07_platform_admin_sees_every_slot_on_the_machine', async () => {
    const res = await platform('GET', `/machines/${fx.machineId}/slots`);
    expect(res.statusCode).toBe(200);
    const slots = res.json<{ id: string }[]>();
    expect(slots.map((s) => s.id).sort()).toEqual([...fx.slots].sort());
  });
});

// ===========================================================================================
// PHẦN 1 — Qua HTTP thật
// ===========================================================================================

describe('đọc trực tiếp bằng id', () => {
  /** FR-AUTH-08 AC1: tài nguyên của thương hiệu khác, truy cập bằng id trực tiếp -> 403. */
  it('test_FR_AUTH_08_brand_direct_read_other_slot_denied', async () => {
    const slot3 = fx.slots[2] as string;
    const res = await brandA('GET', `/slots/${slot3}`);

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
    // Không một mẩu dữ liệu nào của slot 3 được đi kèm phản hồi từ chối.
    expect(res.body).not.toContain(slot3);
  });

  /** FR-AUTH-08 AC2 / FR-BND-08 AC1: không phân biệt được "của người khác" với "không tồn tại". */
  it('test_FR_AUTH_08_denied_response_same_for_unknown_id', async () => {
    const otherBrandSlot = await brandA('GET', `/slots/${fx.slots[2] as string}`);
    const nonExistent = await brandA('GET', '/slots/00000000-0000-4000-8000-000000000000');

    expect(otherBrandSlot.statusCode).toBe(nonExistent.statusCode);
    expect(otherBrandSlot.json()).toEqual(nonExistent.json());
  });

  /** FR-AUTH-08 AC4: chặn ở mọi động từ, không chỉ luồng đọc. */
  it('test_FR_AUTH_08_every_verb_denied_on_other_brand_slot', async () => {
    const slot3 = fx.slots[2] as string;
    const calls = [
      await brandA('GET', `/slots/${slot3}`),
      await brandA('PUT', `/slots/${slot3}/config`, { payload: { calibratedDosageMl: 0.5 } }),
      await brandA('PUT', `/slots/${slot3}/enabled`, { payload: { enabled: false } }),
      await brandA('DELETE', `/slots/${slot3}`),
    ];
    for (const res of calls) {
      expect(res.statusCode).toBe(403);
    }
  });

  /**
   * `GET /slots/{id}` là endpoint vận hành mức nền tảng (gác bằng `machine.manage`) và KHÔNG có
   * trong `openapi.yaml`. Thương hiệu bị chặn ở đây kể cả với slot của chính mình — đúng như thiết
   * kế: đường đọc slot của thương hiệu là `GET /reports/machine-map/{machineId}` (FR-RPT-12), nơi
   * dữ liệu đã được cắt theo phạm vi.
   *
   * Giữ test này để không ai "sửa cho tiện" bằng cách nới quyền endpoint nền tảng thay vì đi qua
   * sơ đồ máy.
   */
  it('test_FR_AUTH_08_platform_slot_endpoint_stays_closed_to_brands', async () => {
    expect((await brandA('GET', `/slots/${fx.slots[0] as string}`)).statusCode).toBe(403);
    expect((await brandA('GET', `/slots/${fx.slots[2] as string}`)).statusCode).toBe(403);
  });
});

describe('endpoint cấp máy', () => {
  /** FR-BND-08 AC3 + FR-AUTH-07 AC4: không trường nào tiết lộ sự tồn tại của B trên máy dùng chung. */
  it('test_FR_BND_08_machine_endpoints_leak_nothing_to_brand', async () => {
    const responses = [
      await brandA('GET', '/machines'),
      await brandA('GET', `/machines/${fx.machineId}`),
      await brandA('GET', `/machines/${fx.machineId}/slots`),
      await brandA('GET', `/machines/${fx.machineId}/status-history`),
      await brandA('PUT', `/machines/${fx.machineId}`, { payload: { displayName: 'đổi trộm' } }),
      await brandA('DELETE', `/machines/${fx.machineId}`),
    ];

    const leaks = [
      fx.machineSerial,
      fx.machineDisplayName,
      fx.brandB,
      fx.slots[2] as string,
      fx.slots[3] as string,
      ...fx.brandBProductNames,
    ];

    for (const res of responses) {
      expect(res.statusCode).toBe(403);
      for (const secret of leaks) {
        expect(res.body).not.toContain(secret);
      }
    }
  });

  /** FR-MCH-13: lịch sử trạng thái máy là dữ liệu vận hành mức nền tảng. */
  it('test_FR_MCH_13_status_history_is_platform_only', async () => {
    const reauthToken = await reauth(app, platformToken, TEST_PASSWORD);
    const changed = await platform('PUT', `/machines/${fx.machineId}/mode`, {
      payload: { operatingMode: 'MAINTENANCE', reason: 'test lịch sử' },
      headers: { 'x-reauth-token': reauthToken },
    });
    expect(changed.statusCode).toBe(200);

    const asPlatform = await platform('GET', `/machines/${fx.machineId}/status-history`);
    expect(asPlatform.statusCode).toBe(200);
    const body = asPlatform.json<{ items: { source: string; toOperatingMode: string }[] }>();
    expect(body.items.length).toBeGreaterThan(0);
    // `source` phải nằm trong enum của openapi.yaml, không phải giá trị tự chế.
    expect(['HEARTBEAT', 'OPERATOR', 'SYSTEM']).toContain(body.items[0]?.source);
    expect(body.items[0]?.toOperatingMode).toBe('MAINTENANCE');

    expect((await brandA('GET', `/machines/${fx.machineId}/status-history`)).statusCode).toBe(403);
    expect((await brandB('GET', `/machines/${fx.machineId}/status-history`)).statusCode).toBe(403);

    // Trả máy về NORMAL để không ảnh hưởng các test sau trong cùng file.
    await platform('PUT', `/machines/${fx.machineId}/mode`, {
      payload: { operatingMode: 'NORMAL', reason: 'khôi phục sau test' },
      headers: { 'x-reauth-token': await reauth(app, platformToken, TEST_PASSWORD) },
    });
  });
});

describe('slot trống chào thuê', () => {
  /**
   * FR-SLT-19 + BR-012: danh sách slot trống là thứ DUY NHẤT thương hiệu thấy về máy dùng chung.
   * Nó chỉ được mang thông tin vị trí — không tên thương hiệu, không sản phẩm, không số liệu.
   */
  it('test_FR_AUTH_07_available_slots_expose_only_location_data', async () => {
    const before = await brandA('GET', `/slots/available?machineId=${fx.machineId}`);
    expect(before.statusCode).toBe(200);
    expect(before.json<{ items: unknown[] }>().items).toHaveLength(0);

    // Nhả slot 3 của B: hợp đồng kết thúc thì slot quay lại thị trường.
    await raw.query(`UPDATE slot_rentals SET status = 'CLOSED' WHERE id = $1`, [fx.rentals[2]]);
    try {
      const after = await brandA('GET', `/slots/available?machineId=${fx.machineId}`);
      expect(after.statusCode).toBe(200);
      const items = after.json<{ items: Record<string, unknown>[] }>().items;
      expect(items).toHaveLength(1);

      const slot = items[0] as Record<string, unknown>;
      expect(slot['slotId']).toBe(fx.slots[2]);
      // Đúng sáu trường vị trí, không hơn — thêm trường nào cũng là một đường rò mới.
      expect(Object.keys(slot).sort()).toEqual(
        [
          'locationId',
          'locationName',
          'machineDisplayName',
          'machineId',
          'slotId',
          'slotNumber',
        ].sort(),
      );
      for (const secret of [fx.brandB, ...fx.brandBProductNames]) {
        expect(after.body).not.toContain(secret);
      }
    } finally {
      await raw.query(`UPDATE slot_rentals SET status = 'ACTIVE' WHERE id = $1`, [fx.rentals[2]]);
    }
  });
});

describe('credential thiết bị', () => {
  /** FR-MCH-02 + NFR-SEC-05: bí mật gốc xuất hiện đúng một lần, CSDL chỉ giữ băm. */
  it('test_FR_MCH_02_credential_secret_returned_once_only', async () => {
    const reauthToken = await reauth(app, platformToken, TEST_PASSWORD);
    const issued = await platform('POST', `/machines/${fx.machineId}/credentials`, {
      payload: {},
      headers: { 'x-reauth-token': reauthToken },
    });
    expect(issued.statusCode).toBe(201);
    const secret = issued.json<{ secret: string }>().secret;
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(20);

    const fetched = await platform('GET', `/machines/${fx.machineId}/credentials`);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<Record<string, unknown>>()).not.toHaveProperty('secret');
    expect(fetched.body).not.toContain(secret);

    const stored = await raw.query<{ public_key_or_secret_hash: string }>(
      `SELECT public_key_or_secret_hash FROM device_credentials WHERE machine_id = $1`,
      [fx.machineId],
    );
    const hash = stored.rows[0]?.public_key_or_secret_hash;
    expect(hash).not.toBe(secret);
    expect(hash).toBe(createHash('sha256').update(secret).digest('hex'));
  });

  /** FR-AUTH-09: xoay và thu hồi khóa thiết bị là thao tác nhạy cảm, phải xác thực lại. */
  it('test_FR_AUTH_09_credential_rotation_requires_reauth', async () => {
    const issue = await platform('POST', `/machines/${fx.machineId}/credentials`, { payload: {} });
    expect(issue.statusCode).toBe(403);
    expect(issue.json<{ code: string }>().code).toBe('REAUTH_REQUIRED');

    const revoke = await platform('POST', `/machines/${fx.machineId}/credentials/revoke`, {
      payload: {},
    });
    expect(revoke.statusCode).toBe(403);
    expect(revoke.json<{ code: string }>().code).toBe('REAUTH_REQUIRED');
  });

  /** FR-IOT-08: thu hồi rồi thì trạng thái phải là REVOKED, và thương hiệu không đụng được. */
  it('test_FR_AUTH_11_revoke_device_credential', async () => {
    expect((await brandA('GET', `/machines/${fx.machineId}/credentials`)).statusCode).toBe(403);

    const res = await platform('POST', `/machines/${fx.machineId}/credentials/revoke`, {
      payload: {},
      headers: { 'x-reauth-token': await reauth(app, platformToken, TEST_PASSWORD) },
    });
    expect(res.statusCode).toBe(204);

    const after = await platform('GET', `/machines/${fx.machineId}/credentials`);
    expect(after.json<{ status: string }>().status).toBe('REVOKED');
  });
});

describe('xóa slot đang có hợp đồng', () => {
  /** Ở tầng ứng dụng, slot đang bị chiếm không xóa được (spec/errors.md: SLOT_OCCUPIED, 409). */
  it('test_FR_SLT_02_soft_delete_slot_with_rental_returns_409', async () => {
    const res = await platform('DELETE', `/slots/${fx.slots[0] as string}`);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('SLOT_OCCUPIED');
  });
});

// ===========================================================================================
// PHẦN 2 — Chốt chặn phạm vi, chạy SQL thật
//
// Đơn hàng, doanh thu, tồn kho và telemetry CHƯA có endpoint (`GET /orders`,
// `GET /reports/brand-slots`, `GET /reports/inventory`, `GET /reports/machine-map/{machineId}`,
// `GET /machines/{id}/sensor-readings` đều mới chỉ có trong openapi.yaml). Nghiệm thu ở đây chạy
// đúng điều kiện lọc mà `shared/scoping` sinh ra, trên đúng dữ liệu của kịch bản hai thương hiệu —
// tức kiểm đúng thứ FR-AUTH-07 AC1..AC6 phát biểu, chỉ thiếu lớp vỏ HTTP.
// ===========================================================================================

describe('đơn hàng', () => {
  const ordersFor = async (scope: BrandScope) => {
    const rows = await testDb.db
      .selectFrom('orders')
      .select(['id', 'slot_id', 'revenue_owner', 'brand_id'])
      .where('machine_id', '=', fx.machineId)
      .where(brandScopedOrders(scope))
      .execute();
    return rows;
  };

  /** FR-AUTH-07 AC1 + AC4: chỉ đơn trên slot mình thuê; không đơn nào của slot 3-4 lọt sang A. */
  it('test_FR_AUTH_07_orders_scoped_to_rented_slots', async () => {
    const rows = await ordersFor(scopeA);
    const slotsSeen = new Set(rows.map((r) => r.slot_id));

    expect(slotsSeen.has(fx.slots[2] as string)).toBe(false);
    expect(slotsSeen.has(fx.slots[3] as string)).toBe(false);
    expect(rows.every((r) => r.brand_id === fx.brandA)).toBe(true);

    // B là phép thử ngược: nó thấy đúng phần của nó, không thấy phần của A.
    const rowsB = await ordersFor(scopeB);
    const slotsSeenB = new Set(rowsB.map((r) => r.slot_id));
    expect(slotsSeenB.has(fx.slots[0] as string)).toBe(false);
    expect(slotsSeenB.has(fx.slots[1] as string)).toBe(false);
    expect([...slotsSeenB].sort()).toEqual([fx.slots[2], fx.slots[3]].sort());

    // Tài khoản nền tảng thấy toàn bộ (FR-BND-07) — chứng minh dữ liệu có thật.
    expect(await ordersFor(UNRESTRICTED)).toHaveLength(fx.orders.length);
  });

  /**
   * FR-REV-06 + FR-AUTH-07 AC5: đơn `revenue_owner = PLATFORM` trên slot đã thanh lý vẫn mang
   * `brand_id` của thương hiệu cũ. Lọc chỉ bằng `brand_id` là rò rỉ — đây là chỗ chứng minh điều đó.
   */
  it('test_FR_REV_06_hide_platform_revenue_from_brand_admin', async () => {
    const platformOrder = fx.orders.find((o) => o.revenueOwner === 'PLATFORM');
    expect(platformOrder).toBeDefined();
    expect(platformOrder?.brandId).toBe(fx.brandA);

    const scoped = await ordersFor(scopeA);
    expect(scoped.some((r) => r.id === platformOrder?.id)).toBe(false);
    expect(scoped.every((r) => r.revenue_owner === 'BRAND')).toBe(true);

    // Đối chứng: bỏ điều kiện revenue_owner thì đơn của nền tảng lọt ngay sang màn hình của A.
    const brandIdOnly = await testDb.db
      .selectFrom('orders')
      .select('id')
      .where('machine_id', '=', fx.machineId)
      .where(brandScopedByColumn(scopeA, 'orders.brand_id'))
      .execute();
    expect(brandIdOnly.some((r) => r.id === platformOrder?.id)).toBe(true);
  });

  /** FR-EXP-20 AC1: trước mốc thanh lý thì thấy, sau mốc thanh lý thì không. */
  it('test_FR_EXP_20_revoke_brand_access_to_post_liquidation_orders', async () => {
    const liquidatedSlot = fx.slots[4] as string;
    const beforeLiq = fx.orders.find(
      (o) => o.slotId === liquidatedSlot && o.createdAt < fx.liquidatedAt,
    );
    const afterLiq = fx.orders.find(
      (o) => o.slotId === liquidatedSlot && o.createdAt > fx.liquidatedAt,
    );
    expect(beforeLiq).toBeDefined();
    expect(afterLiq).toBeDefined();

    const ids = new Set((await ordersFor(scopeA)).map((r) => r.id));
    expect(ids.has(beforeLiq?.id as string)).toBe(true);
    expect(ids.has(afterLiq?.id as string)).toBe(false);
  });
});

describe('tồn kho', () => {
  /** FR-INV-21 + FR-AUTH-07 AC4: chai trong slot của B không xuất hiện trong phạm vi của A. */
  it('test_FR_INV_21_inventory_scoped_to_own_bottles', async () => {
    const rows = await testDb.db
      .selectFrom('bottles')
      .select(['id', 'brand_id'])
      .where('id', 'in', [...fx.bottles])
      .where(brandScopedByColumn(scopeA, 'bottles.brand_id'))
      .execute();

    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(fx.bottles[2] as string)).toBe(false);
    expect(ids.has(fx.bottles[3] as string)).toBe(false);
    expect([...ids].sort()).toEqual([fx.bottles[0], fx.bottles[1], fx.bottles[4]].sort());
  });
});

describe('telemetry', () => {
  const readingsFor = async (scope: BrandScope) =>
    testDb.db
      .selectFrom('sensor_readings')
      .select(['id', 'slot_id', 'measured_at'])
      .where('machine_id', '=', fx.machineId)
      .where(
        brandScopedBySlotAndTime(scope, 'sensor_readings.slot_id', 'sensor_readings.measured_at'),
      )
      .execute();

  /** FR-AUTH-07 AC3 + AC4: chặn cả theo tập slot lẫn theo kỳ hạn hợp đồng. */
  it('test_FR_IOT_04_telemetry_scoped_by_slot_and_time', async () => {
    const rows = await readingsFor(scopeA);
    const slotsSeen = new Set(rows.map((r) => r.slot_id));

    // Theo slot: không số đo nào của slot 3-4.
    expect(slotsSeen.has(fx.slots[2] as string)).toBe(false);
    expect(slotsSeen.has(fx.slots[3] as string)).toBe(false);

    // Theo thời gian: số đo trên slot 1 phát sinh TRƯỚC ngày hợp đồng của A bắt đầu vẫn bị chặn.
    expect(rows.some((r) => r.id === fx.readingBeforeRentalId)).toBe(false);

    // Đối chứng: số đo đó có thật và tài khoản nền tảng thấy nó.
    const all = await readingsFor(UNRESTRICTED);
    expect(all.some((r) => r.id === fx.readingBeforeRentalId)).toBe(true);
  });

  /**
   * Khoảng trống đã biết, ghi lại để không ai tưởng là đã có: `device_events` KHÔNG có cột
   * `slot_id` (schema.sql §8), trong khi `brand-scope.ts` xếp nó vào nhóm bảng phải lọc bằng
   * `brandScopedBySlotAndTime`. Với lược đồ hiện tại, không có cách nào chia sự kiện thiết bị theo
   * thương hiệu — mọi sự kiện đều ở mức máy dùng chung.
   *
   * Test đỏ khi ai đó thêm `slot_id` vào bảng; lúc đó phải viết khẳng định cô lập thật cho nó.
   */
  it('test_FR_AUTH_07_device_events_cannot_be_slot_scoped_yet', async () => {
    const cols = await raw.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'device_events' AND column_name = 'slot_id'`,
    );
    expect(cols.rowCount).toBe(0);
  });
});

describe('sơ đồ máy', () => {
  /**
   * FR-RPT-12 + FR-BND-08 AC3 — đây là ĐƯỜNG DUY NHẤT để thương hiệu nhìn thấy slot của mình trên
   * một máy dùng chung; contract ghi rõ điều đó ở mô tả của `GET /machines/{id}/slots`.
   *
   * Hai nửa của cùng một yêu cầu, phải đúng đồng thời: A THẤY slot 1-2 kèm chi tiết, và A KHÔNG
   * thấy gì về slot 3-4 ngoài việc chúng tồn tại và không khả dụng.
   */
  it('test_FR_RPT_12_machine_map_shows_own_slots_only', async () => {
    const res = await brandA('GET', `/reports/machine-map/${fx.machineId}`);
    expect(res.statusCode).toBe(200);

    const map = res.json<MachineMapSlot[]>();
    expect(map.map((m) => m.slotNumber)).toEqual([1, 2, 3, 4, 5]);

    // Nửa thứ nhất: A thấy slot của mình, kèm đủ chi tiết khai thác.
    for (const slotNumber of [1, 2]) {
      const own = map.find((m) => m.slotNumber === slotNumber) as MachineMapSlot;
      expect(own.mine).toBe(true);
      expect(own.available).toBe(true);
      expect(own.slotId).toBe(fx.slots[slotNumber - 1]);
      expect(own.productName).toContain('A ');
      expect(own.estimatedRemainingSprays).toBe(400);
    }

    // Nửa thứ hai: slot của B chỉ còn đúng ba trường, không một mẩu dữ liệu nào kèm theo.
    for (const slotNumber of [3, 4]) {
      const foreign = map.find((m) => m.slotNumber === slotNumber) as MachineMapSlot;
      expect(Object.keys(foreign).sort()).toEqual(['available', 'mine', 'slotNumber']);
      expect(foreign.mine).toBe(false);
      expect(foreign.available).toBe(false);
    }

    // Không định danh nào của B đi theo phản hồi — kể cả id slot, thứ có thể dùng để dò chỗ khác.
    for (const secret of [
      fx.brandB,
      fx.slots[2] as string,
      fx.slots[3] as string,
      ...fx.brandBProductNames,
    ]) {
      expect(res.body).not.toContain(secret);
    }
  });

  /** Đối xứng: B thấy đúng phần của B, không thấy gì của A. */
  it('test_FR_RPT_12_machine_map_is_symmetric_for_the_other_brand', async () => {
    const res = await brandB('GET', `/reports/machine-map/${fx.machineId}`);
    expect(res.statusCode).toBe(200);

    const map = res.json<MachineMapSlot[]>();
    expect(map.filter((m) => m.mine).map((m) => m.slotNumber)).toEqual([3, 4]);
    for (const secret of [fx.slots[0] as string, fx.slots[1] as string]) {
      expect(res.body).not.toContain(secret);
    }
  });

  /**
   * FR-EXP-20: slot 5 có hợp đồng của A nhưng đã thanh lý — hàng và doanh thu thuộc nền tảng
   * (FR-EXP-17, FR-REV-02). A không được thấy tên sản phẩm hay lượng tồn của nền tảng trên slot đó.
   *
   * Đây là một diễn giải đặc tả: FR-RPT-12 không nói rõ hợp đồng đã thanh lý có còn tính là "slot
   * của mình" hay không. Xem `brandHoldsSlotNow` trong `shared/scoping/brand-scope.ts`.
   */
  it('test_FR_EXP_20_liquidated_slot_no_longer_shows_as_mine', async () => {
    const res = await brandA('GET', `/reports/machine-map/${fx.machineId}`);
    const liquidated = res
      .json<MachineMapSlot[]>()
      .find((m) => m.slotNumber === 5) as MachineMapSlot;

    expect(liquidated.mine).toBe(false);
    expect(Object.keys(liquidated).sort()).toEqual(['available', 'mine', 'slotNumber']);
    expect(res.body).not.toContain(`A Thanh Ly ${fx.runId}`);
  });

  /**
   * BR-012: máy mà thương hiệu không còn khai thác slot nào bị từ chối như thể không tồn tại.
   * Không chặn thì chỉ cần duyệt id máy là đếm được toàn bộ máy và số slot của nền tảng.
   */
  it('test_FR_BND_08_machine_map_denies_machine_without_own_slot', async () => {
    await raw.query(`UPDATE slot_rentals SET status = 'CLOSED' WHERE id = ANY($1::uuid[])`, [
      [fx.rentals[0], fx.rentals[1]],
    ]);
    try {
      const res = await brandA('GET', `/reports/machine-map/${fx.machineId}`);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');

      // Cùng phản hồi với một máy không tồn tại (FR-AUTH-08 AC2).
      const unknown = await brandA(
        'GET',
        '/reports/machine-map/00000000-0000-4000-8000-000000000000',
      );
      expect(unknown.statusCode).toBe(403);
      expect(unknown.json()).toEqual(res.json());
    } finally {
      await raw.query(`UPDATE slot_rentals SET status = 'ACTIVE' WHERE id = ANY($1::uuid[])`, [
        [fx.rentals[0], fx.rentals[1]],
      ]);
    }
  });

  /** FR-BND-07: tài khoản mức nền tảng không bị giới hạn — đối chứng cho các khẳng định trên. */
  it('test_FR_BND_07_machine_map_unrestricted_for_platform_account', async () => {
    const res = await platform('GET', `/reports/machine-map/${fx.machineId}`);
    expect(res.statusCode).toBe(200);

    const map = res.json<MachineMapSlot[]>();
    expect(map).toHaveLength(5);
    expect(map.every((m) => m.mine)).toBe(true);
  });

  /** Chốt chặn: `brandHoldsSlotNow` loại slot đã thanh lý, `brandOccupiesSlotNow` thì không. */
  it('test_FR_RPT_12_holds_and_occupies_differ_on_liquidated_slot', async () => {
    const occupies = await testDb.db
      .selectFrom('machine_slots')
      .select('id')
      .where('machine_id', '=', fx.machineId)
      .where(brandOccupiesSlotNow(scopeA, 'machine_slots.id'))
      .execute();
    expect(occupies.map((r) => r.id).sort()).toEqual(
      [fx.slots[0], fx.slots[1], fx.slots[4]].sort(),
    );

    const holds = await testDb.db
      .selectFrom('machine_slots')
      .select('id')
      .where('machine_id', '=', fx.machineId)
      .where(brandHoldsSlotNow(scopeA, 'machine_slots.id'))
      .execute();
    expect(holds.map((r) => r.id).sort()).toEqual([fx.slots[0], fx.slots[1]].sort());
  });
});
