# Tài liệu nguồn — KHO LƯU TRỮ

> **Nội dung trong thư mục này có thể đã cũ. Đừng dùng làm căn cứ để viết code hay test.**

Đây là bộ tài liệu nguồn của giai đoạn phân tích (tuần 1), giữ nguyên trạng để phục vụ báo cáo và
để truy nguồn gốc các quyết định. Đặc tả đã tiến hóa sau khi các file này được viết, nên chúng
**không được cập nhật theo** và ở một số chỗ đã mâu thuẫn với đặc tả hiện hành.

## Nguồn chính thức nằm ở đâu

| Cần gì | Đọc file nào |
|---|---|
| Yêu cầu nghiệp vụ, chức năng, phi chức năng | `docs/FR_NFR_SCENTSTATION.md` |
| Acceptance criteria theo module | `spec/modules/<MODULE>.md` |
| Lược đồ CSDL | `spec/contracts/schema.sql` (đóng băng) |
| API, giao thức MQTT | `spec/contracts/openapi.yaml`, `spec/contracts/mqtt.md` |
| Thực thể và state machine | `spec/glossary.md` |
| Ngưỡng số, mã lỗi | `spec/constraints.md`, `spec/errors.md` |

## Điểm đã biết là lệch

Các file dưới đây vẫn dùng **mô hình 5–6 vai trò cũ** (Operations Manager, Technician, Report
Viewer). Mô hình hiện tại chỉ còn **4 vai trò**: Platform Super Admin, Operations Staff, Inventory
Staff, Brand Admin — lý do gộp ghi ở Phần D của `docs/FR_NFR_SCENTSTATION.md`.

- `BUSINESS_REQUIREMENTS_SCENTSTATION.md`
- `FUNCTIONAL_REQUIREMENTS_SCENTSTATION.md`
- `YEU_CAU_CHUC_NANG_SCENTSTATION.md`
- `USE_CASE_SPECIFICATION_SCENTSTATION.md`
- `USE_CASE_MERMAID_DIAGRAMS.md`
- `KE_HOACH_TRIEN_KHAI_SCENTSTATION.md`
- `DATABASE_DESIGN_SCENTSTATION.md`
- `DATABASE_TABLES_AND_RELATIONSHIPS.md`

Ngoài ra bộ yêu cầu chức năng ở đây có trước khi bổ sung FR-MCH-15÷17, FR-SLT-19÷29 và
FR-INV-22÷31, nên thiếu hẳn luồng Brand Admin tự yêu cầu thuê slot, luồng gán sản phẩm vào slot,
và luồng khai báo/đối chiếu lô hàng gửi đến kho.

## Ngoại lệ: `DB_DIAGRAM_MERMAID.md` vẫn đang dùng

`DB_DIAGRAM_MERMAID.md` **không** thuộc diện lưu trữ. Đó là thiết kế CSDL đã chốt và là nguồn trực
tiếp của `spec/contracts/schema.sql`; cả `schema.sql`, file migration, `spec/contracts/erd.md` và
ADR-0002 đều trích dẫn nó. Đừng xóa và đừng sửa mà không qua ADR — sửa nó mà không sửa `schema.sql`
là làm hai file lệch nhau.

## Vì sao không xóa thư mục này

`docs/FR_NFR_SCENTSTATION.md` Phần D yêu cầu bản nộp có bảng truy vết bốn cột
BR → FR → Use Case → Test Case, dựng từ use case specification. Toàn bộ thư mục chiếm chưa tới
250 KB, không tham gia build, không vào CI, và không lọt vào ngữ cảnh của agent trừ khi có người
mở ra.
