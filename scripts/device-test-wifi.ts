import { parseArgs } from 'node:util';
import { connect } from 'mqtt';
import { loadEnvFile } from '../apps/api/src/shared/config/env-file.js';
import { buildTestCommand } from './lib/device-test-command.js';

loadEnvFile();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    serial: { type: 'string', default: 'M001' },
    broker: { type: 'string' },
    'dev-unsigned': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

async function main() {
  if (values.help) {
    console.log('npm run device:test:wifi -- --serial M001 "TEST ON"');
    console.log('Lệnh: SHOW, RUN 1, SET 1 500, PRIME 1 10000, STOP, TEST OFF');
    console.log(
      'Dùng MQTT_URL hoặc --broker. Chỉ dùng --dev-unsigned nếu firmware đã cho phép lệnh dev.',
    );
    return;
  }
  const rawKey = process.env['DISPENSE_SIGNING_KEY'];
  const key = rawKey && rawKey !== 'doi_gia_tri_nay' ? rawKey : null;
  if (!key && !values['dev-unsigned']) {
    throw new Error(
      'Thiếu DISPENSE_SIGNING_KEY. Chỉ thêm --dev-unsigned trong mạng dev khi ESP đã cho phép.',
    );
  }
  const command = buildTestCommand(values.serial, positionals.join(' '), key);
  const broker = values.broker ?? process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
  const client = connect(broker, {
    clientId: `test-cli-${command.command_token}`,
    reconnectPeriod: 0,
    connectTimeout: 8000,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Không nhận được phản hồi ESP; không tự gửi lại lệnh chạy bơm.')),
        15000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      client.on('error', finish);
      client.on('message', (topic, bytes, packet) => {
        if (topic !== `scentstation/${values.serial}/test/result` || packet.retain) return;
        let result: Record<string, unknown>;
        try {
          result = JSON.parse(bytes.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        if (result['command_token'] !== command.command_token) return;
        console.log(JSON.stringify(result, null, 2));
        if (result['accepted'] !== true)
          finish(
            new Error('ESP từ chối lệnh; kiểm tra chế độ test, khoảng nghỉ và trạng thái máy.'),
          );
        else finish();
      });
      client.on('connect', () => {
        client.subscribe(
          `scentstation/${values.serial}/test/result`,
          { qos: 0 },
          (error, grants) => {
            if (error || grants?.some((grant) => grant.qos === 128)) {
              finish(error ?? new Error('Broker từ chối quyền nhận phản hồi.'));
              return;
            }
            client.publish(
              `scentstation/${values.serial}/test/command`,
              JSON.stringify(command),
              { qos: 1, retain: false },
              (publishError) => {
                if (publishError) finish(publishError);
              },
            );
          },
        );
      });
    });
  } finally {
    client.end(true);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
