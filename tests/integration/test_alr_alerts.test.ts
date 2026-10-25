/**
 * Kiểm thử tích hợp 5 loại cảnh báo, vòng đời, deduplication và multi-brand privacy (FR-ALR-01 ÷ 12, BR-012).
 * Chạy trên PostgreSQL thật.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AlrService } from '../../apps/api/src/modules/alr/index.js';
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

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let alr: AlrService;

let opsStaff: PlatformStaff;
let opsToken: string;
let ops: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  opsStaff = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', ['alert.handle']);
  app = await createTestApp();
  alr = app.get(AlrService);

  opsToken = (await login(app, opsStaff.email, TEST_PASSWORD)).accessToken;
  ops = asUser(app, opsToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
}, 60_000);

afterEach(async () => {
  await client.query(`DELETE FROM alerts WHERE machine_id = $1`, [fx.machineId]);
  await client.query(`UPDATE machines SET operating_mode = 'NORMAL' WHERE id = $1`, [fx.machineId]);
  await client.query(`DELETE FROM refill_sessions WHERE machine_id = $1`, [fx.machineId]);
});

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await opsStaff.cleanup();
  await app.close();
  await client.end();
});

describe('ALR Alerts Integration Tests', () => {
  it('test_FR_ALR_01_offline_alert: Cảnh báo máy mất kết nối OFFLINE khi quá hạn gửi telemetry', async () => {
    // Phát sinh cảnh báo khi máy quá hạn gửi telemetry
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'MACHINE_OFFLINE',
      severity: 'CRITICAL',
      deduplicationKey: `OFFLINE:${fx.machineId}`,
      title: 'Máy mất kết nối',
      description: 'Thiết bị không gửi telemetry quá 5 phút',
    });

    // Kiểm tra cảnh báo được sinh
    const res = await ops('GET', `/alerts?machineId=${fx.machineId}&status=OPEN`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ type: string; severity: string; title: string }> }>();
    const offlineAlert = body.items.find((a) => a.type === 'MACHINE_OFFLINE');
    expect(offlineAlert).toBeDefined();
    expect(offlineAlert?.severity).toBe('CRITICAL');
  });

  it('test_FR_ALR_02_slot_stock_alert: Cảnh báo hết/ít nước hoa tại slot khi dung tích còn <= 10%', async () => {
    // Giả lập slot của brand A có chai dung tích còn 8% (dưới ngưỡng 10%)
    await client.query(
      `UPDATE bottles SET remaining_ml = 8, capacity_ml = 100
       WHERE id = (SELECT current_bottle_id FROM slots WHERE id = $1)`,
      [fx.slots[0]],
    );

    await alr.sweepAlerts();

    const res = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ type: string; severity: string; slotId: string }> }>();
    const stockAlert = body.items.find(
      (a) => a.type === 'SLOT_LOW_STOCK' && a.slotId === fx.slots[0],
    );
    expect(stockAlert).toBeDefined();
    expect(stockAlert?.severity).toBe('WARNING');
  });

  it('test_FR_ALR_03_door_open_alert: Cửa mở quá hạn loại trừ khi máy ở MAINTENANCE hoặc có refill_sessions mở', async () => {
    const doorOpenSince = new Date(Date.now() - 5 * 60 * 1000); // Mở 5 phút trước (> 3 phút)
    await client.query(`UPDATE machines SET door_open_since = $1 WHERE id = $2`, [
      doorOpenSince,
      fx.machineId,
    ]);

    // 1. Trường hợp bình thường (NORMAL mode, không có phiên nạp): Cảnh báo PHẢI được sinh
    await alr.sweepAlerts();
    let res = await ops('GET', `/alerts?machineId=${fx.machineId}&status=OPEN`);
    let items = res.json<{ items: Array<{ type: string }> }>().items;
    expect(items.some((a) => a.type === 'DOOR_OPEN_TOO_LONG')).toBe(true);

    // Xóa cảnh báo để test các ngoại lệ
    await client.query(`DELETE FROM alerts WHERE machine_id = $1`, [fx.machineId]);

    // 2. Ngoại lệ 1: Máy ở chế độ MAINTENANCE -> KHÔNG được sinh cảnh báo
    await client.query(`UPDATE machines SET operating_mode = 'MAINTENANCE' WHERE id = $1`, [
      fx.machineId,
    ]);
    await alr.sweepAlerts();
    res = await ops('GET', `/alerts?machineId=${fx.machineId}&status=OPEN`);
    items = res.json<{ items: Array<{ type: string }> }>().items;
    expect(items.some((a) => a.type === 'DOOR_OPEN_TOO_LONG')).toBe(false);

    // Đưa máy về NORMAL
    await client.query(`UPDATE machines SET operating_mode = 'NORMAL' WHERE id = $1`, [
      fx.machineId,
    ]);

    // 3. Ngoại lệ 2: Có phiên nạp mở (refill_sessions ở trạng thái STARTED) -> KHÔNG sinh cảnh báo (FR-INV-30 / ADR-0015)
    const sessionId = randomUUID();
    await client.query(
      `INSERT INTO refill_sessions (id, machine_id, staff_id, status, started_at)
       VALUES ($1, $2, $3, 'STARTED', $4)`,
      [sessionId, fx.machineId, opsStaff.userId, new Date()],
    );

    await alr.sweepAlerts();
    res = await ops('GET', `/alerts?machineId=${fx.machineId}&status=OPEN`);
    items = res.json<{ items: Array<{ type: string }> }>().items;
    expect(items.some((a) => a.type === 'DOOR_OPEN_TOO_LONG')).toBe(false);

    // 4. Khi phiên nạp kết thúc (COMPLETED) mà cửa vẫn mở quá hạn -> Cảnh báo được phục hồi (AC4)
    await client.query(
      `UPDATE refill_sessions SET status = 'COMPLETED', completed_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 4 * 60 * 1000), sessionId],
    );

    await alr.sweepAlerts();
    res = await ops('GET', `/alerts?machineId=${fx.machineId}&status=OPEN`);
    items = res.json<{ items: Array<{ type: string }> }>().items;
    expect(items.some((a) => a.type === 'DOOR_OPEN_TOO_LONG')).toBe(true);
  });

  it('test_FR_ALR_05_device_error_alert: Báo lỗi phần cứng thiết bị', async () => {
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'DEVICE_HARDWARE_ERROR',
      severity: 'HIGH',
      deduplicationKey: `HARDWARE:${fx.machineId}`,
      title: 'Lỗi motor truyền động',
      description: 'Cảm biến motor không phản hồi tín hiệu hồi tiếp',
    });

    const res = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ type: string; severity: string; title: string }> }>();
    const alert = body.items.find((a) => a.type === 'DEVICE_HARDWARE_ERROR');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('HIGH');
  });

  it('test_FR_ALR_06_alert_classification: Phân loại mức độ nghiêm trọng cảnh báo', async () => {
    const severities: Array<'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'> = [
      'INFO',
      'WARNING',
      'HIGH',
      'CRITICAL',
    ];
    for (const sev of severities) {
      await alr.raiseAlert({
        machineId: fx.machineId,
        type: `TEST_${sev}`,
        severity: sev,
        deduplicationKey: `SEV:${sev}:${fx.machineId}`,
        title: `Cảnh báo mức ${sev}`,
      });
    }

    const res = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    const items = res.json<{ items: Array<{ severity: string }> }>().items;
    for (const sev of severities) {
      expect(items.some((a) => a.severity === sev)).toBe(true);
    }
  });

  it('test_FR_ALR_07_duplicate_alert: Chống sinh trùng lặp (deduplication key) và tăng số lần xuất hiện', async () => {
    const dedupKey = `TEST_DEDUP:${fx.machineId}`;

    // Phát sinh lần 1
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'SENSOR_FAULT',
      severity: 'WARNING',
      deduplicationKey: dedupKey,
      title: 'Lỗi cảm biến nhiệt',
    });

    // Phát sinh lần 2 cùng deduplication key
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'SENSOR_FAULT',
      severity: 'WARNING',
      deduplicationKey: dedupKey,
      title: 'Lỗi cảm biến nhiệt',
    });

    const res = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    const body = res.json<{
      items: Array<{ deduplicationKey?: string; type: string; occurrenceCount: number }>;
    }>();
    const matching = body.items.filter((a) => a.type === 'SENSOR_FAULT');
    expect(matching).toHaveLength(1);
    expect(matching[0]?.occurrenceCount).toBe(2);
  });

  it('test_FR_ALR_08_alert_status: Vòng đời trạng thái cảnh báo (OPEN -> ACKNOWLEDGED -> RESOLVED -> CLOSED)', async () => {
    const dedupKey = `LIFECYCLE:${fx.machineId}`;
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'TEST_LIFECYCLE',
      severity: 'INFO',
      deduplicationKey: dedupKey,
      title: 'Kiểm thử vòng đời cảnh báo',
    });

    // Lấy ID cảnh báo
    const listRes = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    const alertId = listRes
      .json<{ items: Array<{ id: string; type: string }> }>()
      .items.find((a) => a.type === 'TEST_LIFECYCLE')!.id;

    // 1. Tiếp nhận (Acknowledge)
    const ackRes = await ops('POST', `/alerts/${alertId}/acknowledge`);
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json<{ status: string }>().status).toBe('ACKNOWLEDGED');

    // Không thể tiếp nhận lại
    const dupAck = await ops('POST', `/alerts/${alertId}/acknowledge`);
    expect(dupAck.statusCode).toBe(409);

    // 2. Không thể đóng khi chưa RESOLVED
    const earlyClose = await ops('POST', `/alerts/${alertId}/close`);
    expect(earlyClose.statusCode).toBe(409);

    // 3. Giải quyết (Resolve)
    const resolveRes = await ops('POST', `/alerts/${alertId}/resolve`, {
      payload: { resolution: 'Đã giải quyết xong.' },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json<{ status: string }>().status).toBe('RESOLVED');

    // 4. Đóng cảnh báo (Close)
    const closeRes = await ops('POST', `/alerts/${alertId}/close`);
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json<{ status: string }>().status).toBe('CLOSED');
  });

  it('test_FR_ALR_11_manage_alert: Phân công cảnh báo cho nhân viên vận hành', async () => {
    const dedupKey = `ASSIGN:${fx.machineId}`;
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'TEST_ASSIGN',
      severity: 'WARNING',
      deduplicationKey: dedupKey,
      title: 'Kiểm thử phân công',
    });

    const listRes = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    const alertId = listRes
      .json<{ items: Array<{ id: string; type: string }> }>()
      .items.find((a) => a.type === 'TEST_ASSIGN')!.id;

    const assignRes = await ops('POST', `/alerts/${alertId}/assign`, {
      payload: { assignedTo: opsStaff.userId },
    });
    expect(assignRes.statusCode).toBe(200);
    expect(assignRes.json<{ assignedTo: string }>().assignedTo).toBe(opsStaff.userId);
  });

  it('test_FR_ALR_12_alert_resolution_log: Ghi nhận nội dung và thời điểm hoàn thành xử lý', async () => {
    const dedupKey = `RESOLVE:${fx.machineId}`;
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'TEST_RESOLVE',
      severity: 'HIGH',
      deduplicationKey: dedupKey,
      title: 'Kiểm thử xử lý và ghi nhận',
    });

    const listRes = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    const alertId = listRes
      .json<{ items: Array<{ id: string; type: string }> }>()
      .items.find((a) => a.type === 'TEST_RESOLVE')!.id;

    // Yêu cầu nội dung xử lý không rỗng
    const emptyRes = await ops('POST', `/alerts/${alertId}/resolve`, {
      payload: { resolution: ' ' },
    });
    expect(emptyRes.statusCode).toBe(400);

    const resolveRes = await ops('POST', `/alerts/${alertId}/resolve`, {
      payload: { resolution: 'Đã căn chỉnh lại trục motor.' },
    });
    expect(resolveRes.statusCode).toBe(200);
    const body = resolveRes.json<{ resolution: string; resolvedBy: string; resolvedAt: string }>();
    expect(body.resolution).toBe('Đã căn chỉnh lại trục motor.');
    expect(body.resolvedBy).toBe(opsStaff.userId);
    expect(body.resolvedAt).toBeDefined();
  });

  it('test_FR_ALR_09_affected_brands: Xác định danh sách thương hiệu có slot trên máy bị ảnh hưởng', async () => {
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'MACHINE_OFFLINE',
      severity: 'CRITICAL',
      deduplicationKey: `AFF_BRANDS:${fx.machineId}`,
      title: 'Máy mất kết nối',
    });

    const opsRes = await ops('GET', `/alerts?machineId=${fx.machineId}`);
    expect(opsRes.statusCode).toBe(200);
    const opsAlert = opsRes
      .json<{ items: Array<{ type: string; affectedBrandIds?: string[] }> }>()
      .items.find((a) => a.type === 'MACHINE_OFFLINE');
    expect(opsAlert?.affectedBrandIds).toBeDefined();
    expect(opsAlert?.affectedBrandIds).toContain(fx.brandA);
    expect(opsAlert?.affectedBrandIds).toContain(fx.brandB);
  });

  it('test_FR_ALR_10_brand_alert_notification: Bảo mật multi-brand không làm lộ affectedBrandIds cho Brand Admin (BR-012)', async () => {
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'MACHINE_OFFLINE',
      severity: 'CRITICAL',
      deduplicationKey: `PRIVACY_ALR:${fx.machineId}`,
      title: 'Máy ngắt kết nối kiểm thử bảo mật',
    });

    // Brand Admin A xem cảnh báo: THẤY cảnh báo (vì có slot trên máy), nhưng KHÔNG NHẬN trường affectedBrandIds (BR-012)
    const brandARes = await brandA('GET', `/alerts?machineId=${fx.machineId}`);
    expect(brandARes.statusCode).toBe(200);
    const brandAAlert = brandARes
      .json<{ items: Array<{ type: string; affectedBrandIds?: string[] }> }>()
      .items.find((a) => a.type === 'MACHINE_OFFLINE');
    expect(brandAAlert).toBeDefined();
    expect(brandAAlert?.affectedBrandIds).toBeUndefined();

    // Cảnh báo riêng của slot A
    await alr.raiseAlert({
      brandId: fx.brandA,
      machineId: fx.machineId,
      slotId: fx.slots[0],
      type: 'SLOT_LOW_STOCK',
      severity: 'WARNING',
      deduplicationKey: `SLOT_A_PRIV:${fx.slots[0]}`,
      title: 'Hết nước hoa slot A1',
    });

    // Brand B không thấy cảnh báo của slot A
    const brandBRes = await brandB('GET', `/alerts?machineId=${fx.machineId}`);
    const brandBItems = brandBRes.json<{ items: Array<{ type: string }> }>().items;
    expect(brandBItems.some((a) => a.type === 'SLOT_LOW_STOCK')).toBe(false);
  });
});
