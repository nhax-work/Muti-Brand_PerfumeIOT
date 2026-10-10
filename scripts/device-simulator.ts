/**
 * Thiết bị giả lập chạy bằng Node — đóng vai ESP32 theo spec/contracts/mqtt.md, để chạy hết chuỗi
 * thanh toán → lệnh → ACK → bấm nút → RESULT mà không cần phần cứng.
 *
 *   npm run sim                                  # M001, tự "bấm nút" sau 2 giây
 *   npm run sim -- --serial M001 --press-after 5
 *   npm run sim -- --no-press                    # không bấm → PRESS_TIMEOUT → đơn FORFEITED
 *   npm run sim -- --wrong-slot 3                # bấm nhầm nút slot 3 (bị bỏ qua) rồi bấm đúng nút
 *   npm run sim -- --wrong-slot 3 --no-press     # chỉ bấm nhầm → PRESS_TIMEOUT → đơn FORFEITED
 *   npm run sim -- --reject DOOR_OPEN            # từ chối ngay khi nhận lệnh
 *   npm run sim -- --fail-on-press DOOR_OPEN     # bấm rồi nhưng kiểm an toàn lần hai không đạt
 *                                                #   (FR-DSP-23) → đơn FAILED + kiểm tra thủ công
 *   npm run sim -- --fail ACTUATOR_FAULT         # bấm rồi nhưng cơ cấu hỏng → đơn FAILED
 *   npm run sim -- --public-key device.pub.pem   # kiểm chữ ký bằng khóa công khai chỉ định
 *   npm run sim:many                             # 50 máy SIM-001..SIM-050 chỉ gửi heartbeat
 *
 * Logic thiết bị nằm ở `scripts/lib/simulated-machine.ts`; file này chỉ đọc cờ dòng lệnh và nối máy
 * với broker. Khóa công khai lấy từ --public-key, không có thì suy ra từ DISPENSE_SIGNING_KEY trong
 * .env; không có cả hai thì chạy chế độ dev như firmware bật DEV_ALLOW_UNSIGNED_COMMANDS (đòi có
 * trường `signature`, không xác minh giá trị). Broker lấy từ --broker, rồi MQTT_URL trong .env.
 *
 * KHÔNG chạy cùng lúc với ESP32 thật mang cùng serial — cả hai sẽ cùng trả lời một lệnh.
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { connect } from 'mqtt';
import { SPEC_CONSTRAINTS } from '../apps/api/src/shared/config/constraints.generated.js';
import {
  createCommandVerifier,
  loadDevicePublicKey,
  type CommandVerifier,
} from './lib/command-verifier.js';
import { SimulatedMachine, type MachineBehavior } from './lib/simulated-machine.js';

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    serial: { type: 'string', default: 'M001' },
    machines: { type: 'string' },
    broker: { type: 'string' },
    'press-after': { type: 'string', default: '45' },
    'no-press': { type: 'boolean', default: false },
    'wrong-slot': { type: 'string' },
    'public-key': { type: 'string' },
    reject: { type: 'string' },
    'fail-on-press': { type: 'string' },
    fail: { type: 'string' },
  },
});

const broker = values.broker ?? process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
const wrongSlot = values['wrong-slot'] === undefined ? null : Number(values['wrong-slot']);
if (wrongSlot !== null && (!Number.isInteger(wrongSlot) || wrongSlot < 1)) {
  console.error(`--wrong-slot phải là số slot nguyên dương, nhận được: ${values['wrong-slot']}`);
  process.exit(1);
}

const isAutoPress = process.argv.includes('--auto-press') || process.env['AUTO_PRESS'] === '1';
const behavior: MachineBehavior = {
  pressWindowSec: SPEC_CONSTRAINTS.DISPENSE_PRESS_WINDOW_SEC,
  pressAfterMs: isAutoPress ? Math.max(0, Number(values['press-after'] ?? '15')) * 1000 : null,
  wrongSlot,
  reject: values.reject ?? null,
  failOnPress: values['fail-on-press'] ?? null,
  fail: values.fail ?? null,
};

function loadVerifier(): CommandVerifier {
  try {
    const key = loadDevicePublicKey(values['public-key'], process.env['DISPENSE_SIGNING_KEY']);
    return createCommandVerifier(key);
  } catch (error) {
    console.error(`Không đọc được khóa kiểm chữ ký: ${(error as Error).message}`);
    process.exit(1);
  }
}

function main(): void {
  const count = values.machines ? Math.max(1, Number(values.machines)) : 0;
  const serials =
    count > 0
      ? Array.from({ length: count }, (_, i) => `SIM-${String(i + 1).padStart(3, '0')}`)
      : [values.serial];

  const verifier = loadVerifier();
  console.log(
    verifier.strict
      ? `Kiểm chữ ký Ed25519: BẬT (khóa từ ${values['public-key'] ? '--public-key' : 'DISPENSE_SIGNING_KEY'})`
      : 'Kiểm chữ ký: TẮT — chế độ dev, chỉ đòi có trường signature (như DEV_ALLOW_UNSIGNED_COMMANDS)',
  );

  const client = connect(broker, { clientId: `scentstation-sim-${process.pid}`, clean: true });
  const machines = new Map<string, SimulatedMachine>();
  client.on('connect', () => {
    console.log(
      `Đã kết nối ${broker} — giả lập ${serials.length} máy: ${serials.slice(0, 5).join(', ')}${serials.length > 5 ? '…' : ''} | Tự bấm nút sau: ${behavior.pressAfterMs === null ? 'TẮT (không bấm)' : `${behavior.pressAfterMs / 1000}s`}`,
    );
    for (const serial of serials) {
      if (machines.has(serial)) continue;
      const machine = new SimulatedMachine({
        serial,
        verifier,
        behavior,
        publish: (topic, payload, qos) => client.publish(topic, payload, { qos }),
        log: (line) =>
          console.log(
            `[${new Date().toLocaleTimeString('vi-VN')}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${line}`,
          ),
      });
      machines.set(serial, machine);
      // Chế độ nhiều máy chỉ gửi heartbeat (test tải); một máy thì nhận lệnh.
      if (count === 0) {
        client.subscribe(machine.topic('command'), { qos: 1 });
        client.subscribe('scentstation/+/button', { qos: 1 });
      }
      machine.heartbeat();
      setInterval(() => machine.heartbeat(), SPEC_CONSTRAINTS.HEARTBEAT_INTERVAL_SEC * 1000);
    }
  });
  client.on('message', (topic, payload) => {
    const serial = topic.split('/')[1] ?? '';
    if (topic.endsWith('/command')) {
      machines.get(serial)?.onCommand(payload);
    } else if (topic.endsWith('/button')) {
      const slot = Number(payload.toString().trim());
      if (Number.isInteger(slot) && slot >= 1) {
        machines.get(serial)?.press(slot);
      }
    }
  });
  client.on('error', (error) => console.error(`MQTT lỗi: ${error.message}`));
  client.on('offline', () => console.warn(`Mất kết nối ${broker}, đang thử lại…`));
}

main();
