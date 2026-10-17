/** Broker MQTT thật → adapter bất đồng bộ → PostgreSQL; không thay thế thử ESP vật lý. */
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { connectAsync, type MqttClient } from 'mqtt';
import type pg from 'pg';
import { expect, it } from 'vitest';
import { MqttClientAdapter } from '../../apps/api/src/adapters/mqtt/index.js';
import { IotMqttGateway } from '../../apps/api/src/modules/iot/iot.mqtt.js';
import { createTestApp } from '../integration/helpers/app.js';
import { openRawClient } from '../integration/helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  type IsolationFixture,
} from '../integration/helpers/seed-isolation.js';

it('test_FR_IOT_01_real_broker_persists_heartbeat_and_deduplicates_durable_events', async () => {
  let app: NestFastifyApplication | undefined;
  let client: pg.Client | undefined;
  let device: MqttClient | undefined;
  let fx: IsolationFixture | undefined;
  try {
    client = await openRawClient();
    fx = await seedIsolationFixture(client);
    app = await createTestApp();
    app.get(IotMqttGateway).start();
    const adapter = app.get(MqttClientAdapter);
    const broker = process.env['MQTT_URL_TEST'] ?? 'mqtt://localhost:1883';
    adapter.connect(broker, `iot-backend-test-${randomUUID()}`);
    await expect.poll(() => adapter.connected, { timeout: 10000 }).toBe(true);
    // Subscribe readiness is asynchronous; heartbeat retries are harmless.
    device = await connectAsync(broker, { clientId: `iot-device-test-${randomUUID()}` });
    const base = {
      schema_version: 1,
      machine_serial: fx.machineSerial,
      ts: new Date().toISOString(),
    };
    const heartbeat = JSON.stringify({
      ...base,
      firmware_version: 'broker-test',
      configuration_version: 0,
      operating_mode: 'NORMAL',
    });
    await expect
      .poll(
        async () => {
          await device!.publishAsync(`scentstation/${fx!.machineSerial}/heartbeat`, heartbeat, {
            qos: 0,
          });
          const row = await client!.query('SELECT firmware_version FROM machines WHERE id = $1', [
            fx!.machineId,
          ]);
          return row.rows[0].firmware_version;
        },
        { timeout: 10000 },
      )
      .toBe('broker-test');
    const eventId = randomUUID();
    const event = JSON.stringify({
      ...base,
      device_event_id: eventId,
      event_type: 'BOOT',
      payload: { test_device: true },
    });
    await device.publishAsync(`scentstation/${fx.machineSerial}/event`, event, { qos: 1 });
    await device.publishAsync(`scentstation/${fx.machineSerial}/event`, event, { qos: 1 });
    await expect
      .poll(
        async () => {
          const rows = await client!.query(
            'SELECT payload FROM device_events WHERE machine_id = $1 AND device_event_id = $2',
            [fx!.machineId, eventId],
          );
          return rows.rows;
        },
        { timeout: 10000 },
      )
      .toEqual([{ payload: { test_device: true } }]);
  } finally {
    await device?.endAsync();
    await app?.close();
    if (client && fx) {
      await client.query('DELETE FROM device_events WHERE machine_id = $1', [fx.machineId]);
      await cleanupIsolationFixture(client, fx);
    }
    await client?.end();
  }
}, 60000);
