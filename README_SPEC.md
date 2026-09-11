# Cấu trúc spec/

Hai nơi chứa yêu cầu, cùng nguồn, khác đối tượng đọc:

| | Đối tượng | Nội dung |
|---|---|---|
| `spec/` | AI agent và lập trình viên | FR có acceptance criteria, contract, ngưỡng số |
| `docs/` | Giảng viên và hội đồng | SRS, sơ đồ, báo cáo. Sinh từ `spec/` |

Sửa ở `spec/`, xuất sang `docs/`. Không sửa hai nơi.

```
AGENTS.md                    điểm vào cho mọi agent
CLAUDE.md                    1 dòng trỏ về AGENTS.md
.github/copilot-instructions.md   1 dòng trỏ về AGENTS.md

spec/
  glossary.md                mô hình miền + state machine
  constraints.md             mọi ngưỡng số ở một chỗ
  errors.md                  danh mục mã lỗi
  testing.md                 quy ước đặt tên test
  traceability.csv           BR -> FR -> Use Case -> Test
  contracts/                 ĐÓNG BĂNG cuối tuần 1
    openapi.yaml
    schema.sql
    erd.md
    data-dictionary.md
    mqtt.md
  modules/                   17 file, mỗi module một file
    AUTH.md BND.md USR.md PRD.md MCH.md
    SLT.md EXP.md REV.md
    ORD.md DSP.md IOT.md
    INV.md RFQ.md ALR.md MNT.md RPT.md AUD.md
  decisions/                 nhật ký quyết định kiến trúc
    0001-vi-du.md

tests/
  contract/  unit/  integration/  e2e/
scripts/
  check_traceability.py
```

## Ba nguyên tắc

**Một nguồn cho mỗi thứ.** Ngưỡng số chỉ ở `constraints.md`. Mã lỗi chỉ ở `errors.md`. Lặp
lại ở nơi thứ hai là bảo đảm sẽ lệch sau vài tuần.

**Contract đóng băng cuối tuần 1.** Bốn agent không có contract chung sẽ sinh ra bốn kiến trúc.

**Chỉ viết acceptance criteria cho FR cần.** CRUD đơn giản để dạng phát biểu. Viết kỹ cho
SLT, EXP, REV, ORD, DSP.
