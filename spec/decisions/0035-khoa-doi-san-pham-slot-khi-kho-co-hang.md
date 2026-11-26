# ADR-0035 — Khóa đổi sản phẩm của slot khi kho đã có hàng hoặc đã lắp chai

**Ngày:** 2026-11-26 · **Trạng thái:** đã duyệt (2026-11-26) · **Người quyết:** nhóm

Sửa FR-SLT-28 (đổi sản phẩm gán cho slot). Bổ sung ADR-0026 (việc cần nạp).

## Bối cảnh

FR-SLT-28 cho Brand Admin đổi sản phẩm của slot bất cứ lúc nào khi hóa đơn đã thanh toán và chưa kết
thúc. `SltService.assignProduct` chỉ kiểm hóa đơn đã thanh toán, sản phẩm cùng thương hiệu và chưa
ngừng kinh doanh, không xét slot đã lắp chai hay kho đang làm gì. Pop-up Cấu hình slot vẫn cho chọn
sản phẩm khác dù đang hiện "Slot đã lắp chai".

| Tình huống | Hệ quả |
|---|---|
| Chai P1 đã lắp, brand đổi sang P2 | Kiosk hiện tên và **giá của P2** nhưng máy xịt P1. Khách trả tiền cho thứ khác với thứ nhận; doanh thu theo sản phẩm sai |
| Kho đã nhận hàng P1, staff đã soạn chai hoặc đã mở phiếu nạp, brand đổi sang P2 | Đóng phiếu bị chặn `PRODUCT_MISMATCH` (chai mang theo là P1); công soạn hàng bỏ phí |
| Yêu cầu bổ sung đã duyệt hoặc đã hẹn lịch cho P1 | Yêu cầu ghi P1, slot đã sang P2 |
| Đổi sang P2 chưa gửi hàng | Slot quay về chờ hàng. Hạn `RENTAL_MAX_STOCKING_DAYS` vẫn tính từ lúc thanh toán; quá hạn thì hóa đơn tự kích hoạt (ADR-0006) và tính thời hạn thuê dù slot chưa bán |

## Phương án đã cân nhắc

1. **Chỉ khóa sau khi lắp chai.** Chặn được lỗi bán sai sản phẩm nhưng không bảo vệ kho trong khoảng
   từ lúc nhận hàng tới lúc lắp — đúng lúc staff đã bỏ công.
2. **Khóa khi brand đã gửi hàng (khai báo gửi hàng).** `brand_shipment_declarations` chỉ có thương
   hiệu và sản phẩm, không gắn slot; một lô P1 có thể dùng cho nhiều slot. Hệ quả: gán nhầm P1 cho slot
   mới là khóa ngay dù không gửi gì cho slot đó; hủy khai báo là mở được khóa; hàng thất lạc hoặc lô bị
   từ chối giấy tờ thì slot kẹt vào sản phẩm không bao giờ lắp được. Muốn gắn khai báo với slot phải đổi
   lược đồ mà vẫn vướng một lô dùng cho nhiều slot.
3. **Khóa theo hàng lắp được đang có trong kho, cộng khóa vĩnh viễn sau khi lắp chai.** **Chọn.**
   Trùng đúng lúc danh sách việc cần nạp (ADR-0026) chuyển slot khỏi `NO_STOCK`, tức lúc staff thấy
   việc trên màn hình của mình. Hàng hỏng hoặc bị từ chối thì khóa tự mở. Không đổi lược đồ.

## Quyết định

### 1. Khi nào không đổi được sản phẩm

Với hóa đơn `H` đang gán sản phẩm `P` (khác NULL), `PUT /slot-rentals/{id}/product` với sản phẩm khác
`P` bị từ chối nếu thỏa **một** trong các điều kiện sau, xét theo thứ tự:

| # | Điều kiện | Mã lỗi | `productLockReason` |
|---|---|---|---|
| 1 | **Đã lắp chai cho hóa đơn:** slot đang có chai (`machine_slots.active_bottle_id` khác NULL), **hoặc** có phiếu nạp `COMPLETED` trên slot của cùng thương hiệu kể từ lúc thanh toán hóa đơn đầu chuỗi gia hạn (đi ngược `previous_rental_id`) | `SLOT_PRODUCT_LOCKED` (409) | `INSTALLED` |
| 2 | **Kho có hàng lắp được của `P`:** có chai `IN_STOCK`, `owner = BRAND`, cùng thương hiệu, sản phẩm `P`, còn hạn, thuộc lô có `authenticity_status` khác `REJECTED` | `SLOT_PRODUCT_LOCKED` (409) | `STOCK_IN_WAREHOUSE` |
| 3 | Slot có phiếu nạp `STARTED` | `REFILL_SESSION_OPEN` (409) | `REFILL_IN_PROGRESS` |
| 4 | Hóa đơn có yêu cầu bổ sung `SUBMITTED`, `ACCEPTED` hoặc `SCHEDULED` | `REFILL_REQUEST_PENDING` (409) | `REFILL_IN_PROGRESS` |

Ghi chú:

- **Điều kiện 1 khóa đến hết hóa đơn**, không phụ thuộc tồn kho: lắp xong kho có thể hết hàng, nếu chỉ
  xét tồn kho thì khóa sẽ tự mở và lặp lại lỗi bán sai sản phẩm khi kho nạp lại. Hóa đơn gia hạn kế thừa
  sản phẩm của hóa đơn cũ (đã có ở `renew`) và kế thừa luôn khóa này. Phần `active_bottle_id` phủ cả dữ
  liệu seed lắp chai không qua phiếu nạp.
- **Hóa đơn tự kích hoạt sau `RENTAL_MAX_STOCKING_DAYS` mà chưa lắp chai không bị khóa bởi điều
  kiện 1.** Không dùng `stage != AWAITING_STOCK` làm mốc khóa vì giai đoạn đó cũng kết thúc khi tự kích
  hoạt.
- **Điều kiện 2 khác `NO_STOCK` của ADR-0026 ở một điểm:** lô `REJECTED` không tính là có hàng, để lô bị
  từ chối giấy tờ không khóa slot vào sản phẩm không bao giờ lắp được. Lô `NOT_SUBMITTED` hoặc
  `PENDING` vẫn tính — hàng đã về kho và đang chờ brand nộp hoặc chờ duyệt giấy tờ.
- **Điều kiện 3 và 4** phần lớn đã nằm trong 1 hoặc 2; giữ làm lớp an toàn và để báo lý do rõ hơn cho
  brand.
- **Gán lần đầu** (`P` là NULL) và **lưu lại đúng sản phẩm đang gán** không bị chặn.
- Super Admin không có đường mở khóa riêng. Muốn bán sản phẩm khác trên slot đã lắp chai thì thuê slot
  khác hoặc đợi hóa đơn kết thúc.

### 2. Kiểm trong transaction, khóa dòng slot

`assignProduct` chạy trong transaction và khóa dòng `machine_slots` (`FOR UPDATE`) trước khi kiểm, như
`openRefillSession` đang làm, để không lọt ca brand đổi đúng lúc staff mở phiếu nạp. Kho nhận hàng cùng
lúc brand đổi thì không cần chặn: danh sách việc cần nạp tự tính lại theo sản phẩm mới.

### 3. Đổi sản phẩm không làm mới hạn lắp chai

Hạn `RENTAL_MAX_STOCKING_DAYS` vẫn tính từ `paid_at`. `product_assigned_at` đổi theo lần gán cuối như
FR-SLT-28 hiện có, nhưng không dùng cho mốc hạn. Ghi rõ để brand không đổi qua lại nhằm giữ slot không
thời hạn.

### 4. Báo kho khi đổi sản phẩm

Đổi thành công từ `P1` sang `P2` (không áp cho gán lần đầu) gửi thông báo trong ứng dụng, type
`SLOT_PRODUCT_CHANGED`, cho mọi tài khoản nền tảng có quyền `inventory.manage` qua
`AlrService.notifyPermissionHolders`, trong cùng transaction. `notifications.type` là `varchar`, không
cần migration. `brand_id` là thương hiệu thuê slot.

### 5. Contract

- `spec/errors.md`: thêm `SLOT_PRODUCT_LOCKED` | 409 | Đổi sản phẩm của slot đã lắp chai hoặc kho đã có
  hàng lắp được của sản phẩm đang gán (FR-SLT-28, ADR-0035).
- `openapi.yaml`:
  - `SlotRental` thêm trường chỉ đọc `productLockReason`:
    `enum [INSTALLED, STOCK_IN_WAREHOUSE, REFILL_IN_PROGRESS]`, nullable. NULL nghĩa là đổi được. Chỉ
    thêm trường, không đổi trường cũ.
  - Mô tả `PUT /slot-rentals/{id}/product` thêm các mã 409 ở mục 1. Response `409` đã có sẵn.
- Lược đồ: không đổi, không migration. Ngưỡng: không thêm.

Chạy `npm run contracts:generate` và `make test-contract`.

### 6. Web quản trị (pop-up Cấu hình slot)

- `productLockReason` khác NULL: ô chọn sản phẩm chỉ cho xem, ẩn nút Lưu, hiện một dòng giải thích
  theo lý do (đã lắp chai / kho đã nhận hàng / kho đang nạp).
- Danh sách chọn sản phẩm có nhãn mức sẵn sàng: Sẵn sàng lắp, Chờ duyệt giấy tờ, Đã khai báo · chờ kho
  nhận, Chưa gửi hàng. Tính từ khai báo gửi hàng và lô mà pop-up đã tải; chỉ để gợi ý, máy chủ vẫn là
  nguồn quyết định khóa.
- Hộp xác nhận trước khi lưu:
  - Đổi sản phẩm (không phải gán lần đầu): báo kho sẽ phải chuẩn bị lại; nếu sản phẩm mới kém sẵn sàng
    hơn sản phẩm cũ thì nêu slot chưa bán được cho tới khi gửi hàng và duyệt giấy tờ, kèm **ngày hạn lắp
    chai** cụ thể.
  - Sản phẩm được chọn đã có hàng trong kho (gán lần đầu hoặc đổi): báo sau khi lưu sẽ không đổi được
    nữa — tránh khóa nhầm vì chọn sai.
  - Có khai báo gửi hàng của sản phẩm cũ đang `DECLARED`: báo hàng đang gửi sẽ không dùng cho slot này.
- Chuỗi mới thêm vào `packages/i18n` cả `vi` và `en`.

## Hệ quả

- **Đặc tả:** viết lại FR-SLT-28 trong `spec/modules/SLT.md` và `docs/FR_NFR_SCENTSTATION.md`:
  "Hệ thống phải cho phép Brand Admin đổi sản phẩm gán cho slot khi slot chưa lắp chai và kho chưa có
  hàng lắp được của sản phẩm đang gán, ghi nhận thời điểm đổi và báo Inventory Staff." Giữ AC1, AC2;
  thêm AC cho từng điều kiện ở mục 1, ca lô `REJECTED` mở khóa, ca tự kích hoạt chưa lắp chai, hóa đơn
  gia hạn kế thừa khóa, thông báo kho, hạn lắp chai không đổi.
- **API:** `SltService.assignProduct` (transaction, khóa slot, bốn điều kiện, thông báo);
  `SltQueries` thêm truy vấn lý do khóa, dùng chung cho `assignProduct` và cho trường
  `productLockReason` ở các endpoint trả `SlotRental` (EXISTS con, một truy vấn mỗi danh sách). Điều
  kiện chai lắp được tái dùng điều kiện của `refillWorklist` trừ lô `REJECTED`. SLT đọc
  `bottles`, `inventory_batches`, `refill_sessions`, `refill_requests` qua truy vấn chỉ đọc; không ghi
  sang module khác.
- **Kiosk, firmware:** không đổi. Đơn đang chờ vẫn giữ ảnh chụp sản phẩm cũ (FR-SLT-28 AC2).
- **Test** (`test_FR_SLT_28_*`, tích hợp với CSDL thật):
  - từ chối khi slot đang có chai; khi đã có phiếu nạp hoàn tất trong chuỗi gia hạn;
  - từ chối khi kho có chai lắp được; cho đổi khi mọi lô của sản phẩm đều `REJECTED` hoặc chai đã hết hạn;
  - cho đổi khi hóa đơn tự kích hoạt mà chưa lắp chai;
  - từ chối khi có phiếu nạp mở, khi có yêu cầu bổ sung chưa kết thúc;
  - gán lần đầu và lưu lại cùng sản phẩm không bị chặn;
  - đổi thành công gửi `SLOT_PRODUCT_CHANGED` cho người có `inventory.manage`; gán lần đầu thì không;
  - đổi sản phẩm không dời hạn `RENTAL_MAX_STOCKING_DAYS`;
  - đổi sản phẩm và mở phiếu nạp đồng thời: chỉ một bên thành công;
  - `productLockReason` khớp với kết quả của `PUT`.
  - Giao diện: pop-up khóa theo từng lý do, nhãn sẵn sàng, các biến thể hộp xác nhận.
