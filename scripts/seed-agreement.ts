import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';

const FRAMEWORK_CONTENT = `HỢP ĐỒNG KHUNG CUNG CẤP DỊCH VỤ THUÊ SLOT MÁY TRẢI NGHIỆM NƯỚC HOA SCENTSTATION

Phiên bản: v1.0
Áp dụng cho: Mọi thương hiệu đối tác tham gia thuê slot trên hệ sinh thái ScentStation.

ĐIỀU 1: ĐỐI TƯỢNG VÀ PHẠM VI DỊCH VỤ
Nền tảng ScentStation cung cấp hệ thống máy kiosk trải nghiệm nước hoa thông minh đặt tại các địa điểm thương mại. Thương hiệu thuê vị trí slot trên máy để trưng bày và cho khách hàng trải nghiệm sản phẩm nước hoa dạng xịt định lượng tự động.

ĐIỀU 2: QUYỀN VÀ NGHĨA VỤ CỦA THƯƠNG HIỆU
1. Thương hiệu chịu trách nhiệm về chất lượng, nguồn gốc xuất xứ và độ an toàn của sản phẩm nước hoa nạp vào slot.
2. Thương hiệu thanh toán đầy đủ phí thuê slot và phí dịch vụ bảo quản hàng hóa theo từng phiên thanh toán.
3. Thương hiệu có quyền đổi slot cùng máy trong vòng 48 giờ sau khi thanh toán nếu slot chưa được lắp chai.

ĐIỀU 3: BẢO VỆ DỮ LIỆU VÀ CÔ LẬP
Hệ thống bảo đảm dữ liệu doanh thu, lượt xịt và cấu hình slot của từng thương hiệu được cô lập hoàn toàn, không thể bị truy cập bởi các thương hiệu khác cùng đặt máy.`;

async function main() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is missing');

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const hash = createHash('sha256').update(FRAMEWORK_CONTENT, 'utf8').digest('hex');
  const adminId = '33333333-3333-4333-8333-000000000001';

  await client.query(
    `INSERT INTO agreement_versions (id, version, title, content, content_hash, is_current, published_at, created_by)
     VALUES ('cccccccc-cccc-4ccc-8ccc-000000000001', 'v1.0', 'Hợp đồng khung cung cấp dịch vụ ScentStation', $1, $2, true, now(), $3)
     ON CONFLICT (version) DO UPDATE
     SET content = EXCLUDED.content,
         content_hash = EXCLUDED.content_hash,
         is_current = true`,
    [FRAMEWORK_CONTENT, hash, adminId],
  );

  console.log('✅ Đã nạp thành công Hợp đồng khung v1.0 vào CSDL!');
  console.log('Content Hash:', hash);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
