/**
 * Unit test cho bước kiểm chữ ký phía thiết bị của simulator (spec/contracts/mqtt.md §5.1, FR-DSP-07).
 *
 * Ký bằng chính `createCommandSigner` của backend rồi kiểm bằng verifier của simulator: hai bên phải
 * chuẩn hóa payload giống hệt nhau, lệch là mọi lệnh thật bị từ chối.
 *
 * KHÔNG có ở đây — thuộc nhóm người tự viết (docs/LO_TRINH_AI_HARNESS_13_TUAN.md "Chín chỗ"):
 *   - TTL lệnh xịt phía thiết bị, bấm nút sau DISPENSE_PRESS_WINDOW_SEC
 */

import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createCommandSigner,
  DEV_UNSIGNED_SIGNATURE,
} from '../../apps/api/src/adapters/mqtt/command-signature.js';
import { createCommandVerifier, loadDevicePublicKey } from '../../scripts/lib/command-verifier.js';

function ed25519Pair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    publicKey,
  };
}

const command = {
  schema_version: 1,
  machine_serial: 'M001',
  ts: '2026-10-06T08:30:00Z',
  command_token: 'cmd_01JB8XQ2M4YB7N9K3T5V6W8Z1A',
  command_type: 'DISPENSE',
  dispense_type: 'CUSTOMER',
  slot_number: 2,
  dosage_ml: 0.12,
  expires_at: '2026-10-06T08:31:30Z',
};

describe('Simulator — kiểm chữ ký lệnh xịt (mqtt.md §5.1)', () => {
  it('test_FR_DSP_07_device_rejects_invalid_signature', () => {
    const keys = ed25519Pair();
    const verifier = createCommandVerifier(keys.publicKey);
    const signature = createCommandSigner(keys.privatePem).sign(command);

    expect(verifier.strict).toBe(true);
    expect(verifier.check({ ...command, signature })).toEqual({ ok: true });
    // Thứ tự khóa trong bản tin nhận được không ảnh hưởng — chuỗi ký là payload chuẩn hóa.
    const reordered = Object.fromEntries(Object.entries(command).reverse());
    expect(verifier.check({ signature, ...reordered })).toEqual({ ok: true });

    // Sửa slot đích sau khi ký → chữ ký không còn khớp.
    expect(verifier.check({ ...command, slot_number: 3, signature })).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    // Chữ ký bằng khóa khác, chữ ký giả dev và chữ ký rác đều bị từ chối.
    const otherSignature = createCommandSigner(ed25519Pair().privatePem).sign(command);
    for (const bad of [otherSignature, DEV_UNSIGNED_SIGNATURE, '%%%không-phải-base64%%%']) {
      expect(verifier.check({ ...command, signature: bad })).toEqual({
        ok: false,
        reason: 'INVALID',
      });
    }
    expect(verifier.check({ ...command })).toEqual({ ok: false, reason: 'MISSING' });
  });

  it('không có khóa công khai: chế độ dev chỉ đòi có trường signature', () => {
    const verifier = createCommandVerifier(null);

    expect(verifier.strict).toBe(false);
    expect(verifier.check({ ...command, signature: DEV_UNSIGNED_SIGNATURE })).toEqual({ ok: true });
    expect(verifier.check({ ...command })).toEqual({ ok: false, reason: 'MISSING' });
    expect(verifier.check({ ...command, signature: '' })).toEqual({ ok: false, reason: 'MISSING' });
  });

  it('khóa công khai suy từ DISPENSE_SIGNING_KEY, kể cả PEM viết một dòng với \\n thoát', () => {
    const keys = ed25519Pair();
    const oneLinePem = keys.privatePem.trim().replace(/\n/g, '\\n');
    const verifier = createCommandVerifier(loadDevicePublicKey(undefined, oneLinePem));

    const signature = createCommandSigner(oneLinePem).sign(command);
    expect(verifier.check({ ...command, signature })).toEqual({ ok: true });
  });

  it('--public-key đọc file PEM và được ưu tiên hơn DISPENSE_SIGNING_KEY', () => {
    const device = ed25519Pair();
    const backend = ed25519Pair();
    const dir = mkdtempSync(join(tmpdir(), 'sim-key-'));
    try {
      const path = join(dir, 'device.pub.pem');
      writeFileSync(path, device.publicPem);
      const verifier = createCommandVerifier(loadDevicePublicKey(path, backend.privatePem));

      const signedByDeviceKey = createCommandSigner(device.privatePem).sign(command);
      const signedByBackendKey = createCommandSigner(backend.privatePem).sign(command);
      expect(verifier.check({ ...command, signature: signedByDeviceKey })).toEqual({ ok: true });
      expect(verifier.check({ ...command, signature: signedByBackendKey }).ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('chưa cấu hình khóa hoặc còn giá trị mẫu thì không có khóa; khóa không phải Ed25519 bị từ chối', () => {
    expect(loadDevicePublicKey(undefined, undefined)).toBeNull();
    expect(loadDevicePublicKey(undefined, '')).toBeNull();
    expect(loadDevicePublicKey(undefined, 'doi_gia_tri_nay')).toBeNull();

    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const ecPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => loadDevicePublicKey(undefined, ecPem)).toThrow(/Ed25519/);
  });
});
