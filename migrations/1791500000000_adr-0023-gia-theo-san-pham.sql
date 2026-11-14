-- Up Migration
--
-- ADR-0023: giá mỗi lượt xịt đặt theo sản phẩm, slot lấy theo. Migration chỉ sửa DỮ LIỆU, không đổi
-- lược đồ: đưa giá của mọi hóa đơn đang giữ slot đã gán sản phẩm về đúng giá của sản phẩm, để dữ liệu
-- cũ (đặt giá riêng từng slot) khớp quy tắc mới ngay. Hóa đơn LIQUIDATED giữ nguyên (BR-013).

UPDATE slot_rentals sr
   SET price_per_spray = fp.default_price,
       updated_at      = now()
  FROM fragrance_products fp
 WHERE sr.fragrance_product_id = fp.id
   AND sr.status IN ('DRAFT', 'ACTIVE', 'EXPIRING', 'GRACE')
   AND sr.price_per_spray IS DISTINCT FROM fp.default_price;


-- Down Migration

-- Giá riêng từng slot trước đây không còn lưu ở đâu nên không khôi phục được; không làm gì.
SELECT 1;
