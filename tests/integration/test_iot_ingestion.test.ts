/** MQTT → PostgreSQL thật: heartbeat, telemetry, khử trùng event và cấu hình 5 slot. */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MqttClientAdapter } from '../../apps/api/src/adapters/mqtt/index.js';
import { IotMqttGateway } from '../../apps/api/src/modules/iot/iot.mqtt.js';
import {
  IotService,
  type DeviceConfiguration,
} from '../../apps/api/src/modules/iot/iot.service.js';
import { APP_CONFIG, type AppConfig } from '../../apps/api/src/shared/config/index.js';
import { DATABASE, type Database } from '../../apps/api/src/shared/db/index.js';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let iot: IotService;
let config: AppConfig;
let now: Date;
const handlers = new Map<string, (topic: string, payload: Buffer) => Promise<void> | void>();

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  config = app.get(APP_CONFIG);
  now = new Date();
  iot = new IotService(app.get<Database>(DATABASE), { now: () => now }, config);
  const adapter = app.get(MqttClientAdapter);
  vi.spyOn(adapter, 'subscribe').mockImplementation((pattern, _qos, handle) => {
    handlers.set(pattern, handle);
  });
  new IotMqttGateway(adapter, iot).start();
  await client.query('UPDATE machines SET simulator_enabled = false, status = $2 WHERE id = $1', [
    fx.machineId,
    'OFFLINE',
  ]);
}, 60_000);

afterAll(async () => {
  if (client && fx) {
    for (const table of ['sensor_readings', 'device_events', 'alerts']) {
      await client.query(`DELETE FROM ${table} WHERE machine_id = $1`, [fx.machineId]);
    }
    await cleanupIsolationFixture(client, fx);
  }
  await app?.close();
  await client?.end();
});

async function deliver(suffix: string, extra: Record<string, unknown>, serial = fx.machineSerial) {
  const message = {
    schema_version: 1,
    machine_serial: fx.machineSerial,
    ts: now.toISOString(),
    ...extra,
  };
  await handlers.get(`scentstation/+/${suffix}`)!(
    `scentstation/${serial}/${suffix}`,
    Buffer.from(JSON.stringify(message)),
  );
}

describe('IOT — MQTT ingestion and configuration', () => {
  it('test_FR_IOT_01_heartbeat_updates_connection_without_overwriting_operator_mode', async () => {
    await client.query('UPDATE machines SET operating_mode = $2 WHERE id = $1', [
      fx.machineId,
      'MAINTENANCE',
    ]);
    await deliver('heartbeat', {
      firmware_version: 'esp-5slot-test',
      configuration_version: 0,
      operating_mode: 'NORMAL',
    });
    const row = (
      await client.query(
        'SELECT status, last_seen_at, firmware_version, operating_mode FROM machines WHERE id = $1',
        [fx.machineId],
      )
    ).rows[0];
    expect(row).toMatchObject({
      status: 'ONLINE',
      firmware_version: 'esp-5slot-test',
      operating_mode: 'MAINTENANCE',
    });
    expect(row.last_seen_at.getTime()).toBe(now.getTime());
    const histories = await client.query(
      'SELECT to_connection_status FROM machine_status_histories WHERE machine_id = $1 AND source = $2',
      [fx.machineId, 'DEVICE'],
    );
    expect(histories.rows).toContainEqual({ to_connection_status: 'ONLINE' });
  });

  it('test_FR_IOT_09_topic_mismatch_cannot_update_another_machine', async () => {
    await deliver(
      'heartbeat',
      { firmware_version: 'spoofed', configuration_version: 1, operating_mode: 'NORMAL' },
      'ANOTHER-MACHINE',
    );
    expect(
      (await client.query('SELECT firmware_version FROM machines WHERE id = $1', [fx.machineId]))
        .rows[0].firmware_version,
    ).toBe('esp-5slot-test');
  });

  it('test_FR_IOT_04_records_five_actuators_without_overwriting_inventory', async () => {
    const before = await client.query(
      'SELECT estimated_remaining_ml FROM machine_slots WHERE machine_id = $1 ORDER BY slot_number',
      [fx.machineId],
    );
    await deliver('telemetry', {
      door_open: false,
      power_status: 'AC',
      slots: [1, 2, 3, 4, 5].map((slot) => ({
        slot_number: slot,
        actuator_status: 'IDLE',
        estimated_remaining_ml: 999,
      })),
    });
    const readings = await client.query(
      'SELECT slot_id, measured_at FROM sensor_readings WHERE machine_id = $1 AND reading_type = $2',
      [fx.machineId, 'ACTUATOR_STATUS'],
    );
    expect(readings.rowCount).toBe(5);
    expect(new Set(readings.rows.map((r) => r.slot_id))).toEqual(new Set(fx.slots));
    expect(readings.rows[0].measured_at.getTime()).toBe(now.getTime());
    const after = await client.query(
      'SELECT estimated_remaining_ml FROM machine_slots WHERE machine_id = $1 ORDER BY slot_number',
      [fx.machineId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('test_FR_IOT_04_unknown_slot_rejects_entire_telemetry_message', async () => {
    const count = async () =>
      (
        await client.query('SELECT count(*) FROM sensor_readings WHERE machine_id = $1', [
          fx.machineId,
        ])
      ).rows[0].count;
    const before = await count();
    await deliver('telemetry', {
      door_open: true,
      power_status: 'AC',
      slots: [
        { slot_number: 1, actuator_status: 'IDLE' },
        { slot_number: 99, actuator_status: 'RUNNING' },
      ],
    });
    expect(await count()).toBe(before);
  });

  it('test_FR_IOT_10_replayed_event_is_stored_once', async () => {
    const event = {
      device_event_id: `${fx.machineSerial}-test-1`,
      event_type: 'BOOT',
      payload: { delivery_sensor_present: false },
    };
    await deliver('event', event);
    await deliver('event', event);
    const result = await client.query(
      'SELECT payload FROM device_events WHERE machine_id = $1 AND device_event_id = $2',
      [fx.machineId, event.device_event_id],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].payload.delivery_sensor_present).toBe(false);
  });

  it('test_FR_IOT_02_03_marks_unstable_then_offline_and_records_alert_once', async () => {
    now = new Date(
      now.getTime() +
        config.constraint('HEARTBEAT_INTERVAL_SEC') *
          config.constraint('MACHINE_UNSTABLE_MISSED') *
          1000,
    );
    await iot.sweepConnections();
    expect(
      (await client.query('SELECT status FROM machines WHERE id = $1', [fx.machineId])).rows[0]
        .status,
    ).toBe('UNSTABLE');
    now = new Date(now.getTime() + config.constraint('MACHINE_OFFLINE_SEC') * 1000);
    await iot.sweepConnections();
    await iot.sweepConnections();
    expect(
      (await client.query('SELECT status FROM machines WHERE id = $1', [fx.machineId])).rows[0]
        .status,
    ).toBe('OFFLINE');
    expect(
      (
        await client.query('SELECT count(*) FROM alerts WHERE machine_id = $1 AND type = $2', [
          fx.machineId,
          'MACHINE_OFFLINE',
        ])
      ).rows[0].count,
    ).toBe('1');
  });

  it('test_FR_IOT_06_publishes_five_slot_configuration_and_retries_failed_publish', async () => {
    const publish = vi.fn(async (_message: DeviceConfiguration) => {});
    await iot.syncConfigurations(publish);
    const messages = () =>
      publish.mock.calls.map(([m]) => m).filter((m) => m.machineSerial === fx.machineSerial);
    expect(messages()[0]?.payload.slots).toHaveLength(5);
    expect(messages()[0]?.payload.operating_mode).toBe('MAINTENANCE');
    await iot.syncConfigurations(publish);
    expect(messages()).toHaveLength(1);
    await client.query('UPDATE machines SET operating_mode = $2 WHERE id = $1', [
      fx.machineId,
      'NORMAL',
    ]);
    await expect(
      iot.syncConfigurations(async () => {
        throw new Error('broker disconnected');
      }),
    ).rejects.toThrow('broker disconnected');
    await iot.syncConfigurations(publish);
    expect(messages()).toHaveLength(2);
    expect(messages()[1]!.payload.configuration_version).toBeGreaterThan(
      messages()[0]!.payload.configuration_version,
    );
  });
});
