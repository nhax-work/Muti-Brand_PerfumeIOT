/** Thanh toán kiosk qua webhook thật phải gửi lệnh CUSTOMER đúng slot qua MQTT. */
import { randomUUID } from 'node:crypto';
import { connectAsync } from 'mqtt';
import { expect, it } from 'vitest';
import { MqttClientAdapter } from '../../apps/api/src/adapters/mqtt/index.js';
import { DspJobs, DspMqttGateway } from '../../apps/api/src/modules/dsp/index.js';
import { IotMqttGateway } from '../../apps/api/src/modules/iot/iot.mqtt.js';
import { createTestApp } from '../integration/helpers/app.js';
import { openRawClient } from '../integration/helpers/db.js';
import { kioskFlow, useTestSigningKey } from '../integration/helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
} from '../integration/helpers/seed-isolation.js';

it('chỉ thanh toán thành công mới bật đúng slot, webhook trùng không tạo lượt thứ hai', async () => {
  const db = await openRawClient();
  const fx = await seedIsolationFixture(db);
  useTestSigningKey();
  const app = await createTestApp();
  const flow = kioskFlow(app, db, fx);
  const broker = process.env['MQTT_URL_TEST'] ?? 'mqtt://127.0.0.1:1883';
  const device = await connectAsync(broker, { clientId: `paid-slot-${randomUUID()}` });
  const topic = `scentstation/${fx.machineSerial}`;
  const received: Record<string, unknown>[] = [];
  device.on('message', (name, payload) => {
    if (name === `${topic}/command`) received.push(JSON.parse(payload.toString()));
  });
  try {
    await db.query('UPDATE machines SET simulator_enabled = false WHERE id = $1', [fx.machineId]);
    const adapter = app.get(MqttClientAdapter);
    app.get(DspMqttGateway).start();
    app.get(IotMqttGateway).start();
    adapter.connect(broker, `paid-slot-api-${randomUUID()}`);
    await expect.poll(() => adapter.connected, { timeout: 10000 }).toBe(true);
    await device.subscribeAsync(`${topic}/command`, { qos: 1 });
    await expect
      .poll(
        async () => {
          await device.publishAsync(
            `${topic}/heartbeat`,
            JSON.stringify({
              schema_version: 1,
              machine_serial: fx.machineSerial,
              ts: new Date().toISOString(),
              firmware_version: 'paid-slot-test',
              configuration_version: 0,
              operating_mode: 'NORMAL',
            }),
          );
          return (await db.query('SELECT last_seen_at FROM machines WHERE id = $1', [fx.machineId]))
            .rows[0].last_seen_at;
        },
        { timeout: 10000 },
      )
      .not.toBeNull();
    const jobs = app.get(DspJobs);
    for (const index of [0, 3]) {
      const before = received.length;
      const order = await flow.createOrder(index);
      await jobs.tick();
      expect(await flow.commandsOf(order.id)).toHaveLength(0);
      expect(received).toHaveLength(before);
      const webhook = flow.paidWebhook(order);
      expect((await flow.sendWebhook(webhook)).statusCode).toBe(200);
      expect((await flow.sendWebhook(webhook)).statusCode).toBe(200);
      expect(await app.get(IotMqttGateway).tick()).toBe(true);
      await jobs.tick();
      await expect.poll(() => received.length, { timeout: 10000 }).toBe(before + 1);
      const command = received[before]!;
      expect(command).toMatchObject({
        machine_serial: fx.machineSerial,
        slot_number: index + 1,
        dispense_type: 'CUSTOMER',
        command_type: 'DISPENSE',
      });
      expect(await flow.commandsOf(order.id)).toHaveLength(1);
      // Thiết bị ACK khi bật đèn; chỉ gửi RESULT sau thao tác nhấn nút.
      for (const stage of ['ACK', 'RESULT']) {
        await device.publishAsync(
          `${topic}/command/result`,
          JSON.stringify({
            schema_version: 1,
            machine_serial: fx.machineSerial,
            ts: new Date().toISOString(),
            command_token: command['command_token'],
            stage,
            ...(stage === 'RESULT' ? { success: true, executed_at: new Date().toISOString() } : {}),
          }),
          { qos: 1 },
        );
        await expect
          .poll(async () => (await flow.commandOf(order.id)).status, { timeout: 10000 })
          .toBe(stage === 'ACK' ? 'ACKNOWLEDGED' : 'SUCCEEDED');
      }
      expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');
    }
  } finally {
    await device.publishAsync(`${topic}/config`, '', { qos: 1, retain: true });
    await device.endAsync();
    await app.close();
    await flow.cleanup();
    await cleanupIsolationFixture(db, fx);
    await db.end();
  }
}, 60000);
