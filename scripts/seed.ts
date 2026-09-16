/**
 * Dữ liệu mẫu cho máy dev.
 *
 * Dựng đúng cấu hình tối thiểu mà Makefile yêu cầu: **1 máy, 4 slot, 2 thương hiệu mỗi bên 2 slot**.
 * Đây cũng là cấu hình tối thiểu để kiểm được hai thứ quan trọng nhất của mô hình cho thuê slot:
 *
 *   - Cô lập dữ liệu ở mức slot trên cùng một máy vật lý (BR-003, BR-012, NFR-SEC-04)
 *   - Một máy phục vụ nhiều thương hiệu cùng lúc (NFR-SCA-05)
 *
 * Script idempotent: chạy nhiều lần cho cùng kết quả (mọi INSERT đều ON CONFLICT DO NOTHING với
 * id cố định). Chỉ dùng ở máy dev — không chạy trên môi trường có dữ liệu thật.
 */

import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

/** Id cố định để seed chạy lại được mà không sinh bản trùng. */
const ID = {
  brandA: '11111111-1111-4111-8111-000000000001',
  brandB: '11111111-1111-4111-8111-000000000002',

  roleSuperAdmin: '22222222-2222-4222-8222-000000000001',
  roleOpsStaff: '22222222-2222-4222-8222-000000000002',
  roleInventoryStaff: '22222222-2222-4222-8222-000000000003',
  roleBrandAdmin: '22222222-2222-4222-8222-000000000004',

  userSuperAdmin: '33333333-3333-4333-8333-000000000001',
  userOpsStaff: '33333333-3333-4333-8333-000000000002',
  userInventoryStaff: '33333333-3333-4333-8333-000000000003',
  userBrandAdminA: '33333333-3333-4333-8333-000000000004',
  userBrandAdminB: '33333333-3333-4333-8333-000000000005',

  location: '44444444-4444-4444-8444-000000000001',
  machine: '55555555-5555-4555-8555-000000000001',
  credential: '55555555-5555-4555-8555-000000000009',

  slots: [
    '66666666-6666-4666-8666-000000000001',
    '66666666-6666-4666-8666-000000000002',
    '66666666-6666-4666-8666-000000000003',
    '66666666-6666-4666-8666-000000000004',
  ] as const,

  products: [
    '77777777-7777-4777-8777-000000000001',
    '77777777-7777-4777-8777-000000000002',
    '77777777-7777-4777-8777-000000000003',
    '77777777-7777-4777-8777-000000000004',
  ] as const,

  batches: [
    '88888888-8888-4888-8888-000000000001',
    '88888888-8888-4888-8888-000000000002',
  ] as const,

  bottles: [
    '99999999-9999-4999-8999-000000000001',
    '99999999-9999-4999-8999-000000000002',
    '99999999-9999-4999-8999-000000000003',
    '99999999-9999-4999-8999-000000000004',
  ] as const,

  rentals: [
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  ] as const,
} as const;

/**
 * Bốn slot: 1-2 thuộc Maison Aurore, 3-4 thuộc Nhà Hương Việt.
 * Cùng một máy vật lý, hai thương hiệu không được thấy nhau (BR-012).
 */
const SLOT_PLAN = [
  { slot: 0, brand: ID.brandA, product: 0, bottle: 0, batch: 0, rental: 0, price: '35000.0000' },
  { slot: 1, brand: ID.brandA, product: 1, bottle: 1, batch: 0, rental: 1, price: '42000.0000' },
  { slot: 2, brand: ID.brandB, product: 2, bottle: 2, batch: 1, rental: 2, price: '28000.0000' },
  { slot: 3, brand: ID.brandB, product: 3, bottle: 3, batch: 1, rental: 3, price: '50000.0000' },
] as const;

const PERMISSIONS = [
  ['brand.manage', 'Tạo và cập nhật thương hiệu (FR-BND-01/02/03)'],
  ['user.manage', 'Tạo, khóa và đặt lại mật khẩu tài khoản (FR-USR-01..05)'],
  ['machine.manage', 'Đăng ký và cấu hình máy, slot (FR-MCH-01..06)'],
  ['machine.operate', 'Bật/tắt máy và slot từ xa (FR-MCH-11/12)'],
  ['rental.manage', 'Tạo, gia hạn, chấm dứt, thanh lý hợp đồng (FR-SLT-01..14)'],
  ['rental.request', 'Gửi yêu cầu thuê slot trống (FR-SLT-20)'],
  ['product.manage', 'Quản lý danh mục sản phẩm của thương hiệu mình (FR-PRD-01..05)'],
  ['inventory.manage', 'Nhập lô, đăng ký chai, nạp và tháo chai (FR-INV-01..17)'],
  ['inventory.adjust', 'Điều chỉnh tồn kho kèm lý do (FR-INV-16)'],
  ['refill.request', 'Gửi yêu cầu bổ sung nước hoa (FR-RFQ-01)'],
  ['refill.fulfill', 'Duyệt và lên lịch yêu cầu bổ sung (FR-RFQ-06/07)'],
  ['order.refund', 'Khởi tạo hoàn tiền (FR-ORD-20)'],
  ['dispense.diagnostic', 'Thực hiện lượt xịt chẩn đoán (FR-MNT-09)'],
  ['alert.handle', 'Tiếp nhận, phân công và đóng cảnh báo (FR-ALR-11)'],
  ['maintenance.handle', 'Tạo và xử lý phiếu bảo trì (FR-MNT-01..13)'],
  ['report.brand', 'Xem báo cáo trong phạm vi thương hiệu mình (FR-RPT-08/10)'],
  ['report.platform', 'Xem báo cáo tổng hợp toàn nền tảng (FR-RPT-15)'],
  ['audit.read', 'Tra cứu nhật ký kiểm toán (FR-AUD-10)'],
] as const;

/**
 * Bốn vai trò — không phải năm. Report Viewer đã gộp vào Brand Admin, Operations Manager và
 * Technician đã gộp thành Operations Staff (docs/FR_NFR_SCENTSTATION.md, Phần D).
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  [ID.roleSuperAdmin]: PERMISSIONS.map(([code]) => code),
  [ID.roleOpsStaff]: [
    'machine.operate',
    'alert.handle',
    'maintenance.handle',
    'dispense.diagnostic',
    'order.refund',
    'report.platform',
  ],
  [ID.roleInventoryStaff]: ['inventory.manage', 'inventory.adjust', 'refill.fulfill'],
  [ID.roleBrandAdmin]: ['product.manage', 'rental.request', 'refill.request', 'report.brand'],
};

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL. Sao chép .env.example thành .env trước khi chạy seed.');
  }

  const plainPassword = process.env['SEED_DEFAULT_PASSWORD'];
  if (!plainPassword) {
    throw new Error(
      'Thiếu SEED_DEFAULT_PASSWORD trong .env. Không hardcode mật khẩu trong mã nguồn (NFR-SEC-05).',
    );
  }

  // Băm bằng argon2 theo NFR-SEC-03. Băm một lần rồi dùng lại cho mọi tài khoản mẫu — đây là
  // dữ liệu dev, không phải môi trường thật.
  const passwordHash = await hash(plainPassword);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    await seedBrands(client);
    await seedRolesAndPermissions(client);
    await seedUsers(client, passwordHash);
    await seedLocationAndMachine(client);
    await seedProducts(client);
    await seedInventory(client);
    await seedRentalsAndBottles(client);

    await client.query('COMMIT');

    console.log('Seed xong: 1 máy, 4 slot, 2 thương hiệu mỗi bên 2 slot.');
    console.log('Tài khoản mẫu (mật khẩu lấy từ SEED_DEFAULT_PASSWORD):');
    console.log('  admin@scentstation.local      — Platform Super Admin');
    console.log('  ops@scentstation.local        — Operations Staff');
    console.log('  inventory@scentstation.local  — Inventory Staff');
    console.log('  admin@maison-aurore.local     — Brand Admin (slot 1, 2)');
    console.log('  admin@huong-viet.local        — Brand Admin (slot 3, 4)');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function seedBrands(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO brands (id, code, name, description, status)
     VALUES ($1, 'MAISON_AURORE', 'Maison Aurore', 'Thương hiệu nước hoa Pháp', 'ACTIVE'),
            ($2, 'HUONG_VIET',    'Nhà Hương Việt', 'Thương hiệu nước hoa Việt Nam', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [ID.brandA, ID.brandB],
  );
}

async function seedRolesAndPermissions(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO roles (id, brand_id, code, name, is_system)
     VALUES ($1, NULL, 'PLATFORM_SUPER_ADMIN', 'Platform Super Admin', true),
            ($2, NULL, 'OPERATIONS_STAFF',     'Operations Staff',     true),
            ($3, NULL, 'INVENTORY_STAFF',      'Inventory Staff',      true),
            ($4, NULL, 'BRAND_ADMIN',          'Brand Admin',          true)
     ON CONFLICT (id) DO NOTHING`,
    [ID.roleSuperAdmin, ID.roleOpsStaff, ID.roleInventoryStaff, ID.roleBrandAdmin],
  );

  for (const [code, description] of PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (id, code, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`,
      [randomUUID(), code, description],
    );
  }

  for (const [roleId, codes] of Object.entries(ROLE_PERMISSIONS)) {
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2::varchar[])
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, codes],
    );
  }
}

async function seedUsers(client: pg.Client, passwordHash: string): Promise<void> {
  const users = [
    [ID.userSuperAdmin, null, 'admin@scentstation.local', 'Nguyễn Quản Trị', ID.roleSuperAdmin],
    [ID.userOpsStaff, null, 'ops@scentstation.local', 'Trần Vận Hành', ID.roleOpsStaff],
    [
      ID.userInventoryStaff,
      null,
      'inventory@scentstation.local',
      'Lê Thủ Kho',
      ID.roleInventoryStaff,
    ],
    [ID.userBrandAdminA, ID.brandA, 'admin@maison-aurore.local', 'Phạm Aurore', ID.roleBrandAdmin],
    [ID.userBrandAdminB, ID.brandB, 'admin@huong-viet.local', 'Võ Hương Việt', ID.roleBrandAdmin],
  ] as const;

  for (const [userId, brandId, email, fullName, roleId] of users) {
    await client.query(
      `INSERT INTO users (id, brand_id, email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [userId, brandId, email, passwordHash, fullName],
    );

    await client.query(
      `INSERT INTO user_roles (id, user_id, role_id, scope_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), userId, roleId, brandId === null ? 'PLATFORM' : 'BRAND'],
    );
  }
}

async function seedLocationAndMachine(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO locations (id, code, name, address)
     VALUES ($1, 'HCM_Q1_VINCOM', 'Vincom Đồng Khởi', '72 Lê Thánh Tôn, Quận 1, TP.HCM')
     ON CONFLICT (id) DO NOTHING`,
    [ID.location],
  );

  await client.query(
    `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                           firmware_version, simulator_enabled)
     VALUES ($1, $2, 'M001', 'Máy Vincom Đồng Khởi #1', 'ONLINE', 'NORMAL', '0.1.0-dev', true)
     ON CONFLICT (id) DO NOTHING`,
    [ID.machine, ID.location],
  );

  // Mỗi máy một bộ credential riêng (FR-MCH-02, NFR-SEC-07). Ở đây chỉ là chỗ giữ chỗ cho dev —
  // broker dev đang bật allow_anonymous nên giá trị này chưa được dùng để xác thực.
  await client.query(
    `INSERT INTO device_credentials (id, machine_id, credential_identifier,
                                     public_key_or_secret_hash, status, issued_at)
     VALUES ($1, $2, 'machine-M001', 'seed-placeholder-not-a-real-secret', 'ACTIVE', now())
     ON CONFLICT (id) DO NOTHING`,
    [ID.credential, ID.machine],
  );

  for (const plan of SLOT_PLAN) {
    await client.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                  low_stock_threshold_ml, estimated_remaining_ml,
                                  estimated_remaining_sprays, status)
       VALUES ($1, $2, $3, 0.1200, 5.0000, 48.0000, 400, 'AVAILABLE')
       ON CONFLICT (id) DO NOTHING`,
      [ID.slots[plan.slot], ID.machine, plan.slot + 1],
    );
  }
}

async function seedProducts(client: pg.Client): Promise<void> {
  const products = [
    [ID.products[0], ID.brandA, 'MA-001', 'Aurore Matinale', '35000.0000', '2400000.0000'],
    [ID.products[1], ID.brandA, 'MA-002', 'Aurore Nocturne', '42000.0000', '2900000.0000'],
    [ID.products[2], ID.brandB, 'HV-001', 'Hương Sen Đồng Tháp', '28000.0000', '1500000.0000'],
    [ID.products[3], ID.brandB, 'HV-002', 'Hương Quế Trà Bồng', '50000.0000', '3200000.0000'],
  ] as const;

  for (const [id, brandId, sku, name, defaultPrice, retailPrice] of products) {
    await client.query(
      `INSERT INTO fragrance_products (id, brand_id, sku, name, default_price, currency,
                                       full_bottle_retail_price, full_bottle_volume_ml, status)
       VALUES ($1, $2, $3, $4, $5, 'VND', $6, 50.0000, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [id, brandId, sku, name, defaultPrice, retailPrice],
    );
  }
}

async function seedInventory(client: pg.Client): Promise<void> {
  const batches = [
    [ID.batches[0], ID.brandA, ID.products[0], 'LOT-MA-2026-01', ID.userInventoryStaff],
    [ID.batches[1], ID.brandB, ID.products[2], 'LOT-HV-2026-01', ID.userInventoryStaff],
  ] as const;

  for (const [id, brandId, productId, batchNumber, createdBy] of batches) {
    await client.query(
      `INSERT INTO inventory_batches (id, brand_id, fragrance_product_id, batch_number,
                                      received_at, expires_at, quantity_received, created_by)
       VALUES ($1, $2, $3, $4, now(), now() + interval '18 months', 10, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, brandId, productId, batchNumber, createdBy],
    );
  }
}

async function seedRentalsAndBottles(client: pg.Client): Promise<void> {
  for (const plan of SLOT_PLAN) {
    // Hợp đồng ACTIVE, kỳ hạn 1 năm. Slot bán được, doanh thu thuộc BRAND (spec/glossary.md).
    await client.query(
      `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                                 status, starts_at, ends_at, price_per_spray, currency,
                                 fixed_fee, revenue_share_percent, created_by)
       VALUES ($1, $2, $3, $4, now(), 'ACTIVE',
               now() - interval '30 days', now() + interval '335 days',
               $5, 'VND', 1500000.0000, 10.00, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        ID.rentals[plan.rental],
        ID.slots[plan.slot],
        plan.brand,
        ID.products[plan.product],
        plan.price,
        ID.userSuperAdmin,
      ],
    );

    await client.query(
      `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier,
                            status, initial_volume_ml, current_estimated_ml, empty_weight_g,
                            opened_at, installed_at, expires_at)
       VALUES ($1, $2, 'BRAND', $3, $4, $5, 'INSTALLED', 50.0000, 48.0000, 62.5000,
               now() - interval '30 days', now() - interval '30 days',
               now() + interval '18 months')
       ON CONFLICT (id) DO NOTHING`,
      [
        ID.bottles[plan.bottle],
        plan.brand,
        ID.batches[plan.batch],
        ID.products[plan.product],
        `BTL-${plan.slot + 1}`,
      ],
    );

    // Gắn chai vào slot. uq_slot_active_bottle bảo đảm một chai không lắp ở hai slot (FR-MCH-07).
    await client.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
      ID.bottles[plan.bottle],
      ID.slots[plan.slot],
    ]);
  }
}

await main();
