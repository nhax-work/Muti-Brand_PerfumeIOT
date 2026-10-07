# ADR-0011 — `REJECT CMD_DUPLICATE` không khép lệnh gốc

**Ngày:** 2026-10-07 · **Trạng thái:** đã duyệt (TV1, 2026-10-07) · **Người quyết:** TV1

## Bối cảnh

`spec/contracts/mqtt.md` §6, bảng "Ánh xạ sang `dispense_commands.status`", xếp mọi `REJECT` có mã khác
`PRESS_TIMEOUT` vào hai dòng: sau `ACK` thì `FAILED` + kiểm tra thủ công, trước `ACK` thì `FAILED`.
Bảng không tách riêng `CMD_DUPLICATE`.

Test e2e `test_FR_DSP_10_device_rejects_replayed_command` (`tests/e2e/test_command_ttl.test.ts`) phát
hiện chuyện gì xảy ra khi đi đúng theo bảng:

1. Backend publish lệnh `C`. Thiết bị sáng đèn và gửi `ACK`; lệnh `C` chuyển `ACKNOWLEDGED`.
2. Broker gửi lại `C`. Chuyện này bình thường với QoS 1, ví dụ khi thiết bị nối lại mạng trước lúc
   PUBACK tới broker.
3. Thiết bị từ chối bản sao đó bằng `REJECT CMD_DUPLICATE` (§5.1 bước 4). Bản tin mang
   `command_token` của `C`.
4. Backend hiểu đây là "REJECT mã khác, sau ACK": `C` chuyển `REJECTED`, đơn chuyển `FAILED` và bị
   cắm cờ kiểm tra thủ công.
5. **Đèn của `C` vẫn sáng.** Khách bấm, máy xịt, gửi `RESULT success=true`. Backend bỏ qua bản tin
   này vì lệnh đã khép. Kết quả: khách nhận được lượt xịt nhưng đơn ghi `FAILED`, và người vận hành
   có thể hoàn tiền cho một lượt đã xịt.

Tóm lại, `CMD_DUPLICATE` nói về **bản sao** của lệnh, không nói về lệnh gốc.

## Phương án đã cân nhắc

1. **Giữ bảng như cũ.** Mọi lần broker gửi lại đều làm hỏng đơn đang chờ bấm.
2. **Bỏ qua `REJECT CMD_DUPLICATE`.** Không đổi lệnh, không đổi đơn. Nếu kết quả của lệnh gốc bị mất
   thật, mốc `UNKNOWN` (FR-DSP-18) vẫn đưa đơn vào kiểm tra thủ công. Lưới an toàn hiện có không mất
   gì.
3. **Thêm trường vào bản tin `REJECT`** để thiết bị nói rõ đang từ chối bản sao. Cách này phải đổi
   cả contract lẫn firmware, trong khi phương án 2 đã đủ.

## Quyết định

Chọn **phương án 2**. `outcomeOf` trả `IGNORED` cho `REJECT` có `failure_code = CMD_DUPLICATE`, bất kể
lệnh đã `ACK` hay chưa (`apps/api/src/modules/dsp/dispense-outcome.ts`).

Thêm một dòng vào bảng ở `mqtt.md` §6, đứng trước hai dòng "mã khác":

| Nhận được | Trạng thái lệnh | Trạng thái đơn |
|---|---|---|
| `stage = REJECT`, `failure_code = CMD_DUPLICATE` | giữ nguyên | giữ nguyên — thiết bị từ chối một bản sao, không phải lệnh gốc |

## Hệ quả

- FR-DSP-10, FR-DSP-18, FR-DSP-19: không đổi yêu cầu. Thay đổi này chỉ chặn backend suy luận sai
  từ bản tin của bản sao.
- Firmware không phải đổi gì: vẫn gửi `REJECT CMD_DUPLICATE` như §5.1.
- Test: `tests/unit/dsp.test.ts` (ánh xạ) và `tests/e2e/test_command_ttl.test.ts`
  (`test_FR_DSP_10_device_rejects_replayed_command`).

## Nhật ký áp dụng

- 2026-10-07: TV1 duyệt. Đã thêm dòng `CMD_DUPLICATE` vào bảng ánh xạ ở `spec/contracts/mqtt.md` §6
  và chạy `make test-contract`. Code ở `dispense-outcome.ts` đã áp từ trước, trên nhánh
  `feat/dsp-mqtt-dispatch`.
