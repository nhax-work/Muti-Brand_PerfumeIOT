/**
 * Giả lập khách trả tiền qua cổng mock: gửi webhook ĐÃ KÝ tới API đang chạy.
 *
 *   npm run pay:mock -- ORD-20261001-7KQ2MX                 # thành công
 *   npm run pay:mock -- ORD-20261001-7KQ2MX --status FAILED # cổng báo thất bại
 *   npm run pay:mock -- ORD-20261001-7KQ2MX --amount 1000   # số tiền lệch → AMOUNT_MISMATCH
 *   npm run pay:mock -- ORD-20261001-7KQ2MX --repeat 5      # gửi lại 5 lần cùng eventId (Gate 3)
 *
 * Dùng cho mọi thanh toán đi qua cổng mock: đơn kiosk (ORD-…) và phiên thuê slot (CHK-…, ADR-0008).
 * Số tiền và loại tiền đọc từ `payments` theo mã tham chiếu, nên chỉ cần mã in trên kiosk / web.
 *
 * Cần trong .env: DATABASE_URL, PAYMENT_WEBHOOK_SECRET (cùng giá trị API đang dùng).
 * API mặc định http://localhost:3000/api/v1 — đổi bằng `--api <url>`.
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  buildMockWebhook,
  MOCK_PROVIDER,
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
} from '../apps/api/src/modules/ord/payment/mock-gateway.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    status: { type: 'string', default: 'SUCCEEDED' },
    amount: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    api: { type: 'string', default: 'http://localhost:3000/api/v1' },
  },
});

async function main(): Promise<void> {
  const reference = positionals[0];
  if (!reference)
    throw new Error('Thiếu mã tham chiếu. Ví dụ: npm run pay:mock -- ORD-20261001-7KQ2MX');
  const status = values.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED';
  const secret = process.env['PAYMENT_WEBHOOK_SECRET'];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!secret) throw new Error('Thiếu PAYMENT_WEBHOOK_SECRET trong .env');
  if (!databaseUrl) throw new Error('Thiếu DATABASE_URL trong .env');

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const found = await client.query<{ amount: string; currency: string; status: string }>(
    `SELECT amount, currency, status FROM payments WHERE provider = $1 AND provider_reference = $2`,
    [MOCK_PROVIDER, reference],
  );
  await client.end();
  const payment = found.rows[0];
  if (!payment) throw new Error(`Không có payment mock nào mang mã ${reference}`);

  const body = JSON.stringify(
    buildMockWebhook({
      reference,
      amount: values.amount ?? payment.amount,
      currency: payment.currency,
      status,
    }),
  );
  const times = Math.max(1, Number(values.repeat));
  console.log(
    `Payment ${reference}: ${payment.amount} ${payment.currency}, đang ${payment.status}`,
  );
  for (let i = 1; i <= times; i++) {
    const res = await fetch(`${values.api}/webhooks/payments/${MOCK_PROVIDER}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body),
      },
      body,
    });
    console.log(`  lần ${i}: HTTP ${res.status} ${await res.text()}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
