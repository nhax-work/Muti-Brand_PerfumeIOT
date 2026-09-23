/**
 * Dữ liệu cho bộ test cô lập mức slot (FR-AUTH-07, FR-AUTH-08, FR-BND-05, FR-BND-08).
 *
 * Kịch bản tối thiểu mà NFR-SEC-04 đòi: **một máy vật lý, hai thương hiệu**.
 *
 *   slot 1, 2 -> thương hiệu A, hợp đồng ACTIVE
 *   slot 3, 4 -> thương hiệu B, hợp đồng ACTIVE
 *   slot 5    -> thương hiệu A, hợp đồng LIQUIDATED (ca sau thanh lý, FR-EXP-20 / FR-REV-06)
 *
 * KHÔNG dùng lại `scripts/seed.ts`: script đó dùng id cố định nên sẽ đụng dữ liệu dev, và một bộ
 * test nghiệm thu yêu cầu không nên phụ thuộc vào một script tiện ích có thể đổi bất cứ lúc nào.
 * Mọi id ở đây sinh mới từng lần chạy.
 */

import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import type pg from 'pg';

/** Mật khẩu chỉ tồn tại trong test; không đọc từ môi trường để test chạy được ở máy trắng. */
export const TEST_PASSWORD = 'MatKhauTest#2026';

const ALL_PERMISSIONS = [
  'brand.manage',
  'user.manage',
  'machine.manage',
  'machine.operate',
  'rental.manage',
  'rental.request',
  'product.manage',
  'inventory.manage',
  'inventory.adjust',
  'refill.request',
  'refill.fulfill',
  'order.refund',
  'dispense.diagnostic',
  'alert.handle',
  'maintenance.handle',
  'report.brand',
  'report.platform',
  'audit.read',
] as const;

/** Khớp `scripts/seed.ts` — Brand Admin KHÔNG có machine.manage hay report.platform. */
const BRAND_ADMIN_PERMISSIONS = [
  'product.manage',
  'rental.request',
  'refill.request',
  'report.brand',
] as const;

export interface SeededOrder {
  readonly id: string;
  readonly slotId: string;
  readonly brandId: string;
  readonly revenueOwner: 'BRAND' | 'PLATFORM';
  readonly createdAt: Date;
}

export interface IsolationFixture {
  readonly runId: string;
  readonly brandA: string;
  readonly brandB: string;
  readonly superAdminEmail: string;
  readonly brandAdminAEmail: string;
  readonly brandAdminBEmail: string;
  readonly superAdminId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly machineId: string;
  readonly machineSerial: string;
  readonly machineDisplayName: string;
  /** slots[0] là slot số 1 … slots[4] là slot số 5. */
  readonly slots: readonly string[];
  readonly rentals: readonly string[];
  readonly products: readonly string[];
  readonly bottles: readonly string[];
  /** Tên sản phẩm của B — dùng để soi rò rỉ trong phần thân phản hồi. */
  readonly brandBProductNames: readonly string[];
  readonly rentalStartsAt: Date;
  readonly rentalEndsAt: Date;
  /** Mốc thanh lý của hợp đồng slot 5. */
  readonly liquidatedAt: Date;
  readonly orders: readonly SeededOrder[];
  /** Số đo trên slot 1 nhưng TRƯỚC kỳ hạn hợp đồng của A (FR-AUTH-07 AC3). */
  readonly readingBeforeRentalId: string;
}

function days(n: number): number {
  return n * 24 * 60 * 60 * 1000;
}

export async function seedIsolationFixture(client: pg.Client): Promise<IsolationFixture> {
  const runId = randomUUID().slice(0, 8);
  const passwordHash = await hash(TEST_PASSWORD);
  const now = Date.now();

  const rentalStartsAt = new Date(now - days(30));
  const rentalEndsAt = new Date(now + days(335));
  const liquidatedAt = new Date(now - days(10));

  const brandA = randomUUID();
  const brandB = randomUUID();
  const roleSuperAdmin = randomUUID();
  const roleBrandAdmin = randomUUID();
  const superAdminId = randomUUID();
  const brandAdminAId = randomUUID();
  const brandAdminBId = randomUUID();
  const locationId = randomUUID();
  const machineId = randomUUID();
  const slots = Array.from({ length: 5 }, () => randomUUID());
  const rentals = Array.from({ length: 5 }, () => randomUUID());
  const products = Array.from({ length: 5 }, () => randomUUID());
  const batches = [randomUUID(), randomUUID()];
  const bottles = Array.from({ length: 5 }, () => randomUUID());

  const locationName = `Địa điểm test ${runId}`;
  const machineSerial = `TEST-${runId}`;
  const machineDisplayName = `Máy test ${runId}`;

  // slot index -> thương hiệu sở hữu. Slot 5 (index 4) là ca sau thanh lý của A.
  const owners = [brandA, brandA, brandB, brandB, brandA];
  const productNames = [
    `A Matinale ${runId}`,
    `A Nocturne ${runId}`,
    `B Huong Sen ${runId}`,
    `B Huong Que ${runId}`,
    `A Thanh Ly ${runId}`,
  ];

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO brands (id, code, name, status)
       VALUES ($1, $2, $3, 'ACTIVE'), ($4, $5, $6, 'ACTIVE')`,
      [
        brandA,
        `TEST_A_${runId}`,
        `Thuong hieu A ${runId}`,
        brandB,
        `TEST_B_${runId}`,
        `Thuong hieu B ${runId}`,
      ],
    );

    // Quyền dùng chung toàn hệ thống: có sẵn thì thôi, không tạo trùng (permissions.code UNIQUE).
    for (const code of ALL_PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (id, code, description) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [randomUUID(), code, `Quyen ${code}`],
      );
    }

    // uq_roles_brand_code là unique index trên (brand_id, code); brand_id NULL nên các hàng mức nền
    // tảng không đụng nhau giữa các lần chạy.
    await client.query(
      `INSERT INTO roles (id, brand_id, code, name, is_system)
       VALUES ($1, NULL, 'PLATFORM_SUPER_ADMIN', $2, true),
              ($3, NULL, 'BRAND_ADMIN', $4, true)`,
      [roleSuperAdmin, `Super Admin ${runId}`, roleBrandAdmin, `Brand Admin ${runId}`],
    );

    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2::varchar[])`,
      [roleSuperAdmin, [...ALL_PERMISSIONS]],
    );
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2::varchar[])`,
      [roleBrandAdmin, [...BRAND_ADMIN_PERMISSIONS]],
    );

    const superAdminEmail = `super.${runId}@test.local`;
    const brandAdminAEmail = `brand.a.${runId}@test.local`;
    const brandAdminBEmail = `brand.b.${runId}@test.local`;

    const users: readonly (readonly [string, string | null, string, string, string, string])[] = [
      [superAdminId, null, superAdminEmail, 'Quan tri nen tang', roleSuperAdmin, 'PLATFORM'],
      [brandAdminAId, brandA, brandAdminAEmail, 'Quan tri thuong hieu A', roleBrandAdmin, 'BRAND'],
      [brandAdminBId, brandB, brandAdminBEmail, 'Quan tri thuong hieu B', roleBrandAdmin, 'BRAND'],
    ];
    for (const [id, brandId, email, fullName, roleId, scopeType] of users) {
      // status ACTIVE: INVITED sẽ bị AccessGuard chặn bằng mustChangePassword (ADR-0004).
      await client.query(
        `INSERT INTO users (id, brand_id, email, password_hash, full_name, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [id, brandId, email, passwordHash, fullName],
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), id, roleId, scopeType],
      );
    }

    await client.query(
      `INSERT INTO locations (id, code, name, address, status)
       VALUES ($1, $2, $3, 'Dia chi test', 'ACTIVE')`,
      [locationId, `TEST_LOC_${runId}`, locationName],
    );
    await client.query(
      `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                             firmware_version, simulator_enabled)
       VALUES ($1, $2, $3, $4, 'ONLINE', 'NORMAL', '0.1.0-test', true)`,
      [machineId, locationId, machineSerial, machineDisplayName],
    );
    await client.query(
      `INSERT INTO device_credentials (id, machine_id, credential_identifier,
                                       public_key_or_secret_hash, status, issued_at)
       VALUES ($1, $2, $3, 'hash-giu-cho-khong-phai-bi-mat-that', 'ACTIVE', now())`,
      [randomUUID(), machineId, `machine-${machineSerial}`],
    );

    for (let i = 0; i < slots.length; i++) {
      await client.query(
        `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                    low_stock_threshold_ml, estimated_remaining_ml,
                                    estimated_remaining_sprays, status)
         VALUES ($1, $2, $3, 0.1200, 5.0000, 48.0000, 400, 'AVAILABLE')`,
        [slots[i], machineId, i + 1],
      );
    }

    for (let i = 0; i < products.length; i++) {
      await client.query(
        `INSERT INTO fragrance_products (id, brand_id, sku, name, default_price, currency,
                                         full_bottle_retail_price, full_bottle_volume_ml, status)
         VALUES ($1, $2, $3, $4, '35000.0000', 'VND', '2400000.0000', 50.0000, 'ACTIVE')`,
        [products[i], owners[i], `SKU-${runId}-${i + 1}`, productNames[i]],
      );
    }

    const batchOwners = [brandA, brandB];
    for (let i = 0; i < batches.length; i++) {
      await client.query(
        `INSERT INTO inventory_batches (id, brand_id, fragrance_product_id, batch_number,
                                        received_at, expires_at, quantity_received, created_by)
         VALUES ($1, $2, $3, $4, now(), now() + interval '18 months', 10, $5)`,
        [
          batches[i],
          batchOwners[i],
          i === 0 ? products[0] : products[2],
          `LOT-${runId}-${i}`,
          superAdminId,
        ],
      );
    }

    // Hợp đồng: slot 1-4 ACTIVE; slot 5 LIQUIDATED, đã qua mốc thanh lý.
    for (let i = 0; i < 4; i++) {
      await client.query(
        `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                                   status, starts_at, ends_at, price_per_spray, currency,
                                   fixed_fee, revenue_share_percent, created_by)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $5, $6, '35000.0000', 'VND', 1500000.0000, 10.00, $7)`,
        [rentals[i], slots[i], owners[i], products[i], rentalStartsAt, rentalEndsAt, superAdminId],
      );
    }
    await client.query(
      `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                                 status, starts_at, ends_at, grace_ends_at, price_per_spray,
                                 currency, fixed_fee, revenue_share_percent, created_by)
       VALUES ($1, $2, $3, $4, $5, 'LIQUIDATED', $5, $6, $7, '50000.0000', 'VND',
               1500000.0000, 10.00, $8)`,
      [
        rentals[4],
        slots[4],
        brandA,
        products[4],
        new Date(now - days(120)),
        liquidatedAt,
        new Date(now + days(20)),
        superAdminId,
      ],
    );

    for (let i = 0; i < bottles.length; i++) {
      await client.query(
        `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier,
                              status, initial_volume_ml, current_estimated_ml, empty_weight_g,
                              opened_at, installed_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'INSTALLED', 50.0000, 48.0000, 62.5000,
                 $7, $7, now() + interval '18 months')`,
        [
          bottles[i],
          owners[i],
          // Sau thanh lý, chai thuộc nền tảng (FR-EXP-17) dù brand_id vẫn giữ thương hiệu cũ.
          i === 4 ? 'PLATFORM' : 'BRAND',
          owners[i] === brandA ? batches[0] : batches[1],
          products[i],
          `BTL-${runId}-${i + 1}`,
          rentalStartsAt,
        ],
      );
      await client.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
        bottles[i],
        slots[i],
      ]);
    }

    // Đơn hàng: mỗi slot 1-4 hai đơn trong kỳ hạn; slot 5 một đơn BRAND trước thanh lý và một đơn
    // PLATFORM sau thanh lý — cả hai đều mang brand_id của A.
    const orders: SeededOrder[] = [];
    let seq = 0;
    const addOrder = async (
      slotIndex: number,
      revenueOwner: 'BRAND' | 'PLATFORM',
      createdAt: Date,
    ): Promise<void> => {
      const id = randomUUID();
      seq += 1;
      await client.query(
        `INSERT INTO orders (id, brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                             fragrance_product_id, product_name_snapshot, amount, currency, status,
                             payment_reference, idempotency_key, expires_at, paid_at, dispensed_at,
                             created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '35000.0000', 'VND', 'DISPENSED',
                 $9, $10, $11, $12, $12, $12)`,
        [
          id,
          owners[slotIndex],
          rentals[slotIndex],
          revenueOwner,
          machineId,
          slots[slotIndex],
          products[slotIndex],
          productNames[slotIndex],
          `PAY-${runId}-${seq}`,
          `IDEM-${runId}-${seq}`,
          new Date(createdAt.getTime() + 15 * 60 * 1000),
          createdAt,
        ],
      );
      orders.push({
        id,
        slotId: slots[slotIndex] as string,
        brandId: owners[slotIndex] as string,
        revenueOwner,
        createdAt,
      });
    };

    for (let i = 0; i < 4; i++) {
      await addOrder(i, 'BRAND', new Date(now - days(20)));
      await addOrder(i, 'BRAND', new Date(now - days(5)));
    }
    await addOrder(4, 'BRAND', new Date(now - days(40)));
    await addOrder(4, 'PLATFORM', new Date(now - days(5)));

    // Telemetry: hai số đo trong kỳ hạn cho mỗi slot, cộng một số đo trên slot 1 nằm TRƯỚC ngày
    // hợp đồng của A bắt đầu — A không được thấy nó (FR-AUTH-07 AC3).
    for (let i = 0; i < slots.length; i++) {
      for (const measuredAt of [new Date(now - days(20)), new Date(now - days(2))]) {
        await client.query(
          `INSERT INTO sensor_readings (id, machine_id, slot_id, reading_type, numeric_value, unit,
                                        measured_at)
           VALUES ($1, $2, $3, 'slot_weight_g', 120.5, 'g', $4)`,
          [randomUUID(), machineId, slots[i], measuredAt],
        );
      }
    }
    const readingBeforeRentalId = randomUUID();
    await client.query(
      `INSERT INTO sensor_readings (id, machine_id, slot_id, reading_type, numeric_value, unit,
                                    measured_at)
       VALUES ($1, $2, $3, 'slot_weight_g', 999.9, 'g', $4)`,
      [readingBeforeRentalId, machineId, slots[0], new Date(now - days(60))],
    );

    for (let i = 0; i < 3; i++) {
      await client.query(
        `INSERT INTO device_events (id, machine_id, device_event_id, event_type, occurred_at, payload)
         VALUES ($1, $2, $3, 'DOOR_OPENED', $4, '{}'::jsonb)`,
        [randomUUID(), machineId, `EVT-${runId}-${i}`, new Date(now - days(3))],
      );
    }

    await client.query('COMMIT');

    return {
      runId,
      brandA,
      brandB,
      superAdminEmail,
      brandAdminAEmail,
      brandAdminBEmail,
      superAdminId,
      locationId,
      locationName,
      machineId,
      machineSerial,
      machineDisplayName,
      slots,
      rentals,
      products,
      bottles,
      brandBProductNames: [productNames[2] as string, productNames[3] as string],
      rentalStartsAt,
      rentalEndsAt,
      liquidatedAt,
      orders,
      readingBeforeRentalId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Dọn dữ liệu đã seed, theo thứ tự ngược khóa ngoại.
 *
 * `brands` và `audit_logs` KHÔNG xóa được và cố tình bỏ lại: `audit_logs` chỉ cho thêm mới (trigger
 * `trg_audit_logs_append_only`, FR-AUD-09) mà `audit_logs.brand_id` lại có khóa ngoại tới `brands`,
 * nên mỗi lần đăng nhập là một hàng khóa vĩnh viễn thương hiệu đó lại. Mã thương hiệu có hậu tố
 * theo từng lần chạy nên vài hàng bỏ lại không làm lần chạy sau hỏng.
 */
export async function cleanupIsolationFixture(
  client: pg.Client,
  fx: IsolationFixture,
): Promise<void> {
  const brands = [fx.brandA, fx.brandB];
  const userRows = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE email = ANY($1::citext[])`,
    [[fx.superAdminEmail, fx.brandAdminAEmail, fx.brandAdminBEmail]],
  );
  const users = userRows.rows.map((r) => r.id);
  const roleRows = await client.query<{ role_id: string }>(
    `SELECT DISTINCT role_id FROM user_roles WHERE user_id = ANY($1::uuid[])`,
    [users],
  );
  const roles = roleRows.rows.map((r) => r.role_id);

  const statements: readonly (readonly [string, unknown[]])[] = [
    [`UPDATE machine_slots SET active_bottle_id = NULL WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM sensor_readings WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM device_events WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM orders WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM bottles WHERE brand_id = ANY($1::uuid[])`, [brands]],
    [`DELETE FROM slot_rentals WHERE slot_id = ANY($1::uuid[])`, [fx.slots]],
    [`DELETE FROM inventory_batches WHERE brand_id = ANY($1::uuid[])`, [brands]],
    [`DELETE FROM fragrance_products WHERE brand_id = ANY($1::uuid[])`, [brands]],
    [`DELETE FROM machine_status_histories WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM device_credentials WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM machine_slots WHERE machine_id = $1`, [fx.machineId]],
    [`DELETE FROM machines WHERE id = $1`, [fx.machineId]],
    [`DELETE FROM locations WHERE id = $1`, [fx.locationId]],
    [`DELETE FROM refresh_sessions WHERE user_id = ANY($1::uuid[])`, [users]],
    [`DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])`, [users]],
    [`DELETE FROM role_permissions WHERE role_id = ANY($1::uuid[])`, [roles]],
    [`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]],
    [`DELETE FROM roles WHERE id = ANY($1::uuid[])`, [roles]],
  ];

  for (const [sql, params] of statements) {
    await client.query(sql, params);
  }
}
