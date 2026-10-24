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

import { createHash, randomUUID } from 'node:crypto';
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
    '66666666-6666-4666-8666-000000000005',
  ] as const,

  products: [
    '77777777-7777-4777-8777-000000000001',
    '77777777-7777-4777-8777-000000000002',
    '77777777-7777-4777-8777-000000000003',
    '77777777-7777-4777-8777-000000000004',
    '77777777-7777-4777-8777-000000000005',
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
    '99999999-9999-4999-8999-000000000005',
  ] as const,

  rentals: [
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  ] as const,

  /** Một phiên thanh toán đã trả tiền cho mỗi thương hiệu (ADR-0008). */
  checkoutA: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  checkoutB: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
} as const;

/** Phiên thanh toán của từng thương hiệu và Brand Admin đã tạo nó. */
const CHECKOUT_OF: Record<string, { readonly id: string; readonly createdBy: string }> = {
  [ID.brandA]: { id: ID.checkoutA, createdBy: ID.userBrandAdminA },
  [ID.brandB]: { id: ID.checkoutB, createdBy: ID.userBrandAdminB },
};

/** Gói mẫu mà mọi hóa đơn seed đã mua — tên khớp seedRentalCatalog. */
const SEED_PACKAGE = 'Gói 12 tháng';
const SEED_STORAGE_PLAN = 'Cơ bản';

/**
 * Năm slot: 1-2 thuộc Maison Aurore, 3-5 thuộc Nhà Hương Việt.
 * Cùng một máy vật lý, hai thương hiệu không được thấy nhau (BR-012).
 */
const SLOT_PLAN = [
  { slot: 0, brand: ID.brandA, product: 0, bottle: 0, batch: 0, rental: 0, price: '35000.0000' },
  { slot: 1, brand: ID.brandA, product: 1, bottle: 1, batch: 0, rental: 1, price: '42000.0000' },
  { slot: 2, brand: ID.brandB, product: 2, bottle: 2, batch: 1, rental: 2, price: '28000.0000' },
  { slot: 3, brand: ID.brandB, product: 3, bottle: 3, batch: 1, rental: 3, price: '50000.0000' },
  { slot: 4, brand: ID.brandB, product: 4, bottle: 4, batch: 1, rental: 4, price: '55000.0000' },
] as const;

const PERMISSIONS = [
  ['brand.manage', 'Tạo và cập nhật thương hiệu (FR-BND-01/02/03)'],
  ['user.manage', 'Tạo, khóa và đặt lại mật khẩu tài khoản (FR-USR-01..05)'],
  ['machine.manage', 'Đăng ký và cấu hình máy, slot (FR-MCH-01..06)'],
  ['machine.view', 'Xem danh sách và chi tiết máy, slot (FR-MCH-08..10)'],
  ['machine.operate', 'Bật/tắt máy và slot từ xa (FR-MCH-11/12)'],
  ['rental.manage', 'Tạo, gia hạn, chấm dứt, thanh lý hợp đồng (FR-SLT-01..14)'],
  ['rental.request', 'Gửi yêu cầu thuê slot trống (FR-SLT-20)'],
  ['product.manage', 'Quản lý danh mục sản phẩm của thương hiệu mình (FR-PRD-01..05)'],
  ['inventory.manage', 'Nhập lô, đăng ký chai, nạp và tháo chai (FR-INV-01..17)'],
  ['inventory.adjust', 'Điều chỉnh tồn kho kèm lý do (FR-INV-16)'],
  ['refill.request', 'Gửi yêu cầu bổ sung nước hoa (FR-RFQ-01)'],
  ['refill.fulfill', 'Duyệt và lên lịch yêu cầu bổ sung (FR-RFQ-06/07)'],
  [
    'order.view',
    'Tra cứu đơn hàng và lịch sử trạng thái trong phạm vi của mình (FR-ORD-18, FR-ORD-22)',
  ],
  ['order.refund', 'Khởi tạo hoàn tiền (FR-ORD-20)'],
  ['dispense.diagnostic', 'Thực hiện lượt xịt chẩn đoán (FR-MNT-09)'],
  ['alert.handle', 'Tiếp nhận, phân công và đóng cảnh báo (FR-ALR-11)'],
  ['maintenance.handle', 'Tạo và xử lý phiếu bảo trì (FR-MNT-01..13)'],
  ['report.brand', 'Xem báo cáo trong phạm vi thương hiệu mình (FR-RPT-08/10)'],
  ['report.platform', 'Xem báo cáo tổng hợp toàn nền tảng (FR-RPT-15)'],
  [
    'revenue.manage',
    'Chuyển kỳ chi trả sang PAID, trả lời khiếu nại, xem doanh thu tách hai nguồn (FR-SLT-53, 54, FR-REV-04)',
  ],
  ['audit.read', 'Tra cứu nhật ký kiểm toán (FR-AUD-10)'],
] as const;

/**
 * Bốn vai trò — không phải năm. Report Viewer đã gộp vào Brand Admin, Operations Manager và
 * Technician đã gộp thành Operations Staff (docs/FR_NFR_SCENTSTATION.md, Phần D).
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  [ID.roleSuperAdmin]: PERMISSIONS.map(([code]) => code),
  [ID.roleOpsStaff]: [
    'machine.view',
    'machine.operate',
    'alert.handle',
    'maintenance.handle',
    'dispense.diagnostic',
    'order.view',
    'order.refund',
    'report.platform',
  ],
  [ID.roleInventoryStaff]: [
    'inventory.manage',
    'inventory.adjust',
    'refill.fulfill',
    'machine.view',
  ],
  [ID.roleBrandAdmin]: [
    'product.manage',
    'rental.request',
    'refill.request',
    'report.brand',
    'order.view',
  ],
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
    // Danh mục gói trước: hóa đơn seed chụp giá từ gói thuê, gói bảo quản và giá niêm yết slot.
    await seedRentalCatalog(client);
    await seedRentalsAndBottles(client);
    await seedAgreementVersions(client);
    await seedNotifications(client);

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

  // Máy và slot trống mở cho thuê (để test tính năng thuê slot)
  const locLandmark = '44444444-4444-4444-8444-000000000002';
  const machM002 = '55555555-5555-4555-8555-000000000002';
  const machM003 = '55555555-5555-4555-8555-000000000003';

  await client.query(
    `INSERT INTO locations (id, code, name, address)
     VALUES ($1, 'HCM_BTH_LANDMARK81', 'Vincom Landmark 81', '208 Nguyễn Hữu Cảnh, Quận Bình Thạnh, TP.HCM')
     ON CONFLICT (id) DO NOTHING`,
    [locLandmark],
  );

  await client.query(
    `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                           firmware_version, simulator_enabled)
     VALUES ($1, $2, 'M002', 'Máy Landmark 81 #1', 'ONLINE', 'NORMAL', '0.1.0-dev', true),
            ($3, $4, 'M003', 'Máy Vincom Đồng Khởi #2', 'ONLINE', 'NORMAL', '0.1.0-dev', true)
     ON CONFLICT (id) DO NOTHING`,
    [machM002, locLandmark, machM003, ID.location],
  );

  const m002Slots = [
    '66666666-6666-4666-8666-000000000011',
    '66666666-6666-4666-8666-000000000012',
    '66666666-6666-4666-8666-000000000013',
    '66666666-6666-4666-8666-000000000014',
  ];
  for (let i = 0; i < 4; i++) {
    await client.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                  low_stock_threshold_ml, estimated_remaining_ml,
                                  estimated_remaining_sprays, monthly_rent_price, status)
       VALUES ($1, $2, $3, 0.1200, 5.0000, 50.0000, 0, '1800000.0000', 'AVAILABLE')
       ON CONFLICT (id) DO UPDATE SET monthly_rent_price = EXCLUDED.monthly_rent_price`,
      [m002Slots[i], machM002, i + 1],
    );
  }

  const m003Slots = [
    '66666666-6666-4666-8666-000000000021',
    '66666666-6666-4666-8666-000000000022',
    '66666666-6666-4666-8666-000000000023',
    '66666666-6666-4666-8666-000000000024',
  ];
  for (let i = 0; i < 4; i++) {
    await client.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                  low_stock_threshold_ml, estimated_remaining_ml,
                                  estimated_remaining_sprays, monthly_rent_price, status)
       VALUES ($1, $2, $3, 0.1200, 5.0000, 50.0000, 0, '1500000.0000', 'AVAILABLE')
       ON CONFLICT (id) DO UPDATE SET monthly_rent_price = EXCLUDED.monthly_rent_price`,
      [m003Slots[i], machM003, i + 1],
    );
  }
}

/**
 * Bảng giá thuê slot (FR-SLT-30..32, ADR-0006): 3 gói thuê, 3 gói bảo quản, giá niêm yết 4 slot.
 * Giá trị theo đề xuất của ADR-0006 — là DỮ LIỆU danh mục, Super Admin sửa được, không phải hằng
 * ngưỡng (spec/constraints.md).
 *
 * Idempotent theo tên gói; giá slot chỉ đặt khi còn NULL để không ghi đè giá Super Admin đã sửa.
 */
async function seedRentalCatalog(client: pg.Client): Promise<void> {
  const packages = [
    ['Gói 3 tháng', 3, '0'],
    ['Gói 6 tháng', 6, '5'],
    ['Gói 12 tháng', 12, '10'],
  ] as const;
  for (const [name, months, discount] of packages) {
    await client.query(
      `INSERT INTO rental_packages (name, duration_months, discount_percent)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [name, months, discount],
    );
  }

  const plans = [
    ['Cơ bản', 'Bồi thường 30% giá bán lẻ chai hư hỏng', '100000.0000', '30', '3000000.0000'],
    ['Tiêu chuẩn', 'Bồi thường 60% giá bán lẻ chai hư hỏng', '200000.0000', '60', '6000000.0000'],
    ['Toàn diện', 'Bồi thường 100% giá bán lẻ chai hư hỏng', '350000.0000', '100', '10000000.0000'],
  ] as const;
  for (const [name, description, monthlyPrice, coverage, cap] of plans) {
    await client.query(
      `INSERT INTO storage_plans (name, description, monthly_price, coverage_percent, coverage_cap)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [name, description, monthlyPrice, coverage, cap],
    );
  }

  // Bốn slot mẫu đang được thuê nên chưa hiện trong danh sách slot trống; giá có sẵn để khi một
  // hóa đơn kết thúc thì slot quay lại thị trường ngay (FR-SLT-19).
  const rentPrices = [
    '1500000.0000',
    '1500000.0000',
    '1200000.0000',
    '1200000.0000',
    '1200000.0000',
  ];
  for (const [index, price] of rentPrices.entries()) {
    await client.query(
      `UPDATE machine_slots SET monthly_rent_price = $2
        WHERE id = $1 AND monthly_rent_price IS NULL`,
      [ID.slots[index], price],
    );
  }
}

async function seedProducts(client: pg.Client): Promise<void> {
  const products = [
    [
      ID.products[0],
      ID.brandA,
      'MA-001',
      'Aurore Matinale',
      '35000.0000',
      '2400000.0000',
      'Hương thơm sớm mai thanh khiết kết hợp cam bergamote và hoa cỏ Grasse, mang lại nguồn năng lượng tươi mới.',
    ],
    [
      ID.products[1],
      ID.brandA,
      'MA-002',
      'Aurore Nocturne',
      '42000.0000',
      '2900000.0000',
      'Hòa quyện tinh tế giữa hổ phách phương Đông và da thuộc đen sang trọng, gợi mở chiều sâu bí ẩn đầy lôi cuốn.',
    ],
    [
      ID.products[2],
      ID.brandB,
      'HV-001',
      'Hương Sen Đồng Tháp',
      '28000.0000',
      '1500000.0000',
      'Nốt hương hoa sen thanh tao thuần khiết buổi sớm, hòa quyện hương phù sa mộc mạc và sương mai dịu nhẹ, mang lại cảm giác an yên, thoát tục.',
    ],
    [
      ID.products[3],
      ID.brandB,
      'HV-002',
      'Hương Quế Trà Bồng',
      '50000.0000',
      '3200000.0000',
      'Hương quế cay ấm nồng nàn đặc trưng của đại ngàn Trà Bồng, đan xen thảo mộc núi rừng tạo nên chiều sâu nồng ấm và lôi cuốn.',
    ],
    [
      ID.products[4],
      ID.brandB,
      'HV-003',
      'Trầm Hương Khánh Hòa',
      '55000.0000',
      '3500000.0000',
      'Tuyệt tác trầm hương thượng hạng từ xứ Trầm Khánh Hòa, lắng đọng khói sương huyền ảo mang lại sự tĩnh tại, tôn quý.',
    ],
  ] as const;

  for (const [id, brandId, sku, name, defaultPrice, retailPrice, description] of products) {
    await client.query(
      `INSERT INTO fragrance_products (id, brand_id, sku, name, default_price, currency,
                                       full_bottle_retail_price, full_bottle_volume_ml, description, status)
       VALUES ($1, $2, $3, $4, $5, 'VND', $6, 50.0000, $7, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description`,
      [id, brandId, sku, name, defaultPrice, retailPrice, description],
    );
  }
}

async function seedInventory(client: pg.Client): Promise<void> {
  const batches = [
    [
      ID.batches[0],
      ID.brandA,
      ID.products[0],
      'LOT-MA-2026-01',
      ID.userInventoryStaff,
      JSON.stringify({
        authenticityStatus: 'PENDING',
        documentUrl: 'https://example.com/docs/coo-ma-2026.pdf',
        documentType: 'CERTIFICATE_OF_ORIGIN',
      }),
    ],
    [
      ID.batches[1],
      ID.brandB,
      ID.products[2],
      'LOT-HV-2026-01',
      ID.userInventoryStaff,
      JSON.stringify({
        authenticityStatus: 'APPROVED',
        documentUrl: 'https://example.com/docs/coo-hv-2026.pdf',
        documentType: 'CERTIFICATE_OF_ORIGIN',
      }),
    ],
  ] as const;

  for (const [id, brandId, productId, batchNumber, createdBy, supplierInfo] of batches) {
    await client.query(
      `INSERT INTO inventory_batches (id, brand_id, fragrance_product_id, batch_number,
                                      received_at, expires_at, quantity_received, supplier_info, created_by)
       VALUES ($1, $2, $3, $4, now(), now() + interval '18 months', 10, $5::jsonb, $6)
       ON CONFLICT (id) DO UPDATE SET supplier_info = EXCLUDED.supplier_info`,
      [id, brandId, productId, batchNumber, supplierInfo, createdBy],
    );
  }

  // Khai báo gửi hàng mẫu (FR-INV-22..25)
  await client.query(
    `INSERT INTO brand_shipment_declarations (id, brand_id, fragrance_product_id, declared_quantity,
                                             declared_bottle_volume_ml, expected_ship_date, status, declared_by)
     VALUES ('eeeeeeee-eeee-4eee-8eee-000000000001', $1, $2, 12, 50.0000, current_date + interval '3 days', 'DECLARED', $3)
     ON CONFLICT (id) DO NOTHING`,
    [ID.brandA, ID.products[0], ID.userBrandAdminA],
  );

  await client.query(
    `INSERT INTO brand_shipment_declarations (id, brand_id, fragrance_product_id, declared_quantity,
                                             declared_bottle_volume_ml, expected_ship_date, status,
                                             received_quantity, discrepancy_notes, received_at, received_by, declared_by)
     VALUES ('eeeeeeee-eeee-4eee-8eee-000000000002', $1, $2, 10, 50.0000, current_date - interval '2 days', 'DISCREPANCY',
             9, 'Hao hụt 1 chai do va đập trong quá trình vận chuyển', now() - interval '1 day', $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [ID.brandA, ID.products[1], ID.userInventoryStaff, ID.userBrandAdminA],
  );

  // Chai dự phòng trong kho sẵn sàng nạp máy (status = IN_STOCK)
  await client.query(
    `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier,
                          status, initial_volume_ml, current_estimated_ml, empty_weight_g,
                          opened_at, installed_at, expires_at)
     VALUES ('99999999-9999-4999-8999-000000000009', $1, 'BRAND', $2, $3, 'BTL-MA-SPARE-01',
             'IN_STOCK', 50.0000, 50.0000, 62.5000, NULL, NULL, now() + interval '18 months')
     ON CONFLICT (id) DO NOTHING`,
    [ID.brandA, ID.batches[0], ID.products[0]],
  );

  // Cập nhật đóng phiếu cũ cho DB đã seed (W7-19: tránh phiếu STARTED làm dừng bán kiosk M001)
  await client.query(
    `UPDATE refill_sessions
     SET status = 'CANCELLED', completed_at = now()
     WHERE id = 'ffffffff-ffff-4fff-8fff-000000000001' AND status = 'STARTED'`,
  );
}

/** Ảnh chụp giá của một hóa đơn seed — đúng công thức SltService (FR-SLT-33, FR-SLT-36). */
interface RentalSnapshot {
  readonly monthlyRentPrice: string;
  readonly rentAmount: string;
  readonly storageAmount: string;
  readonly totalAmount: string;
}

/**
 * Hóa đơn seed theo mô hình mua gói (ADR-0006, ADR-0008): mỗi thương hiệu một phiên thanh toán đã
 * trả tiền, mỗi slot một hóa đơn ACTIVE đủ bộ chụp giá, số hóa đơn và `paid_at` — để Brand Admin cấu
 * hình được sản phẩm và giá (FR-SLT-27, FR-SLT-08 chỉ cho hóa đơn đã thanh toán).
 *
 * DB đã seed theo mô hình cũ (không gói, không `paid_at`) được nâng cấp tại chỗ: chạy lại
 * `make seed` là đủ, không cần reset. Giá lượt xịt và sản phẩm đã cấu hình được giữ nguyên.
 */
async function seedRentalsAndBottles(client: pg.Client): Promise<void> {
  const pkg = (
    await client.query<{ id: string; duration_months: number; discount_percent: string }>(
      `SELECT id, duration_months, discount_percent FROM rental_packages WHERE name = $1`,
      [SEED_PACKAGE],
    )
  ).rows[0];
  const storage = (
    await client.query<{
      id: string;
      monthly_price: string;
      coverage_percent: string;
      coverage_cap: string;
    }>(
      `SELECT id, monthly_price, coverage_percent, coverage_cap FROM storage_plans WHERE name = $1`,
      [SEED_STORAGE_PLAN],
    )
  ).rows[0];
  if (!pkg || !storage) throw new Error('Thiếu gói mẫu — seedRentalCatalog phải chạy trước');

  const snapshots = new Map<string, RentalSnapshot>();
  for (const plan of SLOT_PLAN) {
    const slot = await client.query<{ monthly_rent_price: string }>(
      `SELECT monthly_rent_price FROM machine_slots WHERE id = $1`,
      [ID.slots[plan.slot]],
    );
    const monthlyRent = Number(slot.rows[0]?.monthly_rent_price);
    const duration = pkg.duration_months;
    const rent = monthlyRent * duration * (1 - Number(pkg.discount_percent) / 100);
    const store = Number(storage.monthly_price) * duration;
    snapshots.set(ID.rentals[plan.rental], {
      monthlyRentPrice: monthlyRent.toFixed(4),
      rentAmount: rent.toFixed(4),
      storageAmount: store.toFixed(4),
      totalAmount: (rent + store).toFixed(4),
    });
  }

  // Phiên trước, hóa đơn sau; constraint trigger §10d kiểm tổng tiền và trạng thái lúc COMMIT.
  for (const [brandId, checkout] of Object.entries(CHECKOUT_OF)) {
    const total = SLOT_PLAN.filter((p) => p.brand === brandId)
      .map((p) => Number(snapshots.get(ID.rentals[p.rental])?.totalAmount))
      .reduce((a, b) => a + b, 0);
    await client.query(
      `INSERT INTO rental_checkouts (id, brand_id, currency, total_amount, hold_expires_at, paid_at,
                                     created_by, created_at, agreement_version_id)
       VALUES ($1, $2, 'VND', $3, now() - interval '31 days' + interval '15 minutes',
               now() - interval '31 days', $4, now() - interval '31 days', NULL)
       ON CONFLICT (id) DO NOTHING`,
      [checkout.id, brandId, total.toFixed(4), checkout.createdBy],
    );
  }

  for (const plan of SLOT_PLAN) {
    const snap = snapshots.get(ID.rentals[plan.rental]) as RentalSnapshot;
    // ACTIVE từ 30 ngày trước, đã lắp chai. Slot bán được, doanh thu thuộc BRAND (spec/glossary.md).
    // Hàng cũ chưa có gói (mô hình trước ADR-0006) → điền gói, chụp giá, phiên và số hóa đơn.
    await client.query(
      `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                                 status, starts_at, ends_at, price_per_spray, currency, created_by,
                                 invoice_number, rental_package_id, storage_plan_id, duration_months,
                                 monthly_rent_price, discount_percent, storage_monthly_price,
                                 storage_coverage_percent, storage_coverage_cap, rent_amount,
                                 storage_amount, total_amount, paid_at, checkout_id)
       VALUES ($1, $2, $3, $4, now(), 'ACTIVE',
               now() - interval '30 days', now() - interval '30 days' + interval '12 months',
               $5, 'VND', $6,
               $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               now() - interval '31 days', $19)
       ON CONFLICT (id) DO UPDATE SET
           fixed_fee = 0, revenue_share_percent = 0,
           invoice_number = EXCLUDED.invoice_number,
           rental_package_id = EXCLUDED.rental_package_id,
           storage_plan_id = EXCLUDED.storage_plan_id,
           duration_months = EXCLUDED.duration_months,
           monthly_rent_price = EXCLUDED.monthly_rent_price,
           discount_percent = EXCLUDED.discount_percent,
           storage_monthly_price = EXCLUDED.storage_monthly_price,
           storage_coverage_percent = EXCLUDED.storage_coverage_percent,
           storage_coverage_cap = EXCLUDED.storage_coverage_cap,
           rent_amount = EXCLUDED.rent_amount,
           storage_amount = EXCLUDED.storage_amount,
           total_amount = EXCLUDED.total_amount,
           paid_at = EXCLUDED.paid_at,
           checkout_id = EXCLUDED.checkout_id
         WHERE slot_rentals.rental_package_id IS NULL`,
      [
        ID.rentals[plan.rental],
        ID.slots[plan.slot],
        plan.brand,
        ID.products[plan.product],
        plan.price,
        CHECKOUT_OF[plan.brand]?.createdBy,
        `HD-SEED-${String(plan.rental + 1).padStart(6, '0')}`,
        pkg.id,
        storage.id,
        pkg.duration_months,
        snap.monthlyRentPrice,
        pkg.discount_percent,
        storage.monthly_price,
        storage.coverage_percent,
        storage.coverage_cap,
        snap.rentAmount,
        snap.storageAmount,
        snap.totalAmount,
        CHECKOUT_OF[plan.brand]?.id,
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

async function seedNotifications(client: pg.Client): Promise<void> {
  const notifs = [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
      brandId: ID.brandA,
      recipientUserId: ID.userBrandAdminA,
      type: 'RENTAL_CHECKOUT_PAID',
      channel: 'EMAIL',
      subject:
        '[ScentStation] Xác nhận thanh toán thuê slot thành công (HD-SEED-000001, HD-SEED-000002)',
      content: `Kính gửi Quý đối tác Maison Aurore,

Phiên thanh toán thuê slot của quý thương hiệu đã được hệ thống ScentStation xác nhận thành công.
- Mã phiên thanh toán: ${ID.checkoutA}
- Danh sách mã hóa đơn: HD-SEED-000001, HD-SEED-000002
- Thời điểm thanh toán: 2026-10-20 14:30:00 (Asia/Ho_Chi_Minh)

Các bước tiếp theo cần thực hiện:
1. Khai báo lô hàng gửi kho tại cổng quản trị thương hiệu (FR-INV-22).
2. Sau khi kho tiếp nhận và đối soát tem kiểm định, chai nước hoa sẽ được nạp vào các slot đã thuê.
3. Cấu hình slot và cài đặt giá trải nghiệm để sẵn sàng phục vụ khách hàng tại Kiosk.

Thông báo này được lưu trữ trong cơ sở dữ liệu làm bằng chứng đối soát pháp lý (FR-ALR-16, ADR-0013).

Trân trọng,
Hệ thống Quản trị ScentStation`,
      status: 'PENDING',
      sentAt: null,
      readAt: null,
      createdAt: "now() - interval '2 days'",
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
      brandId: ID.brandA,
      recipientUserId: ID.userBrandAdminA,
      type: 'ALERT_SLOT_LOW_VOLUME',
      channel: 'EMAIL',
      subject: '[ScentStation] Cảnh báo dung tích chai nước hoa BTL-1 sắp cạn',
      content: `Kính gửi Quý đối tác Maison Aurore,

Hệ thống phát hiện chai nước hoa BTL-1 tại Kiosk Crescent Mall (Slot 1) có dung tích ước tính còn dưới 10% (4.8ml).
Vui lòng chuẩn bị chai bổ sung và tạo yêu cầu nạp hàng để tránh gián đoạn dịch vụ.

Thông báo này được ghi nhận làm bằng chứng đối soát vận hành (FR-ALR-16).

Trân trọng,
Hệ thống Vận hành ScentStation`,
      status: 'FAILED',
      sentAt: null,
      readAt: null,
      createdAt: "now() - interval '1 day'",
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000003',
      brandId: ID.brandA,
      recipientUserId: ID.userBrandAdminA,
      type: 'RENTAL_CHECKOUT_PAID',
      channel: 'IN_APP',
      subject: 'Thanh toán thuê slot đã được ghi nhận',
      content: `Phiên thanh toán thuê slot ${ID.checkoutA} đã được xác nhận thành công. Hóa đơn điện tử và chứng từ đối soát đã được lưu trữ.`,
      status: 'READ',
      sentAt: "now() - interval '2 days'",
      readAt: "now() - interval '2 days'",
      createdAt: "now() - interval '2 days'",
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000004',
      brandId: ID.brandB,
      recipientUserId: ID.userBrandAdminB,
      type: 'RENTAL_CHECKOUT_PAID',
      channel: 'EMAIL',
      subject: '[ScentStation] Xác nhận đối soát phiên thanh toán Nhà Hương Việt (HD-SEED-000003)',
      content: `Kính gửi Quý đối tác Nhà Hương Việt,

Phiên thanh toán thuê slot của quý thương hiệu đã được hệ thống ScentStation xác nhận thành công.
- Mã phiên thanh toán: ${ID.checkoutB}
- Danh sách mã hóa đơn: HD-SEED-000003

Thông báo này được lưu trữ trong cơ sở dữ liệu làm bằng chứng đối soát pháp lý (FR-ALR-16, ADR-0013).

Trân trọng,
Hệ thống Quản trị ScentStation`,
      status: 'FAILED',
      sentAt: null,
      readAt: null,
      createdAt: "now() - interval '1 day'",
    },
  ];

  for (const n of notifs) {
    await client.query(
      `INSERT INTO notifications (id, brand_id, recipient_user_id, type, channel, subject, content, status, sent_at, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${n.sentAt ?? 'NULL'}, ${n.readAt ?? 'NULL'}, ${n.createdAt})
       ON CONFLICT (id) DO NOTHING`,
      [n.id, n.brandId, n.recipientUserId, n.type, n.channel, n.subject, n.content, n.status],
    );
  }
}

async function seedAgreementVersions(client: pg.Client): Promise<void> {
  const content = `HỢP ĐỒNG KHUNG CUNG CẤP DỊCH VỤ THUÊ SLOT MÁY TRẢI NGHIỆM NƯỚC HOA SCENTSTATION

Phiên bản: v1.0
Áp dụng cho: Mọi thương hiệu đối tác tham gia thuê slot trên hệ sinh thái ScentStation.

ĐIỀU 1: ĐỐI TƯỢNG VÀ PHẠM VI DỊCH VỤ
Nền tảng ScentStation cung cấp hệ thống máy kiosk trải nghiệm nước hoa thông minh đặt tại các địa điểm thương mại. Thương hiệu thuê vị trí slot trên máy để trưng bày và cho khách hàng trải nghiệm sản phẩm nước hoa dạng xịt định lượng tự động.

ĐIỀU 2: QUYỀN VÀ NGHĨA VỤ CỦA THƯƠNG HIỆU
1. Thương hiệu chịu trách nhiệm về chất lượng, nguồn gốc xuất xứ và độ an toàn của sản phẩm nước hoa nạp vào slot.
2. Thương hiệu thanh toán đầy đủ phí thuê slot và phí dịch vụ bảo quản hàng hóa theo từng phiên thanh toán.
3. Thương hiệu có quyền đổi slot cùng máy trong vòng 48 giờ sau khi thanh toán nếu slot chưa được lắp chai.

ĐIỀU 3: BẢO VỆ DỮ LIỆU VÀ CÔ LẬP
Hệ thống bảo đảm dữ liệu doanh thu, lượt xịt và cấu hình slot của từng thương hiệu được cô lập hoàn toàn, không thể bị truy cập bởi các thương hiệu khác cùng đặt máy.`;

  const hash = createHash('sha256').update(content, 'utf8').digest('hex');

  await client.query(
    `INSERT INTO agreement_versions (id, version, title, content, content_hash, is_current, published_at, created_by)
     VALUES ('cccccccc-cccc-4ccc-8ccc-000000000001', 'v1.0', 'Hợp đồng khung cung cấp dịch vụ ScentStation', $1, $2, true, now(), $3)
     ON CONFLICT (version) DO UPDATE
     SET content = EXCLUDED.content,
         content_hash = EXCLUDED.content_hash,
         is_current = true`,
    [content, hash, ID.userSuperAdmin],
  );
}

await main();
