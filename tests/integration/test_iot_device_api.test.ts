/**
 * Telemetry, sự kiện thiết bị và đẩy lại cấu hình qua REST (FR-IOT-04 ÷ 06) trên PostgreSQL thật.
 * Bản tin vào đi qua chính `IotService` mà gateway MQTT gọi; bản tin `config` ra được bắt ở
 * `MqttClientAdapter.publish` — đúng topic, version và cờ retain của spec/contracts/mqtt.md §7.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MqttClientAdapter } from '../../apps/api/src/adapters/mqtt/index.js';
import { EventMessage, TelemetryMessage } from '../../apps/api/src/modules/iot/iot.messages.js';
import { IotService } from '../../apps/api/src/modules/iot/iot.service.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

interface Page<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number };
}
interface Reading {
  id: string;
  machineId: string;
  slotId: string | null;
  readingType: string;
  numericValue: number | null;
  unit: string | null;
  measuredAt: string;
}
interface Event {
  id: string;
  machineId: string;
  deviceEventId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let ops: PlatformStaff;
let inventory: PlatformStaff;
let opsToken: string;
let superAdmin: ReturnType<typeof asUser>;
let opsUser: ReturnType<typeof asUser>;
let inventoryUser: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  ops = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', [
    'machine.view',
    'machine.operate',
  ]);
  inventory = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['machine.view']);
  app = await createTestApp();
  opsToken = (await login(app, ops.email, TEST_PASSWORD)).accessToken;
  opsUser = asUser(app, opsToken);
  inventoryUser = asUser(app, (await login(app, inventory.email, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await ops.cleanup();
  await inventory.cleanup();
  await client.end();
  await app.close();
});

describe('Telemetry (FR-IOT-04)', () => {
  it('test_FR_IOT_04_list_sensor_readings — bản tin telemetry lưu đủ cửa, nguồn, cơ cấu, khối lượng từng slot', async () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    // Dựng qua đúng schema mà gateway MQTT dùng để kiểm bản tin thiết bị (mqtt.md).
    const stored = await app.get(IotService).telemetry(
      TelemetryMessage.parse({
        schema_version: 1,
        machine_serial: fx.machineSerial,
        ts,
        door_open: false,
        power_status: 'AC',
        slots: [
          { slot_number: 1, actuator_status: 'IDLE', load_cell_g: 118.2 },
          { slot_number: 2, actuator_status: 'IDLE', load_cell_g: 96.5 },
        ],
      }),
    );
    expect(stored).toBe(true);

    const res = await opsUser(
      'GET',
      `/machines/${fx.machineId}/sensor-readings?from=${encodeURIComponent(ts)}&pageSize=50`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<Page<Reading>>();
    const types = body.items.map((r) => r.readingType).sort();
    expect(types).toEqual(
      [
        'ACTUATOR_STATUS',
        'ACTUATOR_STATUS',
        'DOOR_OPEN',
        'LOAD_CELL_G',
        'LOAD_CELL_G',
        'POWER_STATUS',
      ].sort(),
    );
    const slot1 = body.items.find(
      (r) => r.readingType === 'LOAD_CELL_G' && r.slotId === fx.slots[0],
    );
    expect(slot1).toMatchObject({ numericValue: 118.2, unit: 'g', measuredAt: ts });
    expect(body.meta.total).toBe(6);
  });

  it('test_FR_IOT_04_list_sensor_readings — lọc slot, loại số đo, khoảng thời gian; mới nhất trước', async () => {
    const res = await inventoryUser(
      'GET',
      `/machines/${fx.machineId}/sensor-readings?slotId=${fx.slots[0]}&readingType=slot_weight_g`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json<Page<Reading>>().items;
    // Fixture: hai số đo trong kỳ hạn + một số đo trước kỳ hạn trên slot 1.
    expect(items).toHaveLength(3);
    expect(items.every((r) => r.slotId === fx.slots[0] && r.readingType === 'slot_weight_g')).toBe(
      true,
    );
    const times = items.map((r) => r.measuredAt);
    expect([...times].sort().reverse()).toEqual(times);

    const inverted = await opsUser(
      'GET',
      `/machines/${fx.machineId}/sensor-readings?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z`,
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('test_FR_IOT_04_list_sensor_readings — Brand Admin bị FORBIDDEN_SCOPE; máy không tồn tại là NOT_FOUND (AC3)', async () => {
    const brand = await brandA('GET', `/machines/${fx.machineId}/sensor-readings`);
    expect(brand.statusCode).toBe(403);
    expect(brand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const missing = await opsUser('GET', `/machines/${randomUUID()}/sensor-readings`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('Sự kiện thiết bị (FR-IOT-05)', () => {
  it('test_FR_IOT_05_list_device_events — sự kiện gửi lại sau kết nối lại chỉ lưu một lần; danh sách của đúng máy', async () => {
    const iot = app.get(IotService);
    const message = EventMessage.parse({
      schema_version: 1,
      machine_serial: fx.machineSerial,
      ts: new Date(Date.now() - 30_000).toISOString(),
      device_event_id: `EVT-RECONNECT-${fx.runId}`,
      event_type: 'RECONNECTED',
      payload: { offline_sec: 42 },
    });
    expect(await iot.event(message)).toBe(true);
    expect(await iot.event(message)).toBe(true);

    const res = await opsUser('GET', `/machines/${fx.machineId}/device-events`);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<Page<Event>>();
    const reconnects = body.items.filter((e) => e.deviceEventId === message.device_event_id);
    expect(reconnects).toHaveLength(1);
    expect(reconnects[0]).toMatchObject({
      machineId: fx.machineId,
      eventType: 'RECONNECTED',
      payload: { offline_sec: 42 },
    });
    // Mới nhất trước: sự kiện vừa gửi đứng đầu, ba sự kiện cửa mở của fixture theo sau.
    expect(body.items[0]!.deviceEventId).toBe(message.device_event_id);
    expect(body.meta.total).toBe(4);
    expect(body.items.every((e) => e.machineId === fx.machineId)).toBe(true);
  });

  it('test_FR_IOT_05_list_device_events — phân quyền như telemetry (AC3)', async () => {
    const brand = await brandA('GET', `/machines/${fx.machineId}/device-events`);
    expect(brand.statusCode).toBe(403);
    const paged = await superAdmin('GET', `/machines/${fx.machineId}/device-events?pageSize=2`);
    expect(paged.json<Page<Event>>().items).toHaveLength(2);
  });
});

describe('Đẩy lại cấu hình (FR-IOT-06)', () => {
  async function version(): Promise<number> {
    const row = await client.query<{ configuration_version: number }>(
      `SELECT configuration_version FROM machines WHERE id = $1`,
      [fx.machineId],
    );
    return row.rows[0]!.configuration_version;
  }

  it('test_FR_IOT_06_push_machine_config — tăng version, publish config retain đúng topic, ghi AuditLog', async () => {
    const adapter = app.get(MqttClientAdapter);
    vi.spyOn(adapter, 'connected', 'get').mockReturnValue(true);
    const publish = vi.spyOn(adapter, 'publish').mockResolvedValue(undefined);
    const before = await version();

    const res = await opsUser('POST', `/machines/${fx.machineId}/config/push`, {
      headers: { 'x-reauth-token': await reauth(app, opsToken, TEST_PASSWORD) },
    });

    expect(res.statusCode, res.body).toBe(202);
    expect(res.json()).toMatchObject({ id: fx.machineId, configurationVersion: before + 1 });
    expect(await version()).toBe(before + 1);
    expect(publish).toHaveBeenCalledTimes(1);
    const [topic, payload, options] = publish.mock.calls[0]!;
    expect(topic).toBe(`scentstation/${fx.machineSerial}/config`);
    expect(options).toMatchObject({ qos: 1, retain: true });
    expect(payload).toMatchObject({
      schema_version: 1,
      machine_serial: fx.machineSerial,
      configuration_version: before + 1,
      operating_mode: 'NORMAL',
    });
    expect((payload as { slots: unknown[] }).slots).toHaveLength(5);

    const log = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'iot.config.pushed' AND target_id = $1`,
      [fx.machineId],
    );
    expect(log.rowCount).toBeGreaterThan(0);

    // Đẩy lần nữa dù cấu hình không đổi: vẫn tăng version (thiết bị chỉ áp version lớn hơn).
    const again = await opsUser('POST', `/machines/${fx.machineId}/config/push`, {
      headers: { 'x-reauth-token': await reauth(app, opsToken, TEST_PASSWORD) },
    });
    expect(again.statusCode).toBe(202);
    expect(await version()).toBe(before + 2);
  });

  it('test_FR_IOT_06_push_machine_config — chưa nối broker vẫn tăng version để nhịp đồng bộ đẩy sau', async () => {
    const adapter = app.get(MqttClientAdapter);
    vi.spyOn(adapter, 'connected', 'get').mockReturnValue(false);
    const publish = vi.spyOn(adapter, 'publish');
    const before = await version();
    const res = await opsUser('POST', `/machines/${fx.machineId}/config/push`, {
      headers: { 'x-reauth-token': await reauth(app, opsToken, TEST_PASSWORD) },
    });
    expect(res.statusCode, res.body).toBe(202);
    expect(await version()).toBe(before + 1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('test_FR_IOT_06_push_machine_config — thiếu xác thực lại REAUTH_REQUIRED; Brand Admin, Inventory Staff bị FORBIDDEN_SCOPE', async () => {
    const before = await version();
    const noReauth = await opsUser('POST', `/machines/${fx.machineId}/config/push`);
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });

    for (const user of [brandA, inventoryUser]) {
      const res = await user('POST', `/machines/${fx.machineId}/config/push`);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    }
    expect(await version()).toBe(before);

    const missing = await opsUser('POST', `/machines/${randomUUID()}/config/push`, {
      headers: { 'x-reauth-token': await reauth(app, opsToken, TEST_PASSWORD) },
    });
    expect(missing.statusCode).toBe(404);
  });
});
