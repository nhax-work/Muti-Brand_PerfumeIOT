/**
 * Script bổ sung máy và slot trống mở cho thuê cho môi trường dev.
 *
 * Tạo thêm:
 * - Location 2: Landmark 81 (HCM_BTH_LANDMARK81)
 * - Machine M002: Máy Landmark 81 #1 (4 slots AVAILABLE, chưa ai thuê, có giá niêm yết)
 * - Machine M003: Máy Vincom Đồng Khởi #2 (4 slots AVAILABLE, chưa ai thuê, có giá niêm yết)
 *
 * Script idempotent: an toàn khi chạy nhiều lần.
 */

import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

const EXTRA_IDS = {
  locationLandmark: '44444444-4444-4444-8444-000000000002',
  locationVincom: '44444444-4444-4444-8444-000000000001',
  machineM002: '55555555-5555-4555-8555-000000000002',
  machineM003: '55555555-5555-4555-8555-000000000003',
  credentialM002: '55555555-5555-4555-8555-000000000010',
  credentialM003: '55555555-5555-4555-8555-000000000011',
  m002Slots: [
    '66666666-6666-4666-8666-000000000011',
    '66666666-6666-4666-8666-000000000012',
    '66666666-6666-4666-8666-000000000013',
    '66666666-6666-4666-8666-000000000014',
  ] as const,
  m003Slots: [
    '66666666-6666-4666-8666-000000000021',
    '66666666-6666-4666-8666-000000000022',
    '66666666-6666-4666-8666-000000000023',
    '66666666-6666-4666-8666-000000000024',
  ] as const,
};

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL trong .env.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Thêm địa điểm Landmark 81
    await client.query(
      `INSERT INTO locations (id, code, name, address)
       VALUES ($1, 'HCM_BTH_LANDMARK81', 'Vincom Landmark 81', '208 Nguyễn Hữu Cảnh, Quận Bình Thạnh, TP.HCM')
       ON CONFLICT (id) DO NOTHING`,
      [EXTRA_IDS.locationLandmark],
    );

    // 2. Thêm máy M002 tại Landmark 81
    await client.query(
      `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                             firmware_version, simulator_enabled)
       VALUES ($1, $2, 'M002', 'Máy Landmark 81 #1', 'ONLINE', 'NORMAL', '0.1.0-dev', true)
       ON CONFLICT (id) DO NOTHING`,
      [EXTRA_IDS.machineM002, EXTRA_IDS.locationLandmark],
    );

    await client.query(
      `INSERT INTO device_credentials (id, machine_id, credential_identifier,
                                       public_key_or_secret_hash, status, issued_at)
       VALUES ($1, $2, 'machine-M002', 'seed-placeholder-not-a-real-secret', 'ACTIVE', now())
       ON CONFLICT (id) DO NOTHING`,
      [EXTRA_IDS.credentialM002, EXTRA_IDS.machineM002],
    );

    // 3. Thêm máy M003 tại Vincom Đồng Khởi
    await client.query(
      `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                             firmware_version, simulator_enabled)
       VALUES ($1, $2, 'M003', 'Máy Vincom Đồng Khởi #2', 'ONLINE', 'NORMAL', '0.1.0-dev', true)
       ON CONFLICT (id) DO NOTHING`,
      [EXTRA_IDS.machineM003, EXTRA_IDS.locationVincom],
    );

    await client.query(
      `INSERT INTO device_credentials (id, machine_id, credential_identifier,
                                       public_key_or_secret_hash, status, issued_at)
       VALUES ($1, $2, 'machine-M003', 'seed-placeholder-not-a-real-secret', 'ACTIVE', now())
       ON CONFLICT (id) DO NOTHING`,
      [EXTRA_IDS.credentialM003, EXTRA_IDS.machineM003],
    );

    // 4. Thêm 4 slot trống cho máy M002 kèm giá niêm yết
    const pricesM002 = ['1800000.0000', '1800000.0000', '1600000.0000', '1600000.0000'];
    for (let i = 0; i < 4; i++) {
      await client.query(
        `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                    low_stock_threshold_ml, estimated_remaining_ml,
                                    estimated_remaining_sprays, monthly_rent_price, status)
         VALUES ($1, $2, $3, 0.1200, 5.0000, 50.0000, 0, $4, 'AVAILABLE')
         ON CONFLICT (id) DO UPDATE SET monthly_rent_price = EXCLUDED.monthly_rent_price`,
        [EXTRA_IDS.m002Slots[i], EXTRA_IDS.machineM002, i + 1, pricesM002[i]],
      );
    }

    // 5. Thêm 4 slot trống cho máy M003 kèm giá niêm yết
    const pricesM003 = ['1500000.0000', '1500000.0000', '1400000.0000', '1400000.0000'];
    for (let i = 0; i < 4; i++) {
      await client.query(
        `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                    low_stock_threshold_ml, estimated_remaining_ml,
                                    estimated_remaining_sprays, monthly_rent_price, status)
         VALUES ($1, $2, $3, 0.1200, 5.0000, 50.0000, 0, $4, 'AVAILABLE')
         ON CONFLICT (id) DO UPDATE SET monthly_rent_price = EXCLUDED.monthly_rent_price`,
        [EXTRA_IDS.m003Slots[i], EXTRA_IDS.machineM003, i + 1, pricesM003[i]],
      );
    }

    await client.query('COMMIT');
    console.log('✅ Đã tạo thêm 2 máy mới (M002 Landmark 81, M003 Vincom Đồng Khởi) với tổng cộng 8 slot trống mở cho thuê!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

await main();
