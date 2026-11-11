import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTestCommand, validateTestAction } from '../../scripts/lib/device-test-command.js';
import { createCommandVerifier } from '../../scripts/lib/command-verifier.js';

describe('Lệnh test qua Wi-Fi', () => {
  it.each(['TEST ON', 'TEST OFF', 'STOP', 'SHOW', 'RUN 5', 'SET 1 3499', 'PRIME 5 60000'])(
    'chấp nhận %s',
    (action) => expect(validateTestAction(action)).toBe(action),
  );
  it.each([
    'RUN 0',
    'RUN 6',
    'SET 1 3500',
    'PRIME 1 60001',
    'PRIME 1 -1',
    'PRIME 1 0',
    'PRIME 1 1 extra',
    'PRIME 1 1.5',
  ])('từ chối %s', (action) => expect(() => validateTestAction(action)).toThrow());
  it('chuẩn hóa khoảng trắng và chữ thường', () => {
    expect(validateTestAction(' prime   1  00100 ')).toBe('PRIME 1 100');
  });
  it('ký đúng payload, chống sửa lệnh và cấp token mới cho mỗi lần gửi', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const command = buildTestCommand('M001', 'PRIME 1 10000', pem, 0);
    const verifier = createCommandVerifier(publicKey);
    expect(command.expires_at).toBe('1970-01-01T00:00:20.000Z');
    expect(verifier.check(command).ok).toBe(true);
    expect(verifier.check({ ...command, action: 'PRIME 2 10000' }).ok).toBe(false);
    expect(buildTestCommand('M001', 'STOP', pem, 0).command_token).not.toBe(command.command_token);
    expect(() => buildTestCommand('M001/other', 'STOP', pem)).toThrow();
  });
});
