import { randomUUID } from 'node:crypto';
import { createCommandSigner } from '../../apps/api/src/adapters/mqtt/command-signature.js';

/** Kiểm tra lệnh bảo trì trước khi gửi tới thiết bị thật. */
export function validateTestAction(input: string): string {
  const action = input.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^(TEST (ON|OFF)|SHOW|STOP|RUN [1-5])$/.test(action)) return action;
  const match = /^(SET|PRIME) ([1-5]) ([0-9]+)$/.exec(action);
  if (match) {
    const duration = Number(match[3]);
    const limit = match[1] === 'PRIME' ? 60000 : 3499;
    if (Number.isInteger(duration) && duration >= 1 && duration <= limit) {
      return `${match[1]} ${match[2]} ${duration}`;
    }
  }
  throw new Error(
    'Lệnh hợp lệ: TEST ON/OFF, SHOW, STOP, RUN 1-5, SET <slot> <1-3499>, PRIME <slot> <1-60000>.',
  );
}

export function buildTestCommand(
  serial: string,
  input: string,
  key: string | null,
  now = Date.now(),
) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(serial)) throw new Error('Mã máy không hợp lệ.');
  const payload = {
    schema_version: 1,
    machine_serial: serial,
    command_type: 'TEST',
    command_token: `test-${randomUUID()}`,
    expires_at: new Date(now + 20000).toISOString(),
    action: validateTestAction(input),
  };
  return { ...payload, signature: createCommandSigner(key).sign(payload) };
}
