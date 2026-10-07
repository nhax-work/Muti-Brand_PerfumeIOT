/**
 * Unit test cho DSP: bảng ánh xạ `command/result` → trạng thái lệnh/đơn (spec/contracts/mqtt.md §6),
 * ký lệnh (§5.1) và topic (§1).
 *
 * Luồng trên CSDL thật: tests/integration/test_dsp_dispatch.test.ts. TTL lệnh xịt phía thiết bị và
 * bấm nút sau DISPENSE_PRESS_WINDOW_SEC: tests/e2e/test_command_ttl.test.ts.
 */

import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  createCommandSigner,
  DEV_UNSIGNED_SIGNATURE,
} from '../../apps/api/src/adapters/mqtt/command-signature.js';
import { topicMatches } from '../../apps/api/src/adapters/mqtt/mqtt.client.js';
import {
  allDevicesTopic,
  deviceTopic,
  serialFromTopic,
} from '../../apps/api/src/adapters/mqtt/topics.js';
import { outcomeOf } from '../../apps/api/src/modules/dsp/dispense-outcome.js';

describe('DSP — ánh xạ kết quả thiết bị (mqtt.md §6)', () => {
  it('ACK chỉ là đèn đã sáng — đơn giữ nguyên, không suy ra DISPENSED (FR-DSP-11)', () => {
    expect(outcomeOf({ stage: 'ACK' }, false)).toEqual({ kind: 'ACKNOWLEDGED' });
  });

  it('test_FR_DSP_17_dispensed_only_on_device_success', () => {
    expect(outcomeOf({ stage: 'RESULT', success: true }, true)).toEqual({
      kind: 'CLOSED',
      commandStatus: 'SUCCEEDED',
      order: { to: 'DISPENSED', failureCode: null, manualReview: false },
    });
    // success thiếu hoặc false thì KHÔNG BAO GIỜ là DISPENSED.
    for (const success of [false, undefined]) {
      const outcome = outcomeOf({ stage: 'RESULT', success, failureCode: 'NO_CURRENT' }, true);
      expect(outcome).toMatchObject({
        commandStatus: 'FAILED',
        order: { to: 'FAILED', failureCode: 'NO_CURRENT', manualReview: true },
      });
    }
  });

  it('test_FR_DSP_24_press_timeout_forfeits_order', () => {
    // FR-ORD-27: mất lượt, không hoàn tiền, không cắm cờ kiểm tra thủ công.
    expect(outcomeOf({ stage: 'REJECT', failureCode: 'PRESS_TIMEOUT' }, true)).toEqual({
      kind: 'CLOSED',
      commandStatus: 'REJECTED',
      order: { to: 'FORFEITED', failureCode: 'PRESS_TIMEOUT', manualReview: false },
    });
  });

  it('REJECT sau ACK (khách đã bấm) là FAILED cần kiểm tra; trước ACK thì không (FR-ORD-19)', () => {
    expect(outcomeOf({ stage: 'REJECT', failureCode: 'DOOR_OPEN' }, true)).toMatchObject({
      commandStatus: 'REJECTED',
      order: { to: 'FAILED', failureCode: 'DOOR_OPEN', manualReview: true },
    });
    expect(outcomeOf({ stage: 'REJECT', failureCode: 'CMD_EXPIRED' }, false)).toMatchObject({
      commandStatus: 'REJECTED',
      order: { to: 'FAILED', failureCode: 'CMD_EXPIRED', manualReview: false },
    });
  });

  it('PRESS_TIMEOUT mà chưa từng ACK không phải lỗi của khách — FAILED, không FORFEITED', () => {
    expect(outcomeOf({ stage: 'REJECT', failureCode: 'PRESS_TIMEOUT' }, false)).toMatchObject({
      order: { to: 'FAILED' },
    });
  });

  it('CMD_DUPLICATE nói về bản sao broker gửi lại — không khép lệnh gốc (FR-DSP-10)', () => {
    for (const acknowledged of [true, false]) {
      expect(outcomeOf({ stage: 'REJECT', failureCode: 'CMD_DUPLICATE' }, acknowledged)).toEqual({
        kind: 'IGNORED',
      });
    }
  });
});

describe('DSP — ký lệnh (mqtt.md §5.1)', () => {
  it('payload chuẩn hóa: khóa sắp xếp, không khoảng trắng, lồng nhau cũng sắp', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 'x'], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,"x"]},"b":1}',
    );
  });

  it('test_FR_DSP_04_sign_dispense_command', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = { slot_number: 2, command_token: 'cmd_1', machine_serial: 'M001' };

    const signature = createCommandSigner(pem).sign(payload);

    const message = Buffer.from(canonicalJson(payload), 'utf8');
    expect(verify(null, message, publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    // Đổi slot đích thì chữ ký cũ không còn hợp lệ.
    const tampered = Buffer.from(canonicalJson({ ...payload, slot_number: 3 }), 'utf8');
    expect(verify(null, tampered, publicKey, Buffer.from(signature, 'base64url'))).toBe(false);
  });

  it('chưa cấu hình khóa thì ký giả dev-unsigned; khóa không phải Ed25519 bị từ chối', () => {
    expect(createCommandSigner(null).sign({ a: 1 })).toBe(DEV_UNSIGNED_SIGNATURE);
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => createCommandSigner(pem)).toThrow(/Ed25519/);
  });
});

describe('DSP — topic MQTT (mqtt.md §1)', () => {
  it('dựng và tách serial đúng dạng scentstation/{serial}/{suffix}', () => {
    expect(deviceTopic('M001', 'command')).toBe('scentstation/M001/command');
    expect(allDevicesTopic('command/result')).toBe('scentstation/+/command/result');
    expect(serialFromTopic('scentstation/M001/command/result', 'command/result')).toBe('M001');
    expect(serialFromTopic('scentstation/a/b/command/result', 'command/result')).toBeNull();
    expect(serialFromTopic('other/M001/command/result', 'command/result')).toBeNull();
  });

  it('wildcard + khớp đúng một cấp, # khớp phần còn lại', () => {
    expect(topicMatches('scentstation/+/command/result', 'scentstation/M001/command/result')).toBe(
      true,
    );
    expect(topicMatches('scentstation/+/command/result', 'scentstation/M001/command')).toBe(false);
    expect(topicMatches('scentstation/#', 'scentstation/M001/command/result')).toBe(true);
  });
});
