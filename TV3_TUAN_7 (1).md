# TV3 — việc cần sửa để hoàn chỉnh tuần 7

Rà ngày **24/10/2026** trên `dev` tại `2160f58`. Bản tổng hợp cả nhóm ở `docs/TUAN_7_CAN_SUA.md`.

Phần việc tuần 7 của TV3 đã xong và có test trên CSDL thật:
- phụ lục (FR-SLT-50);
- giới hạn giữ chỗ (FR-SLT-56);
- đổi slot (FR-SLT-55);
- không gia hạn (FR-EXP-23 ÷ 25);
- pháp nhân (FR-BND-09, 10);
- mua gói bằng PayOS thật — đạt, biên bản `docs/PAYOS.md` ca 5.

Còn hai việc dưới đây.

**Cách dùng với agent.** Giao **từng mục** `W7-xx`, không giao cả file. Câu mở đầu gợi ý:

```
Đọc spec/PROJECT.md và TV3_TUAN_7.md. Làm mục W7-<xx>. Dừng ở mọi điểm ghi DỪNG.
```

Mỗi PR ghi mã `W7-xx` trong mô tả.

---

## 1. Việc cần sửa

#### W7-12 · AC của FR-EXP-23, 24 lệch contract

- **Chỗ:** `spec/modules/EXP.md`, mục FR-EXP-23 và FR-EXP-24
- **Lệch:**
  - FR-EXP-23 AC1 đòi địa chỉ và người liên hệ khi gửi về thương hiệu, nhưng contract
    `SlotRentalNonRenewal` chỉ có `returnMethod`.
  - Giá trị cách nhận hàng trong AC là `PICKUP_AT_WAREHOUSE` / `DELIVER_TO_BRAND`, còn enum
    `bottle_return_method` là `WAREHOUSE_PICKUP` / `SHIP_TO_BRAND`.
  - FR-EXP-23 AC2 ghi 400 `VALIDATION_ERROR`, nhưng contract và code trả 409 `RENTAL_NOT_ACTIVE`.
  - FR-EXP-24 AC2 lệch tương tự.
- **Gợi ý:** nhật ký áp dụng của ADR-0014 ghi `bottle_returns` chụp địa chỉ lúc lập phiếu trả hàng
  (FR-EXP-26). Như vậy địa chỉ lấy từ hồ sơ thương hiệu lúc tháo chai, không cần nhập lúc báo không gia
  hạn — khả năng cao chỉ cần sửa AC cho khớp contract.
- **DỪNG:** hỏi TV1 xác nhận trước khi sửa. Nếu nhóm vẫn muốn nhập địa chỉ lúc báo, TV1 thêm trường vào
  contract trước, rồi TV3 sửa code và màn hình.
- **Xong khi:** AC trong `EXP.md` khớp contract và code. Test `test_FR_EXP_23_*`, `test_FR_EXP_24_*` vẫn
  xanh.

#### W7-23 · Email xác minh đăng ký chưa gửi thật (cùng TV4)

- **Chỗ:** `apps/api/src/modules/auth/email-verification-sender.ts`, `auth.module.ts`
- **Lỗi:** `LoggingEmailVerificationSender` chỉ in link ra log khi bật cờ dev. Thương hiệu thật không
  nhận được email xác minh (FR-USR-07), nên chuỗi G5 "thương hiệu tự đăng ký → hợp đồng khung → phụ lục
  → thanh toán…" không chạy được ngoài máy dev.
- **Phụ thuộc:** TV4 làm kênh gửi SMTP dùng chung ở W7-01 (`TV4_TUAN_7.md`). Làm sau khi kênh đó có.
- **Sửa:**
  - Thay `LoggingEmailVerificationSender` bằng sender gửi qua kênh dùng chung. Vẫn giữ in link ra log
    khi bật `DEV_LOG_EMAIL_VERIFICATION_TOKEN`.
  - Kênh đang ở chế độ `log` thì không gửi, và không ghi token ra log ngoài cờ dev.
  - Gửi lỗi thì chỉ ghi log cảnh báo, không làm hỏng đăng ký — tài khoản đã tạo, người dùng bấm "gửi
    lại email xác minh" để có mã mới.
  - Tiêu đề và nội dung email lấy từ `packages/i18n` (cả `vi` lẫn `en`). Nội dung có link
    `${ADMIN_WEB_BASE_URL}/verify-email?token=…` và số giờ hết hạn
    `EMAIL_VERIFICATION_TOKEN_TTL_HOURS`.
  - `test_slt_golden_path.test.ts` cắm `CapturingEmailSender` bằng `AuthService.setEmailSender` — giữ
    nguyên interface `EmailVerificationSender` và hàm đó để test không phải sửa.
- **Xong khi:** đăng ký bằng email thật nhận được thư có link xác minh; test hiện có vẫn xanh.

---

## 2. Chuyển sang tuần 8

- **FR-EXP-25 AC1:** job chuyển `GRACE` (FR-EXP-06, TV3 T8) phải bỏ qua hóa đơn đã báo không gia hạn.
  Hiện chưa có job `GRACE`, nên AC1 chưa test được — thêm test khi làm job.
- **FR-SLT-24:** kích hoạt hóa đơn khi lắp chai đầu tiên chạy trong transaction đóng phiếu nạp của TV4
  (W7-04). Service SLT cần nhận `tx` truyền vào.
- **Email hết hạn, ân hạn, thanh lý (FR-ALR-16):** dùng đường gửi của W7-01, không viết lại.

## 3. Xong tuần 7 khi

- W7-12 và W7-23 đã merge vào `dev`.
- `npm test` và `npm run lint` xanh.
