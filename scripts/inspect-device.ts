/** Báo cáo chỉ đọc: máy → đơn → lệnh → kết quả và dữ liệu IOT trong PostgreSQL. */
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadEnvFile } from '../apps/api/src/shared/config/env-file.js';

loadEnvFile();
// PowerShell nuốt dấu `--` của `npm run … -- --serial M001`, npm chỉ chuyển xuống `M001` — nhận cả hai.
const { values, positionals } = parseArgs({
  options: { serial: { type: 'string' } },
  allowPositionals: true,
});
const serial = values.serial ?? positionals[0] ?? 'M001';
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('Thiếu DATABASE_URL');
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const machine = (
    await client.query(
      'SELECT id, serial_number, status, operating_mode, last_seen_at, firmware_version, configuration_version, simulator_enabled FROM machines WHERE serial_number = $1',
      [serial],
    )
  ).rows[0];
  if (!machine) throw new Error(`Không tìm thấy máy ${serial}`);
  const id = machine.id;
  const [slots, orders, results, events, telemetry] = await Promise.all([
    client.query(
      'SELECT slot_number, status, calibrated_dosage_ml, estimated_remaining_ml FROM machine_slots WHERE machine_id = $1 ORDER BY slot_number',
      [id],
    ),
    client.query(
      `SELECT o.id, o.payment_reference, o.status AS order_status, o.paid_at, o.dispensed_at,
      o.failure_code, o.needs_manual_review, ms.slot_number, dc.command_token, dc.status AS command_status,
      dc.sent_at, dc.acknowledged_at, dc.completed_at
      FROM orders o JOIN machine_slots ms ON ms.id = o.slot_id
      LEFT JOIN dispense_commands dc ON dc.order_id = o.id
      WHERE o.machine_id = $1 ORDER BY o.created_at DESC LIMIT 20`,
      [id],
    ),
    client.query(
      `SELECT dc.command_token, dr.success, dr.result_code, dr.failure_code, dr.executed_at,
      dr.device_event_id, dr.raw_payload FROM dispense_results dr
      JOIN dispense_commands dc ON dc.id = dr.command_id WHERE dc.machine_id = $1
      ORDER BY dr.received_at DESC LIMIT 20`,
      [id],
    ),
    client.query(
      'SELECT device_event_id, event_type, occurred_at, received_at, payload FROM device_events WHERE machine_id = $1 ORDER BY received_at DESC LIMIT 20',
      [id],
    ),
    client.query(
      `SELECT ms.slot_number, sr.reading_type, sr.numeric_value, sr.measured_at, sr.received_at, sr.payload
      FROM sensor_readings sr LEFT JOIN machine_slots ms ON ms.id = sr.slot_id
      WHERE sr.machine_id = $1 ORDER BY sr.received_at DESC LIMIT 30`,
      [id],
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        machine,
        slots: slots.rows,
        transactions: orders.rows,
        results: results.rows,
        events: events.rows,
        telemetry: telemetry.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
