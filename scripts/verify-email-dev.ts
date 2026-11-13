/**
 * Script hỗ trợ xác minh email nhanh cho môi trường dev.
 * Sử dụng: npx tsx scripts/verify-email-dev.ts <email>
 * Ví dụ:   npx tsx scripts/verify-email-dev.ts tai123@gmail.com
 */

import pg from 'pg';
import 'dotenv/config';

const email = process.argv[2]?.trim();

if (!email) {
  console.error('❌ Vui lòng cung cấp email cần xác minh!');
  console.error('Ví dụ: npx tsx scripts/verify-email-dev.ts tai123@gmail.com');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scentstation',
});

async function main() {
  await client.connect();

  const check = await client.query(
    'SELECT id, user_id, email, verified_at FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [email],
  );

  if (check.rows.length === 0) {
    console.error(`❌ Không tìm thấy bản ghi xác minh cho email: ${email}`);
    process.exit(1);
  }

  const record = check.rows[0];
  if (record.verified_at) {
    console.log(`ℹ️ Email ${email} đã được xác minh trước đó vào lúc: ${record.verified_at}`);
    process.exit(0);
  }

  await client.query('UPDATE email_verifications SET verified_at = NOW() WHERE email = $1', [
    email,
  ]);

  console.log(`✅ Đã xác minh email thành công cho tài khoản: ${email}`);
  console.log('👉 Bây giờ bạn có thể đăng nhập hoặc F5 lại trang Admin Web!');
  await client.end();
}

main().catch((err) => {
  console.error('Lỗi khi xác minh email:', err);
  process.exit(1);
});
