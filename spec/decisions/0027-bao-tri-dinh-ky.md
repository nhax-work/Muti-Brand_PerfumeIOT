# ADR-0027 — Bảo trì định kỳ: kế hoạch theo máy tự sinh phiếu bảo trì

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Ở buổi review với hội đồng, nhóm được hỏi: *"Lấy gì để Operations biết khi nào phải bảo trì hay sửa
chữa?"*

| Nhu cầu | Hiện có |
|---|---|
| Sự cố | Có. Cảnh báo nghiêm trọng tự tạo phiếu bảo trì (FR-ALR-13); cảnh báo quá hạn được nâng mức (FR-ALR-14) |
| Giao việc, hạn xử lý | Có. `maintenance_tickets` có `assigned_to`, `due_at`, `priority`, `source_alert_id` (FR-MNT-02, 03) |
| **Bảo trì định kỳ** (vệ sinh vòi, kiểm tra bơm, hiệu chuẩn liều, kiểm tra tổng quát) | **Không có.** Không bảng, không FR, không job. Operations chỉ biết bảo trì khi máy đã hỏng |

Máy xịt nước hoa cần vệ sinh vòi định kỳ để không lẫn mùi và tắc vòi (rủi ro đã ghi trong
`seed_document/KE_HOACH_TRIEN_KHAI_SCENTSTATION.md`: "vệ sinh định kỳ"). Máy bán nhiều thì vòi bẩn
nhanh hơn, nên chu kỳ chỉ theo ngày là chưa đủ.

Việc này **đổi lược đồ CSDL trong giai đoạn đóng băng code** (từ 08/11), nên cần ADR này được duyệt
trước khi viết code.

## Phương án đã cân nhắc

1. **Bảng `tasks` chung cho mọi việc của Operations.** `maintenance_tickets` đã là bảng việc của
   Operations (người làm, hạn, trạng thái, lịch sử, thời gian xử lý — FR-MNT-02 ÷ 16). Thêm bảng song
   song thì mỗi việc có hai bản ghi phải giữ khớp trạng thái.
2. **Tính lịch bảo trì từ dữ liệu sẵn có, không thêm bảng** (như ADR-0026 làm với việc cần nạp).
   Không được: chu kỳ bảo trì là một **quy định** do người vận hành đặt, không suy ra được từ dữ
   liệu nào.
3. **Bảng kế hoạch `maintenance_plans` (quy định), job sinh phiếu `maintenance_tickets` (việc).**
   **Chọn.** Chỉ lưu thứ không suy ra được; việc vẫn chỉ nằm ở một chỗ là phiếu bảo trì, đi qua đúng
   luồng phiếu hiện có (DRAINING, checklist, đóng phiếu).

## Quyết định

### 1. Lược đồ (migration mới, module MNT sở hữu)

```sql
CREATE TYPE maintenance_task_type AS ENUM
    ('CLEAN_NOZZLE', 'CHECK_PUMP', 'CALIBRATE_DOSE', 'GENERAL_INSPECTION');

CREATE TABLE maintenance_plans (
    id                uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id        uuid                  NOT NULL REFERENCES machines (id),
    task_type         maintenance_task_type NOT NULL,
    interval_days     int,
    interval_sprays   int,
    lead_days         int                   NOT NULL DEFAULT 0,
    default_assignee  uuid                  REFERENCES users (id),
    last_done_at      timestamptz,
    active            boolean               NOT NULL DEFAULT true,
    created_by        uuid                  NOT NULL REFERENCES users (id),
    created_at        timestamptz           NOT NULL DEFAULT now(),
    updated_at        timestamptz           NOT NULL DEFAULT now(),

    CONSTRAINT chk_plan_has_interval   CHECK (interval_days IS NOT NULL OR interval_sprays IS NOT NULL),
    CONSTRAINT chk_plan_interval_days  CHECK (interval_days IS NULL OR interval_days > 0),
    CONSTRAINT chk_plan_interval_spray CHECK (interval_sprays IS NULL OR interval_sprays > 0),
    CONSTRAINT chk_plan_lead_days      CHECK (lead_days >= 0)
);
-- Mỗi máy một kế hoạch cho mỗi loại việc.
CREATE UNIQUE INDEX uq_plan_machine_task ON maintenance_plans (machine_id, task_type);

ALTER TABLE maintenance_tickets
    ADD COLUMN maintenance_plan_id uuid REFERENCES maintenance_plans (id);
-- Mỗi kế hoạch chỉ một phiếu chưa đóng — job chạy lại hay chạy song song không sinh trùng.
CREATE UNIQUE INDEX uq_ticket_open_per_plan ON maintenance_tickets (maintenance_plan_id)
    WHERE maintenance_plan_id IS NOT NULL AND status <> 'CLOSED';
```

- `maintenance_plan_id IS NULL` là phiếu sự cố hoặc phiếu tạo tay như hiện nay; phiếu định kỳ có
  `category = 'PREVENTIVE'`.
- **Lượt xịt kể từ lần bảo trì trước** tính lúc chạy: số `dispense_results.success = true` của lệnh
  trên máy, `received_at > coalesce(last_done_at, plan.created_at)`. Không lưu bộ đếm riêng để không
  phải giữ khớp.

### 2. Đến hạn và sinh phiếu (job, chạy mỗi giờ)

Kế hoạch `active` chưa có phiếu mở được coi là đến hạn khi **một trong hai** điều kiện đúng:

| Theo | Mốc đến hạn | Sinh phiếu khi |
|---|---|---|
| Ngày | `coalesce(last_done_at, created_at) + interval_days` | `now ≥ mốc − lead_days` |
| Lượt xịt | đủ `interval_sprays` lượt | đã đạt `MAINTENANCE_SPRAY_LEAD_PERCENT`% số lượt |

Phiếu sinh ra: `category = 'PREVENTIVE'`, `severity = 'INFO'`, `priority = 'MEDIUM'`, `assigned_to =
default_assignee` (trạng thái `ASSIGNED` nếu có người, `OPEN` nếu không), `due_at` = mốc đến hạn theo
ngày, hoặc `now + MAINTENANCE_SPRAY_DUE_DAYS` nếu đến hạn theo lượt xịt. Trùng `uq_ticket_open_per_plan`
thì bỏ qua. Ghi `AuditLog` `mnt.ticket.preventive_created`.

### 3. Hoàn tất

Đóng phiếu định kỳ (`CLOSED`) thì cùng transaction đặt `maintenance_plans.last_done_at = closed_at`;
chu kỳ sau tính từ đó. Luồng đóng phiếu giữ nguyên (FR-MNT-11 ÷ 13).

### 4. Quá hạn

Phiếu định kỳ chưa đóng mà quá `due_at` → `AlrService.raiseAlert` loại `MAINTENANCE_OVERDUE`, mức
`WARNING`, khóa chống trùng theo phiếu; từ đó FR-ALR-14 nâng mức nếu vẫn không xử lý. `alerts.type` là
`varchar`, không cần thêm enum.

### 5. Contract HTTP (tag MNT)

| Thao tác | Mô tả | Quyền |
|---|---|---|
| `GET /machines/{id}/maintenance-plans` | Kế hoạch của máy, kèm `nextDueAt`, `spraysSinceLastDone`, phiếu đang mở | `maintenance.handle` |
| `POST /machines/{id}/maintenance-plans` | Thêm kế hoạch | `maintenance.handle` |
| `POST /machines/{id}/maintenance-plans/defaults` | Áp bộ kế hoạch mặc định (bỏ qua loại việc đã có) | `maintenance.handle` |
| `PATCH /maintenance-plans/{id}` | Sửa chu kỳ, người mặc định, bật/tắt | `maintenance.handle` |
| `GET /maintenance-schedule?days=30` | Lịch sắp tới của mọi máy: kế hoạch đến hạn trong N ngày và phiếu định kỳ đang mở | `maintenance.handle` |
| `GET /maintenance-tickets?assignedTo=me&open=true` | "Việc của tôi": thêm giá trị `me` và tham số `open` cho endpoint sẵn có | `maintenance.handle` |

`MaintenanceTicket` thêm `maintenancePlanId` và `taskType` (null với phiếu sự cố). Dùng quyền
`maintenance.handle` sẵn có của Operations Staff — không thêm quyền mới.

### 6. Ngưỡng mới (`constraints.md`, nhóm Bảo trì)

| Hằng | Giá trị đề xuất | Ý nghĩa |
|---|---|---|
| `MAINTENANCE_SPRAY_LEAD_PERCENT` | 90 | Sinh phiếu khi đạt 90% số lượt của chu kỳ |
| `MAINTENANCE_SPRAY_DUE_DAYS` | 3 | Hạn xử lý phiếu sinh theo lượt xịt |
| `MAINTENANCE_DEFAULT_CLEAN_NOZZLE_DAYS` | 30 | Mặc định vệ sinh vòi |
| `MAINTENANCE_DEFAULT_CLEAN_NOZZLE_SPRAYS` | 5000 | Mặc định vệ sinh vòi theo lượt |
| `MAINTENANCE_DEFAULT_CHECK_PUMP_DAYS` | 90 | Mặc định kiểm tra bơm |
| `MAINTENANCE_DEFAULT_CALIBRATE_DAYS` | 90 | Mặc định hiệu chuẩn liều |
| `MAINTENANCE_DEFAULT_INSPECTION_DAYS` | 365 | Kiểm tra tổng quát thường niên |
| `MAINTENANCE_DEFAULT_LEAD_DAYS` | 3 | Sinh phiếu trước hạn |

Giá trị mặc định là đề xuất của nhóm, cần đối chiếu khuyến nghị của nhà sản xuất bơm và vòi khi có.

### 7. FR mới (`spec/modules/MNT.md`)

- **FR-MNT-18** — Kế hoạch bảo trì định kỳ theo máy (theo ngày và/hoặc lượt xịt, mỗi loại việc một
  kế hoạch, áp bộ mặc định).
- **FR-MNT-19** — Tự sinh phiếu bảo trì định kỳ khi đến hạn; mỗi kế hoạch tối đa một phiếu chưa đóng.
- **FR-MNT-20** — Đóng phiếu định kỳ cập nhật lần bảo trì gần nhất của kế hoạch.
- **FR-MNT-21** — Phiếu định kỳ quá hạn sinh cảnh báo, nâng mức theo FR-ALR-14.
- **FR-MNT-22** — Việc của tôi và lịch bảo trì sắp tới cho Operations Staff.

## Hệ quả

- **Contract:** `schema.sql` (1 enum, 1 bảng, 1 cột, 2 index), `erd.md`, `data-dictionary.md`,
  `openapi.yaml` (5 thao tác mới, 2 tham số, 2 trường), `constraints.md`. Migration
  `migrations/1791700000000_adr-0027-bao-tri-dinh-ky.sql`. Chạy `npm run db:types`,
  `npm run spec:generate`, `npm run contracts:generate`, `make test-contract`.
- **Sơ đồ SDD:** ERD trong `docs/diagrams/` thêm `maintenance_plans` và quan hệ tới
  `maintenance_tickets`, `machines`, `users`.
- **API:** module MNT thêm queries, service kế hoạch và `MntJobs.tick` (đăng ký ở
  `entrypoints/scheduler.ts`); đóng phiếu cập nhật kế hoạch cùng transaction.
- **Web quản trị:** trang chi tiết máy thêm khối "Kế hoạch bảo trì"; trang Bảo trì thêm tab "Việc của
  tôi" (mặc định của Operations Staff, xếp theo hạn, quá hạn tô đỏ) và tab "Lịch 30 ngày".
- **Test:** sinh phiếu theo ngày, theo lượt xịt, không sinh trùng khi job chạy hai lần hoặc song song,
  đóng phiếu dời mốc chu kỳ, quá hạn sinh cảnh báo, kế hoạch tắt không sinh phiếu, quyền.
- **Câu trả lời cho hội đồng:** sự cố → cảnh báo nghiêm trọng tự tạo phiếu; định kỳ → kế hoạch của
  từng máy tự sinh phiếu trước hạn. Cả hai cùng là phiếu bảo trì, có người phụ trách, hạn và nâng mức
  khi quá hạn; Operations Staff xem "Việc của tôi".
