# MERMAID DIAGRAMS — SCENTSTATION USE CASE

Các khối dưới đây có thể chèn trực tiếp vào Markdown hỗ trợ Mermaid. Mermaid không có ký pháp UML Use Case gốc, vì vậy tài liệu dùng `flowchart` với actor ở ngoài và use case nằm trong `subgraph ScentStation`.

## 1. Use Case tổng quan Web-first

```mermaid
flowchart LR
    PSA["👤 Platform Super Admin"]
    BA["👤 Brand Administrator"]
    OM["👤 Operations Manager"]
    TECH["👤 Technician"]
    INV["👤 Inventory Staff"]
    VIEW["👤 Viewer"]
    CUSTOMER["👤 Customer / Kiosk User"]
    PROVIDER["🏦 Payment Provider"]
    GATEWAY["⚙️ Device Gateway / Simulator"]

    subgraph SYSTEM["ScentStation — Web-first"]
        IAM(["UC-W01–W06<br/>Tài khoản, tenant và phân quyền"])
        CATALOG(["UC-W07–W10<br/>Sản phẩm, địa điểm, máy và ngăn"])
        INVENTORY(["UC-W11–W13<br/>Lô, chai, refill và tồn kho"])
        KIOSK(["UC-W14–W19<br/>Kiosk, order, payment và dispense"])
        TRANSACTION(["UC-W20–W21<br/>Đối soát và xử lý bất thường"])
        OPERATION(["UC-W22–W24<br/>Cảnh báo và bảo trì"])
        ANALYTICS(["UC-W25–W27<br/>Dashboard, báo cáo và audit"])
    end

    PSA --> IAM
    PSA --> ANALYTICS
    BA --> IAM
    BA --> CATALOG
    BA --> INVENTORY
    BA --> ANALYTICS
    OM --> CATALOG
    OM --> TRANSACTION
    OM --> OPERATION
    OM --> ANALYTICS
    TECH --> OPERATION
    INV --> INVENTORY
    VIEW --> ANALYTICS
    CUSTOMER --> KIOSK
    PROVIDER --> KIOSK
    GATEWAY --> KIOSK
```

## 2. Authentication, tenant và RBAC

```mermaid
flowchart LR
    PSA["👤 Platform Super Admin"]
    BA["👤 Brand Administrator"]
    STAFF["👤 Operations / Technician / Inventory / Viewer"]

    subgraph SYSTEM["ScentStation — Identity & Access"]
        W01(["UC-W01<br/>Đăng nhập"])
        W02(["UC-W02<br/>Làm mới token / đăng xuất / thu hồi phiên"])
        W03(["UC-W03<br/>Quản lý tenant"])
        W04(["UC-W04<br/>Quản lý người dùng"])
        W05(["UC-W05<br/>Quản lý role, permission và scope"])
        W06(["UC-W06<br/>Quản lý thông tin thương hiệu"])
    end

    PSA --> W01
    PSA --> W02
    PSA --> W03
    PSA --> W04
    PSA --> W05
    BA --> W01
    BA --> W02
    BA --> W04
    BA --> W05
    BA --> W06
    STAFF --> W01
    STAFF --> W02

    W04 -. "yêu cầu kiểm tra quyền" .-> W05
    W03 -. "tenant bị tạm ngưng thì thu hồi phiên" .-> W02
```

Ghi chú đối tượng:

- `Tenant`: không gian dữ liệu độc lập của một thương hiệu.
- `Role`: nhóm quyền, ví dụ Brand Admin hoặc Technician.
- `Permission`: hành động cụ thể, ví dụ `refund.create`.
- `Scope`: phạm vi áp dụng quyền: tenant, location hoặc machine.

## 3. Catalog, địa điểm, máy và ngăn

```mermaid
flowchart LR
    BA["👤 Brand Administrator"]
    OM["👤 Operations Manager"]

    subgraph SYSTEM["ScentStation — Catalog & Machine"]
        W07(["UC-W07<br/>Quản lý sản phẩm nước hoa"])
        W08(["UC-W08<br/>Quản lý địa điểm"])
        W09(["UC-W09<br/>Đăng ký và quản lý máy"])
        W10(["UC-W10<br/>Cấu hình và quản lý ngăn máy"])
    end

    BA --> W07
    BA --> W08
    BA --> W09
    BA --> W10
    OM --> W09
    OM --> W10

    W09 -. "machine thuộc một location" .-> W08
    W10 -. "slot thuộc một machine" .-> W09
    W10 -. "slot được gán một product" .-> W07
```

Ghi chú đối tượng:

- `Machine`: một kiosk vật lý hoặc máy mô phỏng có serial duy nhất.
- `MachineSlot`: một ngăn điều khiển độc lập trong machine.
- `FragranceProduct`: thông tin loại nước hoa; không phải chai vật lý.
- Một slot có thể cấu hình một product và tối đa một active bottle.

## 4. Tồn kho và refill

```mermaid
flowchart LR
    INV["👤 Inventory Staff"]
    TECH["👤 Technician<br/>(khi được cấp quyền)"]

    subgraph SYSTEM["ScentStation — Inventory"]
        W11(["UC-W11<br/>Quản lý lô và chai / cartridge"])
        W12(["UC-W12<br/>Thực hiện refill hoặc thay chai"])
        W13(["UC-W13<br/>Điều chỉnh tồn kho"])
        ALERT(["Tạo / gộp cảnh báo tồn thấp"])
        AUDIT(["Ghi Audit Log"])
    end

    INV --> W11
    INV --> W12
    INV --> W13
    TECH --> W12
    W12 -. "sử dụng chai đã đăng ký" .-> W11
    W13 -. "điều chỉnh chai/ngăn" .-> W11
    W12 --> AUDIT
    W13 --> AUDIT
    W12 -. "tồn dưới ngưỡng" .-> ALERT
    W13 -. "tồn dưới ngưỡng" .-> ALERT
```

Ghi chú đối tượng:

- `InventoryBatch`: lô nhập kho của một sản phẩm.
- `Bottle`: chai/cartridge vật lý có mã duy nhất.
- `RefillSession`: lịch sử một lần tháo/lắp hoặc nạp/thay chai.
- `InventoryAdjustment`: thay đổi tồn thủ công, bắt buộc có lý do.

## 5. Kiosk, order, payment và dispense

```mermaid
flowchart LR
    CUSTOMER["👤 Customer / Kiosk User"]
    PROVIDER["🏦 Payment Provider"]
    SCHEDULER["⏱️ Scheduler"]
    DEVICE["⚙️ Device Gateway<br/>Simulator trước, MQTT sau"]

    subgraph SYSTEM["ScentStation — Customer Transaction"]
        W14(["UC-W14<br/>Xem sản phẩm khả dụng"])
        W15(["UC-W15<br/>Tạo đơn trải nghiệm"])
        W16(["UC-W16<br/>Thanh toán QR và xử lý webhook"])
        W17(["UC-W17<br/>Hủy hoặc hết hạn đơn"])
        W18(["UC-W18<br/>Tạo lệnh và thực hiện lượt xịt"])
        W19(["UC-W19<br/>Theo dõi trạng thái trên kiosk"])
    end

    CUSTOMER --> W14
    CUSTOMER --> W15
    CUSTOMER --> W16
    CUSTOMER --> W17
    CUSTOMER --> W19
    PROVIDER --> W16
    SCHEDULER --> W17
    DEVICE --> W18

    W14 -->|"chọn product/slot"| W15
    W15 -->|"Order: PENDING_PAYMENT"| W16
    W16 -->|"Payment hợp lệ → Order: PAID"| W18
    W16 -. "không thanh toán đúng hạn" .-> W17
    W18 -->|"DISPENSED / FAILED / UNKNOWN"| W19
    W16 -->|"cập nhật payment"| W19
```

Ghi chú đối tượng:

- `Order`: yêu cầu mua một lượt trải nghiệm, giữ snapshot giá và sản phẩm.
- `Payment`: kết quả giao dịch tài chính gắn với order.
- `PaymentEvent`: webhook dùng chống xử lý thông báo trùng.
- `DispenseCommand`: lệnh xịt duy nhất do backend tạo sau payment hợp lệ.
- `DispenseResult`: kết quả cuối do simulator hoặc thiết bị trả về.

## 6. Giao dịch bất thường và hoàn tiền

```mermaid
flowchart LR
    OM["👤 Operations Manager"]
    BA["👤 Brand Administrator<br/>(có quyền refund)"]
    PROVIDER["🏦 Payment Provider"]

    subgraph SYSTEM["ScentStation — Transaction Operations"]
        W20(["UC-W20<br/>Tra cứu và đối soát giao dịch"])
        W21(["UC-W21<br/>Manual review / refund"])
        TIMELINE(["Order → Payment → Command → Result"])
        AUDIT(["Audit Log"])
    end

    OM --> W20
    OM --> W21
    BA --> W20
    BA --> W21
    W20 --> TIMELINE
    W20 -->|"phát hiện sai lệch / UNKNOWN"| W21
    W21 -->|"refund qua adapter"| PROVIDER
    W21 --> AUDIT
```

Quy tắc: `DISPENSE_UNKNOWN` chỉ được review; hệ thống không tự tạo lượt xịt thứ hai.

## 7. Cảnh báo và bảo trì

```mermaid
flowchart LR
    OM["👤 Operations Manager"]
    TECH["👤 Technician"]
    SOURCE["⚙️ Simulator / IoT Device / Backend"]
    SCHEDULER["⏱️ Scheduler"]

    subgraph SYSTEM["ScentStation — Operations & Maintenance"]
        W22(["UC-W22<br/>Tạo, gộp và xử lý cảnh báo"])
        W23(["UC-W23<br/>Tạo và phân công phiếu bảo trì"])
        W24(["UC-W24<br/>Thực hiện checklist, sửa chữa và post-test"])
        NOTIFY(["Gửi thông báo / escalation"])
        MACHINE(["Cập nhật trạng thái Machine"])
    end

    SOURCE --> W22
    OM --> W22
    OM --> W23
    TECH --> W24
    SCHEDULER --> NOTIFY

    W22 -->|"alert critical"| W23
    W22 --> NOTIFY
    W23 -->|"ticket nghiêm trọng"| MACHINE
    W23 -->|"phân công"| W24
    W24 -->|"post-test đạt"| MACHINE
    W24 -. "post-test không đạt" .-> W23
```

## 8. Dashboard, báo cáo và audit

```mermaid
flowchart LR
    PSA["👤 Platform Super Admin"]
    BA["👤 Brand Administrator"]
    OM["👤 Operations Manager"]
    VIEW["👤 Viewer"]

    subgraph SYSTEM["ScentStation — Analytics & Traceability"]
        W25(["UC-W25<br/>Xem dashboard"])
        W26(["UC-W26<br/>Xuất CSV / Excel"])
        W27(["UC-W27<br/>Tra cứu audit log"])
        SCOPE(["Tenant / Location / Machine Scope"])
    end

    PSA --> W25
    PSA --> W26
    PSA --> W27
    BA --> W25
    BA --> W26
    BA --> W27
    OM --> W25
    OM --> W26
    VIEW --> W25
    VIEW --> W26

    W25 -. "lọc quyền" .-> SCOPE
    W26 -. "lọc quyền" .-> SCOPE
    W27 -. "lọc quyền" .-> SCOPE
    W26 -. "ghi hoạt động xuất" .-> W27
```

## 9. Use Case IoT — triển khai sau Web-first

```mermaid
flowchart LR
    PSA["👤 Platform Super Admin"]
    BA["👤 Brand Administrator"]
    DEVICE["📡 IoT Device"]
    GATEWAY["⚙️ MQTT Device Gateway"]

    subgraph SYSTEM["ScentStation — IoT Future Phase"]
        I01(["UC-I01<br/>Đăng ký và xác thực thiết bị"])
        I02(["UC-I02<br/>Nhận heartbeat và telemetry"])
        I03(["UC-I03<br/>Gửi command, nhận ACK và result"])
        I04(["UC-I04<br/>Đồng bộ event sau mất mạng"])
        I05(["UC-I05<br/>Theo dõi firmware/config version"])
        W18(["UC-W18<br/>Nghiệp vụ dispense dùng chung"])
    end

    PSA --> I01
    PSA --> I05
    BA --> I05
    DEVICE --> GATEWAY
    GATEWAY --> I01
    GATEWAY --> I02
    GATEWAY --> I03
    GATEWAY --> I04
    I03 --> W18
```

