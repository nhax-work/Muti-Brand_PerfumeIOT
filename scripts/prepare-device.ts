/** Chuyển máy đã đăng ký sang thiết bị vật lý; không seed, không đổi dữ liệu giao dịch. */
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadEnvFile } from '../apps/api/src/shared/config/env-file.js';

loadEnvFile();
const { values } = parseArgs({ options: { serial: { type: 'string', default: 'M001' } } });
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('Thiếu DATABASE_URL');
const privatePem = process.env['DISPENSE_SIGNING_KEY'];
let publicKeyHex: string | undefined;
if (privatePem && privatePem !== 'doi_gia_tri_nay') {
  const privateKey = createPrivateKey(privatePem.replace(/\\n/g, '\n'));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Khóa ký phải là Ed25519');
  const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  publicKeyHex = publicDer.subarray(-32).toString('hex');
}
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query('BEGIN');
  const machine = (
    await client.query<{ id: string; serial_number: string }>(
      'SELECT id, serial_number FROM machines WHERE serial_number = $1 FOR UPDATE',
      [values.serial],
    )
  ).rows[0];
  if (!machine) throw new Error(`Máy ${values.serial} chưa được đăng ký trong database`);
  const slots = await client.query(
    'SELECT slot_number FROM machine_slots WHERE machine_id = $1 ORDER BY slot_number',
    [machine.id],
  );
  if (slots.rows.length !== 5 || slots.rows.some((s, i) => s.slot_number !== i + 1)) {
    throw new Error('Firmware này yêu cầu đúng 5 slot, đánh số 1–5');
  }
  const active = await client.query(
    "SELECT id FROM dispense_commands WHERE machine_id = $1 AND status IN ('CREATED', 'SENT', 'ACKNOWLEDGED')",
    [machine.id],
  );
  if (active.rowCount)
    throw new Error('Máy còn lệnh đang chạy; hãy đợi lệnh kết thúc trước khi chuyển sang ESP thật');
  await client.query(
    'UPDATE machines SET simulator_enabled = false, updated_at = now() WHERE id = $1',
    [machine.id],
  );
  await client.query('COMMIT');
  console.log(
    `Đã chuyển ${machine.serial_number} sang ESP vật lý. Dừng simulator cùng serial trước khi bật ESP.`,
  );
  if (publicKeyHex) {
    console.log(`COMMAND_PUBLIC_KEY_HEX="${publicKeyHex}"`);
  } else {
    console.log('Backend chưa có khóa ký: chỉ thử trên LAN với DEV_ALLOW_UNSIGNED_COMMANDS=true.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
