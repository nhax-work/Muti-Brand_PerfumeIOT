# ScentStation — Đặc tả yêu cầu

Yêu cầu nghiệp vụ (BR) · Yêu cầu chức năng (FR) · Yêu cầu phi chức năng (NFR)

Phiên bản 2.0 — mô hình cho thuê slot · Nhóm FA26SE114

---

## Tổng quan hệ thống

ScentStation là nền tảng cho phép khách hàng chọn một loại nước hoa trên màn hình kiosk, thanh toán bằng mã QR và nhận đúng một lượt xịt. Mỗi máy chứa nhiều ngăn (slot) được điều khiển độc lập, kết nối với nền tảng quản trị trung tâm để theo dõi giao dịch, lượng nước hoa còn lại, tình trạng thiết bị, hoạt động nạp và bảo trì.

Nền tảng hoạt động theo **mô hình cho thuê slot**: nền tảng sở hữu và vận hành toàn bộ máy, các thương hiệu nước hoa thuê từng slot để trưng bày sản phẩm của mình. Một máy có thể chứa slot của nhiều thương hiệu khác nhau; một thương hiệu có thể thuê nhiều slot trên cùng một máy và trên nhiều máy khác nhau. Dữ liệu kinh doanh được cô lập ở mức slot.

Thương hiệu chỉ quản lý danh mục sản phẩm, giá mỗi lượt xịt trên slot mình thuê, xem báo cáo và gửi yêu cầu bổ sung nước hoa. Toàn bộ nhân sự vận hành, kỹ thuật và kho thuộc về nền tảng.

**Ranh giới hệ thống:** hệ thống bao gồm backend và ứng dụng kiosk. Máy trải nghiệm là thiết bị ngoài, giao tiếp với hệ thống qua MQTT. Cổng thanh toán là hệ thống ngoài.

---

# PHẦN 0 — YÊU CẦU NGHIỆP VỤ (BR)

BR trả lời câu hỏi *tại sao xây dựng hệ thống này*. Mỗi BR mô tả một mục tiêu kinh doanh kèm tiêu chí đo được, độc lập với giải pháp kỹ thuật.

| Mã | Mục tiêu nghiệp vụ | Tiêu chí thành công |
|---|---|---|
| **BR-001** | Cho phép khách tự trải nghiệm nước hoa mà không cần nhân viên hỗ trợ, giúp thương hiệu mở rộng điểm trải nghiệm mà không tăng chi phí nhân sự | 100% lượt trải nghiệm hoàn tất không cần người can thiệp |
| **BR-002** | Bảo đảm mỗi giao dịch đã thanh toán nhận đúng một lượt xịt, để khách tin tưởng và thương hiệu không thất thoát | 0 trường hợp xịt trùng; ≤1% giao dịch chưa xác định kết quả, và 100% số đó được xử lý trong 24 giờ |
| **BR-003** | Cho phép nhiều thương hiệu cùng khai thác một máy vật lý với dữ liệu kinh doanh được cô lập ở mức slot, để nền tảng tối đa hóa tỷ lệ lấp đầy máy | Thương hiệu chỉ truy cập được dữ liệu của slot mình đang hoặc đã từng thuê; 0 trường hợp rò rỉ dữ liệu chéo trong kiểm thử |
| **BR-004** | Giảm chi phí vận hành bằng cách nền tảng quản lý tập trung toàn bộ máy, địa điểm và nhân sự vận hành, giúp thương hiệu tham gia mà không cần bộ máy vận hành riêng | Thương hiệu không cần bất kỳ nhân sự kỹ thuật nào để duy trì hoạt động slot của mình |
| **BR-005** | Kiểm soát lượng nước hoa trong máy để tránh thất thoát và tránh tình trạng slot hết hàng khi khách đến | Sai lệch giữa tồn ước tính và số đo thực ≤10%; tỷ lệ thời gian slot hết hàng ≤2% |
| **BR-006** | Rút ngắn thời gian máy ngừng hoạt động thông qua phát hiện sự cố sớm và quy trình bảo trì có theo dõi | Thời gian từ khi phát sinh cảnh báo nghiêm trọng đến khi tiếp nhận ≤4 giờ; uptime ≥95% |
| **BR-007** | Cung cấp cho thương hiệu dữ liệu về mức độ quan tâm của khách với từng dòng nước hoa theo địa điểm và thời gian, phục vụ quyết định marketing và phân phối | Brand Admin xuất được báo cáo xếp hạng sản phẩm theo slot, máy, địa điểm và khoảng thời gian |
| **BR-008** | Bảo đảm mọi khiếu nại của khách và tranh chấp với thương hiệu đều truy vết được đến từng giao dịch và từng lệnh xịt | 100% đơn hàng truy được chuỗi đơn → thanh toán → lệnh xịt → kết quả thiết bị |
| **BR-009** | Tạo doanh thu cho nền tảng qua mô hình cho thuê slot theo kỳ, kết hợp phí cố định và tỷ lệ ăn chia doanh thu, với cơ chế đối soát và quyết toán theo từng hợp đồng slot | Mỗi kỳ sinh được bảng quyết toán theo từng thương hiệu, tách rõ phí thuê và phần ăn chia |
| **BR-010** | Bảo đảm an toàn cho người dùng và tài sản khi máy vận hành không có người giám sát | Máy không xịt trong mọi điều kiện không an toàn đã định nghĩa; 0 sự cố an toàn trong giai đoạn pilot |
| **BR-011** | Hạ rào cản tham gia cho thương hiệu bằng cách cho phép thuê từ một slot đơn lẻ, để thương hiệu thử nghiệm địa điểm mới với chi phí và rủi ro thấp | Một thương hiệu có thể bắt đầu kinh doanh với đúng một slot trên một máy |
| **BR-012** | Bảo đảm thương hiệu chia sẻ chung một máy hoàn toàn không biết đến sự tồn tại, danh tính hay số liệu kinh doanh của nhau | Không có màn hình, báo cáo hay chỉ số nào trong hệ thống cho phép thương hiệu xác định thương hiệu khác đang thuê slot trên cùng máy, hoặc suy ra doanh thu và lượt bán của họ |
| **BR-013** | Bảo đảm nền tảng thu hồi được giá trị của hàng tồn khi thương hiệu ngừng hợp tác, thông qua cơ chế ân hạn có tính phí và thanh lý hàng tồn | 100% hàng tồn tại slot hết hạn được xử lý theo quy trình ân hạn hoặc thanh lý, không có hàng tồn ở trạng thái không xác định chủ sở hữu |

**Giới hạn của BR-012 cần nêu trong báo cáo:** BR-012 chỉ kiểm soát được trong phạm vi hệ thống. Bất kỳ ai cũng có thể đến trước máy và nhìn thấy sản phẩm của các thương hiệu khác trên màn hình kiosk, vì đó là thông tin công khai với khách hàng. Đây là giới hạn cố hữu của mô hình chia sẻ thiết bị vật lý, không phải khiếm khuyết thiết kế.

---

## Quyết định nghiệp vụ nền tảng

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | Ai cung cấp chai nước hoa vật lý | Thương hiệu gửi chai cho nền tảng. Nền tảng nhập kho, Inventory Staff lắp vào slot |
| 2 | Thương hiệu có biết ai chia sẻ cùng máy | Không. Hệ thống không tiết lộ danh tính, sản phẩm hay sự tồn tại của thương hiệu khác |
| 3 | Xử lý hàng tồn khi hết hạn thuê | Ân hạn có tính phí, sau đó thanh lý về nền tảng nếu không gia hạn |
| 4 | Giới hạn giá | Không. Thương hiệu tự do đặt giá lượt xịt |
| 5 | Mô hình doanh thu nền tảng | Phí thuê slot cố định theo kỳ, cộng tỷ lệ ăn chia doanh thu, cấu hình theo từng hợp đồng |
| 6 | Đơn vị hợp đồng | Một hợp đồng cho một slot. Thương hiệu thuê 3 slot có 3 hợp đồng độc lập |

### Quy trình hết hạn hợp đồng và thanh lý

| Mốc | Diễn biến |
|---|---|
| T−7 ngày | Hệ thống thông báo cho Brand Admin, kèm lời mời gia hạn |
| T−3 ngày | Hệ thống thông báo lần hai |
| T (ngày hết hạn) | Hợp đồng chuyển sang thời gian ân hạn; Platform Super Admin ấn định độ dài |
| Trong ân hạn | Slot vẫn bán bình thường, doanh thu vẫn thuộc thương hiệu. Nền tảng tính phí lưu kho = tỷ lệ phần trăm × giá chai × số chai còn tồn |
| Gia hạn thành công | Tạo hợp đồng mới nối tiếp; phí ân hạn quyết toán cùng kỳ |
| Hết ân hạn, không gia hạn | Toàn bộ hàng tồn chuyển sang sở hữu nền tảng, đánh dấu là hàng thanh lý |
| Sau thanh lý | Slot tiếp tục bán; toàn bộ doanh thu thuộc nền tảng |

**Hệ quả kiến trúc:** hệ thống quản lý hai luồng doanh thu tách biệt. Mỗi đơn hàng ghi rõ doanh thu thuộc thương hiệu hay nền tảng tại thời điểm phát sinh.

---

## Quy ước mã và ưu tiên

**Mã FR:** `FR-<MODULE>-<số>` · **Mã NFR:** `NFR-<LOẠI>-<số>`

| Ưu tiên | Ý nghĩa |
|---|---|
| **M** | Must — thuộc phạm vi MVP, bắt buộc hiện thực trong 13 tuần |
| **S** | Should — hiện thực nếu còn thời gian sau tuần 9 |
| **W** | Won't — có trong phân tích, không hiện thực, ghi vào chương Future Work |

Mỗi FR viết ở dạng "Hệ thống phải…", nguyên tử (một câu một yêu cầu), và kiểm chứng được.

Các FR trong nhóm DSP và IOT có chủ ngữ "Thiết bị phải…" là **ràng buộc giao diện** đối với thiết bị ngoài, không phải yêu cầu nội tại của hệ thống.

| Mã | Module | Mã | Module |
|---|---|---|---|
| AUTH | Xác thực và phân quyền | RFQ | Yêu cầu bổ sung nước hoa |
| BND | Thương hiệu và cô lập dữ liệu | ORD | Đơn hàng và thanh toán |
| USR | Người dùng và vai trò | DSP | Điều khiển lượt xịt |
| PRD | Danh mục sản phẩm | IOT | Giao tiếp thiết bị |
| MCH | Máy và slot | ALR | Cảnh báo |
| SLT | Hợp đồng thuê slot | MNT | Bảo trì |
| EXP | Ân hạn và thanh lý | RPT | Dashboard và báo cáo |
| REV | Phân tách doanh thu | AUD | Nhật ký kiểm toán |
| INV | Tồn kho và nạp nước hoa | | |

---

# PHẦN A — YÊU CẦU CHỨC NĂNG

## A1. FR-AUTH — Xác thực và phân quyền

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-AUTH-01 | Hệ thống phải cho phép người dùng đăng nhập bằng email và mật khẩu | BR-003 | M |
| FR-AUTH-02 | Hệ thống phải cấp access token có thời hạn tối đa 60 phút và refresh token có thời hạn tối đa 7 ngày sau khi đăng nhập thành công | BR-003 | M |
| FR-AUTH-03 | Hệ thống phải khóa tài khoản trong 15 phút sau 5 lần đăng nhập sai liên tiếp | BR-003 | M |
| FR-AUTH-04 | Hệ thống phải cho phép người dùng đăng xuất và vô hiệu hóa refresh token của phiên đó | BR-003 | M |
| FR-AUTH-05 | Hệ thống phải liên kết tài khoản Brand Admin và Report Viewer với đúng một thương hiệu; tài khoản Platform Super Admin, Operations Manager, Technician và Inventory Staff không liên kết với thương hiệu nào | BR-003, BR-004 | M |
| FR-AUTH-06 | Hệ thống phải gán cho mỗi tài khoản một hoặc nhiều vai trò trong tập: Platform Super Admin, Operations Manager, Technician, Inventory Staff, Brand Admin, Report Viewer | BR-003 | M |
| FR-AUTH-07 | Hệ thống phải giới hạn phạm vi dữ liệu của người dùng thuộc thương hiệu theo tập slot mà thương hiệu đó đang hoặc đã từng có hợp đồng thuê | BR-003, BR-012 | M |
| FR-AUTH-08 | Hệ thống phải từ chối mọi yêu cầu truy cập tài nguyên ngoài phạm vi cho phép và trả về mã lỗi 403 | BR-003 | M |
| FR-AUTH-09 | Hệ thống phải yêu cầu xác thực lại mật khẩu trước khi thực hiện hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý hàng tồn hoặc thay đổi cấu hình máy | BR-002, BR-005, BR-013 | M |
| FR-AUTH-10 | Hệ thống phải thu hồi toàn bộ phiên đăng nhập đang hoạt động trong vòng 60 giây khi tài khoản bị vô hiệu hóa | BR-003 | M |
| FR-AUTH-11 | Hệ thống phải cho phép Platform Super Admin thu hồi quyền truy cập của bất kỳ người dùng hoặc thiết bị nào | BR-003 | M |
| FR-AUTH-12 | Hệ thống phải cho phép giới hạn phạm vi của Operations Manager và Technician theo danh sách địa điểm hoặc máy của nền tảng được phân công | BR-004 | S |

## A2. FR-BND — Thương hiệu và cô lập dữ liệu

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-BND-01 | Hệ thống phải cho phép Platform Super Admin tạo thương hiệu mới với tên, mã định danh, thông tin liên hệ và trạng thái | BR-003 | M |
| FR-BND-02 | Hệ thống phải cho phép Platform Super Admin cập nhật thông tin thương hiệu | BR-003 | M |
| FR-BND-03 | Hệ thống phải cho phép Platform Super Admin chuyển thương hiệu sang trạng thái ACTIVE hoặc SUSPENDED | BR-003 | M |
| FR-BND-04 | Hệ thống phải từ chối tạo đơn hàng mới trên slot thuộc thương hiệu đang ở trạng thái SUSPENDED | BR-003 | M |
| FR-BND-05 | Hệ thống phải tự động lọc mọi truy vấn dữ liệu của người dùng thuộc thương hiệu theo tập hợp đồng thuê slot của thương hiệu đó | BR-003, BR-012 | M |
| FR-BND-06 | Hệ thống phải cho phép Brand Admin quản lý tên hiển thị, logo, mô tả và thông tin liên hệ của thương hiệu mình | BR-003 | M |
| FR-BND-07 | Hệ thống phải cho phép Platform Super Admin xem dữ liệu tổng hợp của tất cả thương hiệu | BR-003, BR-009 | M |
| FR-BND-08 | Hệ thống phải không tiết lộ cho người dùng thuộc một thương hiệu bất kỳ thông tin nào về thương hiệu khác, bao gồm tên, sản phẩm và sự tồn tại của hợp đồng thuê trên cùng máy | BR-012 | M |

## A3. FR-USR — Người dùng và vai trò

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-USR-01 | Hệ thống phải cho phép Platform Super Admin tạo tài khoản Brand Admin và gán cho một thương hiệu | BR-003 | M |
| FR-USR-02 | Hệ thống phải cho phép Platform Super Admin tạo và quản lý tài khoản Operations Manager, Technician và Inventory Staff của nền tảng | BR-004 | M |
| FR-USR-03 | Hệ thống phải cho phép Brand Admin tạo tài khoản Report Viewer trong phạm vi thương hiệu mình | BR-003 | M |
| FR-USR-04 | Hệ thống phải ngăn Brand Admin tạo hoặc sửa tài khoản có vai trò vận hành của nền tảng | BR-004 | M |
| FR-USR-05 | Hệ thống phải cho phép quản trị viên có thẩm quyền vô hiệu hóa tài khoản trong phạm vi quản lý của mình | BR-003 | M |
| FR-USR-06 | Hệ thống phải cho phép quản trị viên có thẩm quyền đặt lại mật khẩu cho tài khoản trong phạm vi quản lý của mình | BR-003 | M |
| FR-USR-07 | Hệ thống phải ngăn Brand Admin tạo hoặc sửa tài khoản thuộc thương hiệu khác | BR-003, BR-012 | M |

## A4. FR-PRD — Danh mục sản phẩm

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-PRD-01 | Hệ thống phải cho phép Brand Admin tạo sản phẩm nước hoa với tên, mô tả, hình ảnh, tầng hương và trạng thái kinh doanh | BR-007, BR-011 | M |
| FR-PRD-02 | Hệ thống phải cho phép Brand Admin cập nhật và ngừng kinh doanh sản phẩm của thương hiệu mình | BR-011 | M |
| FR-PRD-03 | Hệ thống phải liên kết mỗi sản phẩm với đúng một thương hiệu sở hữu | BR-003 | M |
| FR-PRD-04 | Hệ thống phải cho phép Brand Admin cấu hình giá tham chiếu mặc định cho sản phẩm, dùng làm gợi ý khi đặt giá slot | BR-009 | S |
| FR-PRD-05 | Hệ thống phải cho phép Brand Admin ghi nhận giá bán lẻ và dung tích của chai đầy đủ, phục vụ tính phí lưu kho khi ân hạn | BR-013 | M |
| FR-PRD-06 | Hệ thống phải cho phép Brand Admin tạo chiến dịch khuyến mãi hoặc giá tạm thời theo khoảng thời gian | BR-007 | W |

## A5. FR-MCH — Máy và slot

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-MCH-01 | Hệ thống phải cho phép Platform Super Admin đăng ký máy mới với số sê-ri và định danh thiết bị duy nhất | BR-004 | M |
| FR-MCH-02 | Hệ thống phải cấp cho mỗi máy một bộ thông tin xác thực riêng để kết nối MQTT | BR-004, BR-010 | M |
| FR-MCH-03 | Hệ thống phải cho phép Platform Super Admin tạo và quản lý địa điểm với tên và địa chỉ | BR-004 | M |
| FR-MCH-04 | Hệ thống phải cho phép Platform Super Admin gán mỗi máy cho một địa điểm | BR-004 | M |
| FR-MCH-05 | Hệ thống phải cho phép Platform Super Admin cấu hình số lượng slot và mã slot cho từng máy | BR-004 | M |
| FR-MCH-06 | Hệ thống phải cho phép cấu hình liều lượng xịt và ngưỡng cảnh báo sắp hết cho từng slot | BR-005 | M |
| FR-MCH-07 | Hệ thống phải ngăn việc gán nhiều hơn một chai đang hoạt động vào cùng một slot | BR-005 | M |
| FR-MCH-08 | Hệ thống phải hiển thị trạng thái kết nối của máy ở một trong ba giá trị: ONLINE, UNSTABLE, OFFLINE | BR-004, BR-006 | M |
| FR-MCH-09 | Hệ thống phải hiển thị chế độ hoạt động của máy ở một trong ba giá trị: NORMAL, MAINTENANCE, DISABLED | BR-004, BR-006 | M |
| FR-MCH-10 | Hệ thống phải hiển thị phiên bản firmware, phiên bản cấu hình và thời điểm liên lạc gần nhất của mỗi máy | BR-004 | M |
| FR-MCH-11 | Hệ thống phải cho phép Operations Manager bật hoặc tắt toàn bộ máy từ xa | BR-004 | M |
| FR-MCH-12 | Hệ thống phải cho phép Operations Manager bật hoặc tắt từng slot riêng lẻ từ xa | BR-004 | M |
| FR-MCH-13 | Hệ thống phải lưu lịch sử thay đổi cấu hình máy và slot | BR-008 | M |
| FR-MCH-14 | Hệ thống phải lưu lịch sử di chuyển máy giữa các địa điểm | BR-004 | S |

## A6. FR-SLT — Hợp đồng thuê slot

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-SLT-01 | Hệ thống phải cho phép Platform Super Admin tạo hợp đồng thuê slot gồm slot, thương hiệu, ngày bắt đầu, ngày kết thúc, phí cố định theo kỳ và tỷ lệ ăn chia doanh thu | BR-009, BR-011 | M |
| FR-SLT-02 | Hệ thống phải bảo đảm mỗi slot chỉ có tối đa một hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED tại một thời điểm | BR-009 | M |
| FR-SLT-03 | Hệ thống phải cho phép một thương hiệu thuê đồng thời nhiều slot trên cùng một máy | BR-011 | M |
| FR-SLT-04 | Hệ thống phải cho phép mỗi slot của cùng một thương hiệu trên cùng một máy có sản phẩm, giá và kỳ hạn riêng biệt | BR-009, BR-011 | M |
| FR-SLT-05 | Hệ thống phải từ chối tạo hợp đồng có kỳ hạn chồng lấn với hợp đồng đang tồn tại trên cùng slot | BR-009 | M |
| FR-SLT-06 | Hệ thống phải quản lý trạng thái hợp đồng theo tập: DRAFT, ACTIVE, EXPIRING, GRACE, RENEWED, LIQUIDATED, CLOSED, TERMINATED | BR-009, BR-013 | M |
| FR-SLT-07 | Hệ thống phải chỉ cho phép gán vào slot sản phẩm thuộc thương hiệu đang có hợp đồng thuê slot đó | BR-003, BR-012 | M |
| FR-SLT-08 | Hệ thống phải cho phép Brand Admin tự do đặt giá mỗi lượt xịt cho slot mình thuê, không bị giới hạn bởi giá sàn hay giá trần | BR-009, BR-011 | M |
| FR-SLT-09 | Hệ thống phải áp dụng giá mới cho các đơn hàng tạo sau thời điểm thay đổi, không ảnh hưởng đơn hàng đang chờ thanh toán | BR-002, BR-009 | M |
| FR-SLT-10 | Hệ thống phải từ chối tạo đơn hàng mới trên slot không có hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED | BR-002, BR-009 | M |
| FR-SLT-11 | Hệ thống phải chuyển slot sang trạng thái UNAVAILABLE khi hợp đồng chuyển sang TERMINATED hoặc CLOSED | BR-009 | M |
| FR-SLT-12 | Hệ thống phải cho phép Platform Super Admin gia hạn hợp đồng bằng cách tạo hợp đồng kế tiếp và liên kết với hợp đồng cũ | BR-009 | M |
| FR-SLT-13 | Hệ thống phải cho phép Platform Super Admin chấm dứt hợp đồng trước hạn kèm lý do bắt buộc | BR-009 | S |
| FR-SLT-14 | Hệ thống phải cho phép Platform Super Admin đóng hợp đồng ở trạng thái LIQUIDATED sau khi hàng thanh lý đã bán hết hoặc được tháo khỏi slot, để giải phóng slot cho hợp đồng mới | BR-009, BR-013 | M |
| FR-SLT-15 | Hệ thống phải lưu lịch sử toàn bộ hợp đồng đã từng tồn tại trên mỗi slot | BR-008, BR-009 | M |
| FR-SLT-16 | Hệ thống phải hiển thị cho Platform Super Admin tỷ lệ lấp đầy slot theo máy và theo địa điểm | BR-009 | S |
| FR-SLT-17 | Hệ thống phải tạo bảng quyết toán theo kỳ cho mỗi thương hiệu, gộp toàn bộ hợp đồng của thương hiệu trong kỳ, có dòng chi tiết theo từng slot | BR-009 | M |
| FR-SLT-18 | Hệ thống phải tính trong bảng quyết toán: doanh thu lượt xịt thuộc thương hiệu, phí thuê cố định, phần ăn chia doanh thu, phí ân hạn và số tiền phải thanh toán | BR-009, BR-013 | M |

## A7. FR-EXP — Ân hạn, gia hạn và thanh lý hàng tồn

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-EXP-01 | Hệ thống phải thông báo cho Brand Admin khi hợp đồng còn 7 ngày là hết hạn, kèm lời mời gia hạn | BR-009, BR-013 | M |
| FR-EXP-02 | Hệ thống phải thông báo lần hai cho Brand Admin khi hợp đồng còn 3 ngày là hết hạn | BR-009, BR-013 | M |
| FR-EXP-03 | Hệ thống phải gộp các hợp đồng của cùng một thương hiệu hết hạn trong cùng ngày thành một thông báo duy nhất liệt kê đầy đủ các slot | BR-013 | M |
| FR-EXP-04 | Hệ thống phải ghi nhật ký kiểm toán cho mỗi lần gửi thông báo hết hạn, kèm thời điểm và người nhận | BR-008, BR-013 | M |
| FR-EXP-05 | Hệ thống phải chuyển hợp đồng sang trạng thái EXPIRING khi còn 7 ngày là hết hạn | BR-009 | M |
| FR-EXP-06 | Hệ thống phải chuyển hợp đồng sang trạng thái GRACE khi đến ngày hết hạn mà chưa có hợp đồng gia hạn | BR-013 | M |
| FR-EXP-07 | Hệ thống phải cho phép Platform Super Admin ấn định ngày kết thúc thời gian ân hạn cho từng hợp đồng | BR-013 | M |
| FR-EXP-08 | Hệ thống phải cho phép slot tiếp tục tiếp nhận đơn hàng trong thời gian ân hạn | BR-013 | M |
| FR-EXP-09 | Hệ thống phải ghi nhận doanh thu phát sinh trong thời gian ân hạn thuộc về thương hiệu | BR-013 | M |
| FR-EXP-10 | Hệ thống phải tính phí lưu kho trong thời gian ân hạn bằng tỷ lệ phần trăm cấu hình được nhân với giá chai và số chai còn tồn của thương hiệu tại slot đó | BR-013 | S |
| FR-EXP-11 | Hệ thống phải hiển thị cho Brand Admin số tiền phí ân hạn đang phát sinh và ngày kết thúc ân hạn | BR-013 | S |
| FR-EXP-12 | Hệ thống phải đưa phí ân hạn đã phát sinh vào bảng quyết toán của kỳ tương ứng | BR-009, BR-013 | S |
| FR-EXP-13 | Hệ thống phải chuyển hợp đồng sang trạng thái RENEWED và dừng tính phí ân hạn khi thương hiệu gia hạn thành công | BR-013 | M |
| FR-EXP-14 | Hệ thống phải chuyển hợp đồng sang trạng thái LIQUIDATED khi hết thời gian ân hạn mà chưa gia hạn | BR-013 | M |
| FR-EXP-15 | Hệ thống phải chuyển quyền sở hữu toàn bộ chai còn tồn của thương hiệu tại slot đó sang nền tảng khi hợp đồng chuyển sang LIQUIDATED | BR-013 | M |
| FR-EXP-16 | Hệ thống phải ghi nhận thời điểm thanh lý và hợp đồng nguồn cho mỗi chai bị thanh lý | BR-008, BR-013 | M |
| FR-EXP-17 | Hệ thống phải cho phép slot tiếp tục tiếp nhận đơn hàng sau khi thanh lý, bán hàng tồn thuộc sở hữu nền tảng | BR-013 | M |
| FR-EXP-18 | Hệ thống phải cho phép Platform Super Admin đặt giá lượt xịt cho slot đang bán hàng thanh lý | BR-013 | M |
| FR-EXP-19 | Hệ thống phải thông báo cho Brand Admin khi hàng tồn của họ bị thanh lý, kèm danh sách chai và khối lượng còn lại | BR-013 | M |
| FR-EXP-20 | Hệ thống phải chấm dứt quyền truy cập của thương hiệu tới dữ liệu giao dịch phát sinh sau thời điểm thanh lý trên slot đó | BR-012, BR-013 | M |
| FR-EXP-21 | Hệ thống phải ghi nhật ký kiểm toán cho mọi sự kiện chuyển sang ân hạn, gia hạn, thanh lý và đóng hợp đồng | BR-008 | M |
| FR-EXP-22 | Hệ thống phải áp dụng quy trình ân hạn và thanh lý độc lập cho từng hợp đồng, kể cả khi cùng thương hiệu có nhiều slot trên cùng máy | BR-013 | M |

## A8. FR-REV — Phân tách doanh thu

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-REV-01 | Hệ thống phải gán cho mỗi đơn hàng một giá trị chủ sở hữu doanh thu là BRAND hoặc PLATFORM tại thời điểm tạo đơn | BR-009, BR-013 | M |
| FR-REV-02 | Hệ thống phải xác định chủ sở hữu doanh thu là PLATFORM khi slot đang bán hàng đã thanh lý, và là BRAND trong các trường hợp còn lại | BR-013 | M |
| FR-REV-03 | Hệ thống phải giữ nguyên chủ sở hữu doanh thu của đơn hàng đã tạo, kể cả khi quyền sở hữu hàng tồn thay đổi sau đó | BR-008, BR-013 | M |
| FR-REV-04 | Hệ thống phải cho phép Platform Super Admin xem doanh thu tách theo hai nguồn: doanh thu thuộc thương hiệu và doanh thu thuộc nền tảng | BR-009, BR-013 | M |
| FR-REV-05 | Hệ thống phải chỉ tính vào bảng quyết toán của thương hiệu các đơn hàng có chủ sở hữu doanh thu là BRAND | BR-009 | M |
| FR-REV-06 | Hệ thống phải không hiển thị cho Brand Admin các đơn hàng có chủ sở hữu doanh thu là PLATFORM | BR-012, BR-013 | M |
| FR-REV-07 | Hệ thống phải cho phép Platform Super Admin xem báo cáo doanh thu hàng thanh lý theo slot, máy và khoảng thời gian | BR-013 | S |

## A9. FR-INV — Tồn kho và nạp nước hoa

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-INV-01 | Hệ thống phải cho phép Inventory Staff tạo lô nước hoa với thương hiệu sở hữu, sản phẩm, số lô, số lượng, ngày nhập và hạn sử dụng | BR-005 | M |
| FR-INV-02 | Hệ thống phải cho phép đăng ký từng chai nước hoa với một mã định danh duy nhất | BR-005 | M |
| FR-INV-03 | Hệ thống phải ghi nhận cho mỗi chai chủ sở hữu là một thương hiệu cụ thể hoặc là nền tảng | BR-005, BR-013 | M |
| FR-INV-04 | Hệ thống phải quản lý trạng thái chai theo tập: IN_STOCK, INSTALLED, LOW, EMPTY, DAMAGED, EXPIRED, LIQUIDATED | BR-005, BR-013 | M |
| FR-INV-05 | Hệ thống phải ghi nhận khối lượng ban đầu của chai tại thời điểm lắp vào slot | BR-005 | M |
| FR-INV-06 | Hệ thống phải từ chối gán vào slot chai thuộc thương hiệu không có hợp đồng thuê slot đó | BR-003, BR-012 | M |
| FR-INV-07 | Hệ thống phải cảnh báo khi Inventory Staff gán chai có sản phẩm không khớp với sản phẩm cấu hình cho slot | BR-005 | M |
| FR-INV-08 | Hệ thống phải từ chối gán chai đã quá hạn sử dụng vào slot | BR-005 | M |
| FR-INV-09 | Hệ thống phải ước tính lượng còn lại của mỗi slot dựa trên số lượt xịt thành công và lượng tiêu thụ trung bình đã hiệu chuẩn | BR-005 | M |
| FR-INV-10 | Hệ thống phải cập nhật lượng còn lại sau mỗi lượt xịt khách hàng hoặc lượt xịt chẩn đoán thành công | BR-005 | M |
| FR-INV-11 | Hệ thống phải sinh cảnh báo sắp hết khi lượng còn lại xuống dưới ngưỡng đã cấu hình cho slot | BR-005 | M |
| FR-INV-12 | Hệ thống phải chuyển slot sang trạng thái UNAVAILABLE khi lượng còn lại không đủ cho một lượt xịt | BR-005 | M |
| FR-INV-13 | Hệ thống phải lưu cho mỗi phiên nạp: người thực hiện, thời điểm, máy, slot, chai cũ, chai mới và khối lượng đo được trước và sau | BR-005, BR-008 | M |
| FR-INV-14 | Hệ thống phải cung cấp checklist nạp nước hoa mà Inventory Staff phải hoàn thành trước khi kết thúc phiên nạp | BR-005 | M |
| FR-INV-15 | Hệ thống phải cung cấp quy trình tháo chai khỏi slot và trả về kho, ghi nhận khối lượng còn lại | BR-005, BR-013 | M |
| FR-INV-16 | Hệ thống phải cho phép ghi nhận điều chỉnh tồn kho kèm lý do bắt buộc | BR-005 | M |
| FR-INV-17 | Hệ thống phải lưu lịch sử lắp, nạp, tháo, điều chỉnh, thanh lý và hủy bỏ của từng chai | BR-005, BR-008 | M |
| FR-INV-18 | Hệ thống phải so sánh lượng tiêu thụ tính theo số lượt xịt với số đo từ load cell của cùng slot | BR-005 | S |
| FR-INV-19 | Hệ thống phải sinh cảnh báo nghi ngờ rò rỉ khi khối lượng đo được giảm quá 20% so với lượng tiêu thụ tính theo số lượt xịt trong cùng khoảng thời gian | BR-005 | S |
| FR-INV-20 | Hệ thống phải sinh cảnh báo khi lô nước hoa còn dưới 30 ngày là hết hạn | BR-005 | S |
| FR-INV-21 | Hệ thống phải cho phép tạo báo cáo tồn kho theo thương hiệu, sản phẩm, lô, máy, slot và khoảng thời gian | BR-005, BR-007 | M |

## A10. FR-RFQ — Yêu cầu bổ sung nước hoa

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-RFQ-01 | Hệ thống phải cho phép Brand Admin tạo yêu cầu bổ sung nước hoa cho slot mình đang thuê | BR-005 | M |
| FR-RFQ-02 | Hệ thống phải yêu cầu chọn lý do khi tạo yêu cầu, trong tập: LOW_STOCK, EXPIRING, PRODUCT_CHANGE | BR-005 | M |
| FR-RFQ-03 | Hệ thống phải gợi ý tạo yêu cầu bổ sung cho Brand Admin khi slot của họ đạt ngưỡng sắp hết | BR-005 | M |
| FR-RFQ-04 | Hệ thống phải quản lý trạng thái yêu cầu theo tập: SUBMITTED, ACCEPTED, REJECTED, SCHEDULED, COMPLETED, CANCELLED | BR-005 | M |
| FR-RFQ-05 | Hệ thống phải thông báo yêu cầu mới cho Platform Super Admin và Inventory Staff | BR-005 | M |
| FR-RFQ-06 | Hệ thống phải cho phép Platform Super Admin chấp nhận hoặc từ chối yêu cầu, kèm lý do bắt buộc khi từ chối | BR-005 | M |
| FR-RFQ-07 | Hệ thống phải cho phép Inventory Staff lên lịch xử lý yêu cầu đã được chấp nhận | BR-005 | S |
| FR-RFQ-08 | Hệ thống phải liên kết yêu cầu với phiên nạp thực tế khi Inventory Staff hoàn tất việc nạp | BR-005, BR-008 | M |
| FR-RFQ-09 | Hệ thống phải chuyển yêu cầu sang COMPLETED khi phiên nạp liên kết kết thúc thành công | BR-005 | M |
| FR-RFQ-10 | Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các yêu cầu của thương hiệu mình | BR-005 | M |
| FR-RFQ-11 | Hệ thống phải không cho phép Brand Admin trực tiếp thực hiện hoặc chỉnh sửa phiên nạp | BR-005 | M |
| FR-RFQ-12 | Hệ thống phải ngăn tạo yêu cầu mới trên cùng slot khi đã tồn tại yêu cầu chưa hoàn tất | BR-005 | M |

## A11. FR-ORD — Đơn hàng và thanh toán

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-ORD-01 | Hệ thống phải hiển thị trên kiosk sản phẩm của tất cả slot đang khả dụng trên máy, kèm tên thương hiệu tương ứng | BR-001, BR-011 | M |
| FR-ORD-02 | Hệ thống phải hiển thị tên, mô tả, hình ảnh, tầng hương và giá của sản phẩm khi khách chọn một slot | BR-001 | M |
| FR-ORD-03 | Hệ thống phải cho phép khách lọc danh mục trên kiosk theo thương hiệu | BR-001 | S |
| FR-ORD-04 | Hệ thống phải chỉ cho phép tạo đơn khi máy ở trạng thái ONLINE và slot được chọn ở trạng thái AVAILABLE | BR-001, BR-002 | M |
| FR-ORD-05 | Hệ thống phải lưu định danh máy, slot, hợp đồng thuê, thương hiệu, sản phẩm, giá, loại tiền và chủ sở hữu doanh thu vào đơn hàng tại thời điểm tạo đơn | BR-002, BR-008, BR-013 | M |
| FR-ORD-06 | Hệ thống phải giữ nguyên giá đã lưu trong đơn hàng kể cả khi giá slot thay đổi sau đó | BR-002 | M |
| FR-ORD-07 | Hệ thống phải sinh cho mỗi đơn hàng một mã tham chiếu duy nhất trên toàn hệ thống | BR-002, BR-008 | M |
| FR-ORD-08 | Hệ thống phải sinh mã QR thanh toán tương ứng với mã tham chiếu của đơn hàng | BR-001 | M |
| FR-ORD-09 | Hệ thống phải gán cho mỗi đơn hàng một thời hạn thanh toán mặc định 5 phút, có thể cấu hình | BR-002 | M |
| FR-ORD-10 | Hệ thống phải quản lý trạng thái đơn hàng theo tập: CREATED, PENDING_PAYMENT, PAID, DISPENSE_REQUESTED, DISPENSED, FAILED, EXPIRED, REFUND_PENDING, REFUNDED | BR-002, BR-008 | M |
| FR-ORD-11 | Hệ thống phải hiển thị trạng thái thanh toán trên kiosk và cập nhật trong vòng 3 giây kể từ khi trạng thái thay đổi | BR-001 | M |
| FR-ORD-12 | Hệ thống phải tiếp nhận thông báo kết quả thanh toán từ nhà cung cấp qua webhook | BR-002 | M |
| FR-ORD-13 | Hệ thống phải xác minh chữ ký của mỗi webhook trước khi xử lý và từ chối webhook có chữ ký không hợp lệ | BR-002 | M |
| FR-ORD-14 | Hệ thống phải xác minh mã tham chiếu, số tiền và loại tiền trong webhook khớp với đơn hàng tương ứng | BR-002 | M |
| FR-ORD-15 | Hệ thống phải bảo đảm mỗi webhook chỉ được xử lý đúng một lần, kể cả khi nhà cung cấp gửi lại nhiều lần | BR-002 | M |
| FR-ORD-16 | Hệ thống phải chuyển đơn hàng sang trạng thái EXPIRED khi quá thời hạn thanh toán mà chưa nhận được xác nhận | BR-002 | M |
| FR-ORD-17 | Hệ thống phải từ chối tạo lệnh xịt từ đơn hàng ở trạng thái FAILED, EXPIRED hoặc REFUNDED | BR-002 | M |
| FR-ORD-18 | Hệ thống phải lưu toàn bộ lịch sử chuyển trạng thái của đơn hàng kèm thời điểm và nguyên nhân | BR-008 | M |
| FR-ORD-19 | Hệ thống phải đánh dấu đơn hàng cần kiểm tra thủ công khi thanh toán thành công nhưng lượt xịt thất bại hoặc không xác định | BR-002, BR-006 | M |
| FR-ORD-20 | Hệ thống phải cho phép Operations Manager khởi tạo quy trình hoàn tiền cho đơn hàng cần kiểm tra thủ công | BR-002 | S |
| FR-ORD-21 | Hệ thống phải hiển thị hướng dẫn xử lý cho khách trên kiosk khi đã thanh toán nhưng lượt xịt thất bại, kèm mã tham chiếu sự cố | BR-002 | M |
| FR-ORD-22 | Hệ thống phải cho phép tìm kiếm giao dịch theo khoảng thời gian, máy, slot, địa điểm, sản phẩm, mã tham chiếu và trạng thái | BR-008 | M |
| FR-ORD-23 | Hệ thống phải cho phép đối soát giao dịch nội bộ với dữ liệu từ nhà cung cấp thanh toán và liệt kê các mục lệch | BR-008, BR-009 | S |

## A12. FR-DSP — Điều khiển lượt xịt an toàn

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-DSP-01 | Hệ thống phải chỉ tạo lệnh xịt sau khi đơn hàng đã chuyển sang trạng thái PAID | BR-002 | M |
| FR-DSP-02 | Hệ thống phải gán cho mỗi lệnh xịt một mã lệnh duy nhất trên toàn hệ thống | BR-002 | M |
| FR-DSP-03 | Hệ thống phải gán cho mỗi lệnh xịt định danh máy đích, định danh slot đích, thời điểm tạo và thời hạn hiệu lực | BR-002 | M |
| FR-DSP-04 | Hệ thống phải ký số mỗi lệnh xịt trước khi gửi tới thiết bị | BR-002 | M |
| FR-DSP-05 | Hệ thống phải bảo đảm mỗi đơn hàng không có quá một lệnh xịt ở trạng thái đang hiệu lực tại bất kỳ thời điểm nào | BR-002 | M |
| FR-DSP-06 | Hệ thống phải đặt thời hạn hiệu lực của lệnh xịt tối đa 60 giây kể từ thời điểm tạo | BR-002 | M |
| FR-DSP-07 | Thiết bị phải xác minh chữ ký của lệnh xịt và từ chối lệnh có chữ ký không hợp lệ | BR-002, BR-010 | M |
| FR-DSP-08 | Thiết bị phải từ chối lệnh xịt đã quá thời hạn hiệu lực | BR-002, BR-010 | M |
| FR-DSP-09 | Thiết bị phải từ chối lệnh xịt có định danh máy đích không khớp với định danh của chính nó | BR-002, BR-010 | M |
| FR-DSP-10 | Thiết bị phải lưu danh sách mã lệnh đã thực hiện và từ chối lệnh có mã trùng | BR-002, BR-010 | M |
| FR-DSP-11 | Thiết bị phải gửi xác nhận đã tiếp nhận lệnh về hệ thống trước khi bắt đầu thực hiện | BR-002 | M |
| FR-DSP-12 | Thiết bị phải từ chối thực hiện lệnh xịt khi cảm biến báo cửa đang mở | BR-010 | M |
| FR-DSP-13 | Thiết bị phải từ chối thực hiện lệnh xịt khi máy đang ở chế độ MAINTENANCE | BR-010 | M |
| FR-DSP-14 | Thiết bị phải từ chối thực hiện lệnh xịt khi slot đích được đánh dấu là rỗng | BR-005, BR-010 | M |
| FR-DSP-15 | Thiết bị phải chỉ kích hoạt cơ cấu của đúng slot đích trong một chu kỳ xịt đã hiệu chuẩn | BR-002, BR-010 | M |
| FR-DSP-16 | Thiết bị phải gửi về hệ thống kết quả thực hiện gồm mã lệnh, trạng thái thành công hoặc thất bại, thời điểm thực hiện và mã lỗi nếu có | BR-002, BR-008 | M |
| FR-DSP-17 | Hệ thống phải chỉ chuyển đơn hàng sang trạng thái DISPENSED sau khi nhận được kết quả thành công từ thiết bị | BR-002 | M |
| FR-DSP-18 | Hệ thống phải chuyển lệnh xịt sang trạng thái UNKNOWN khi không nhận được kết quả trong vòng 60 giây | BR-002 | M |
| FR-DSP-19 | Hệ thống phải không tự động tạo lệnh xịt mới cho đơn hàng có lệnh ở trạng thái UNKNOWN | BR-002 | M |
| FR-DSP-20 | Hệ thống phải ghi nhận riêng các lượt xịt chẩn đoán, không tính vào doanh thu và không tính vào thống kê lượt xịt khách hàng | BR-005, BR-008 | M |

## A13. FR-IOT — Giao tiếp và giám sát thiết bị

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-IOT-01 | Thiết bị phải gửi bản tin heartbeat tới hệ thống theo chu kỳ 30 giây | BR-004, BR-006 | M |
| FR-IOT-02 | Hệ thống phải đánh dấu máy là UNSTABLE khi thiếu từ 2 đến 3 bản tin heartbeat liên tiếp | BR-006 | M |
| FR-IOT-03 | Hệ thống phải đánh dấu máy là OFFLINE khi không nhận được heartbeat trong 90 giây | BR-006 | M |
| FR-IOT-04 | Thiết bị phải gửi dữ liệu telemetry gồm khối lượng từng slot, trạng thái cửa, trạng thái cơ cấu xịt và trạng thái nguồn điện | BR-005, BR-006 | M |
| FR-IOT-05 | Thiết bị phải gửi sự kiện khởi động, tắt máy, kết nối lại, chuyển chế độ bảo trì, lỗi cảm biến và lỗi xịt | BR-006 | M |
| FR-IOT-06 | Hệ thống phải gửi lệnh xịt, lệnh chẩn đoán, yêu cầu báo cáo trạng thái và cập nhật cấu hình tới thiết bị qua MQTT | BR-004 | M |
| FR-IOT-07 | Hệ thống phải liên kết mỗi lệnh gửi đi với xác nhận tiếp nhận và kết quả thực hiện tương ứng | BR-002, BR-008 | M |
| FR-IOT-08 | Hệ thống phải từ chối kết nối MQTT từ thiết bị chưa đăng ký hoặc có thông tin xác thực không hợp lệ | BR-010 | M |
| FR-IOT-09 | Hệ thống phải giới hạn mỗi thiết bị chỉ được publish và subscribe trên các topic thuộc định danh máy của chính nó | BR-003, BR-010 | M |
| FR-IOT-10 | Thiết bị phải lưu tạm các sự kiện chưa gửi được vào bộ nhớ cục bộ khi mất kết nối | BR-006, BR-008 | M |
| FR-IOT-11 | Thiết bị phải gửi lại các sự kiện đã lưu tạm sau khi kết nối lại, kèm mã sự kiện để hệ thống loại bỏ bản trùng | BR-008 | M |
| FR-IOT-12 | Hệ thống phải từ chối tạo đơn hàng mới trên máy đang ở trạng thái OFFLINE | BR-002 | M |
| FR-IOT-13 | Thiết bị phải hiển thị trạng thái tạm ngưng trên kiosk khi không liên lạc được với hệ thống | BR-001, BR-010 | M |
| FR-IOT-14 | Hệ thống phải lưu lịch sử dữ liệu telemetry để phục vụ báo cáo và phân tích | BR-007 | S |
| FR-IOT-15 | Hệ thống phải hỗ trợ cập nhật firmware từ xa có xác minh chữ ký | BR-004 | W |

## A14. FR-ALR — Cảnh báo

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-ALR-01 | Hệ thống phải sinh cảnh báo khi máy chuyển sang trạng thái OFFLINE | BR-006 | M |
| FR-ALR-02 | Hệ thống phải sinh cảnh báo khi slot đạt ngưỡng sắp hết hoặc chuyển sang rỗng | BR-005, BR-006 | M |
| FR-ALR-03 | Hệ thống phải sinh cảnh báo khi thiết bị báo cửa mở quá 5 phút ngoài phiên bảo trì | BR-006, BR-010 | M |
| FR-ALR-04 | Hệ thống phải sinh cảnh báo khi có 3 lượt xịt thất bại liên tiếp trên cùng một slot | BR-006 | M |
| FR-ALR-05 | Hệ thống phải sinh cảnh báo khi thiết bị báo lỗi cảm biến hoặc lỗi cơ cấu | BR-006 | M |
| FR-ALR-06 | Hệ thống phải phân loại mỗi cảnh báo theo loại, mức độ nghiêm trọng, máy, slot, địa điểm và thời điểm phát sinh | BR-006 | M |
| FR-ALR-07 | Hệ thống phải không sinh cảnh báo mới cùng loại trên cùng đối tượng khi đã tồn tại một cảnh báo chưa xử lý | BR-006 | M |
| FR-ALR-08 | Hệ thống phải quản lý trạng thái cảnh báo theo tập: OPEN, ACKNOWLEDGED, RESOLVED, CLOSED | BR-006 | M |
| FR-ALR-09 | Hệ thống phải xác định danh sách thương hiệu bị ảnh hưởng bởi mỗi cảnh báo mức máy, dựa trên các slot đang có hợp đồng hiệu lực | BR-006, BR-012 | M |
| FR-ALR-10 | Hệ thống phải thông báo cho Brand Admin các cảnh báo ảnh hưởng đến slot của thương hiệu mình, không tiết lộ thông tin slot của thương hiệu khác | BR-006, BR-012 | M |
| FR-ALR-11 | Hệ thống phải cho phép Operations Manager tiếp nhận, phân công và đóng cảnh báo | BR-006 | M |
| FR-ALR-12 | Hệ thống phải lưu người xử lý, thời điểm tiếp nhận, nội dung xử lý và thời điểm hoàn thành của mỗi cảnh báo | BR-006, BR-008 | M |
| FR-ALR-13 | Hệ thống phải tự động tạo phiếu bảo trì cho các loại cảnh báo được cấu hình là nghiêm trọng | BR-006 | S |
| FR-ALR-14 | Hệ thống phải nâng mức cảnh báo khi quá thời hạn xử lý quy định | BR-006 | S |
| FR-ALR-15 | Hệ thống phải gửi thông báo qua kênh ngoài như email hoặc Zalo cho người chịu trách nhiệm | BR-006 | W |

## A15. FR-MNT — Bảo trì

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-MNT-01 | Hệ thống phải cho phép Operations Manager tạo phiếu bảo trì thủ công cho một máy | BR-006 | M |
| FR-MNT-02 | Hệ thống phải cho phép phân công phiếu bảo trì cho một Technician của nền tảng | BR-004, BR-006 | M |
| FR-MNT-03 | Hệ thống phải phân loại phiếu bảo trì theo nhóm sự cố, mức độ nghiêm trọng, độ ưu tiên và hạn xử lý | BR-006 | M |
| FR-MNT-04 | Hệ thống phải quản lý trạng thái phiếu theo tập: OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED | BR-006 | M |
| FR-MNT-05 | Hệ thống phải cho phép Technician chuyển máy sang chế độ MAINTENANCE | BR-006 | M |
| FR-MNT-06 | Hệ thống phải từ chối tạo đơn hàng mới trên máy đang ở chế độ MAINTENANCE | BR-002, BR-010 | M |
| FR-MNT-07 | Hệ thống phải thông báo cho tất cả Brand Admin có slot trên máy khi máy chuyển sang chế độ MAINTENANCE | BR-006, BR-012 | M |
| FR-MNT-08 | Hệ thống phải cho phép Technician xem dữ liệu cảm biến, mã lỗi và sự kiện thiết bị gần đây của máy được phân công | BR-006 | M |
| FR-MNT-09 | Hệ thống phải cho phép Technician thực hiện lượt xịt chẩn đoán trên slot được chọn sau khi xác thực lại | BR-006 | M |
| FR-MNT-10 | Hệ thống phải cho phép Technician ghi kết quả chẩn đoán, nguyên nhân, biện pháp xử lý và linh kiện đã thay | BR-006, BR-008 | M |
| FR-MNT-11 | Hệ thống phải cung cấp checklist kiểm tra sau bảo trì mà Technician phải hoàn thành | BR-006, BR-010 | M |
| FR-MNT-12 | Hệ thống phải từ chối đưa máy trở lại chế độ NORMAL khi checklist kiểm tra sau bảo trì chưa hoàn thành | BR-006, BR-010 | M |
| FR-MNT-13 | Hệ thống phải từ chối đóng phiếu bảo trì khi chưa ghi nhận kết quả xử lý | BR-006 | M |
| FR-MNT-14 | Hệ thống phải lưu lịch sử bảo trì của từng máy | BR-006, BR-008 | M |
| FR-MNT-15 | Hệ thống phải cho phép đính kèm ghi chú và hình ảnh vào phiếu bảo trì | BR-006 | S |
| FR-MNT-16 | Hệ thống phải tính thời gian từ khi phát sinh sự cố đến khi tiếp nhận và đến khi xử lý xong | BR-006 | S |

## A16. FR-RPT — Dashboard và báo cáo

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-RPT-01 | Hệ thống phải hiển thị cho Platform Super Admin số lượng máy theo từng trạng thái kết nối và chế độ hoạt động | BR-006 | M |
| FR-RPT-02 | Hệ thống phải hiển thị số giao dịch và doanh thu theo ngày, tuần, tháng và khoảng thời gian tùy chọn | BR-007, BR-009 | M |
| FR-RPT-03 | Hệ thống phải hiển thị số giao dịch theo từng trạng thái đơn hàng | BR-007 | M |
| FR-RPT-04 | Hệ thống phải hiển thị tỷ lệ lượt xịt thành công và thất bại | BR-002, BR-007 | M |
| FR-RPT-05 | Hệ thống phải liệt kê các đơn hàng đã thanh toán nhưng chưa xác nhận được lượt xịt | BR-002, BR-006 | M |
| FR-RPT-06 | Hệ thống phải hiển thị xếp hạng sản phẩm theo số lượt được chọn, lọc theo slot, máy, địa điểm và khoảng thời gian | BR-007 | M |
| FR-RPT-07 | Hệ thống phải hiển thị tồn kho ước tính và danh sách slot sắp hết | BR-005 | M |
| FR-RPT-08 | Hệ thống phải cho phép Brand Admin xem báo cáo doanh thu và lượt xịt theo từng slot mình thuê | BR-007, BR-009 | M |
| FR-RPT-09 | Hệ thống phải cho phép Platform Super Admin xem báo cáo doanh thu theo máy, địa điểm, slot và thương hiệu | BR-009 | M |
| FR-RPT-10 | Hệ thống phải giới hạn phạm vi dữ liệu trong mọi báo cáo của người dùng thuộc thương hiệu theo tập hợp đồng thuê slot của thương hiệu đó | BR-003, BR-012 | M |
| FR-RPT-11 | Hệ thống phải không hiển thị cho Brand Admin bất kỳ chỉ số tổng hợp mức máy nào cho phép suy ra số liệu của thương hiệu khác | BR-012 | M |
| FR-RPT-12 | Hệ thống phải chỉ hiển thị cho Brand Admin các slot thuộc hợp đồng của thương hiệu mình khi xem sơ đồ máy; các slot còn lại hiển thị là không khả dụng mà không kèm thông tin | BR-012 | M |
| FR-RPT-13 | Hệ thống phải báo cáo thời gian hoạt động, thời gian ngừng và tần suất cảnh báo theo máy | BR-006 | S |
| FR-RPT-14 | Hệ thống phải cho phép người có quyền xuất báo cáo ở định dạng CSV | BR-007 | S |
| FR-RPT-15 | Hệ thống phải chỉ cho phép Platform Super Admin xem báo cáo tổng hợp toàn nền tảng | BR-003, BR-012 | M |

## A17. FR-AUD — Nhật ký kiểm toán

| Mã | Yêu cầu | BR | Ưu tiên |
|---|---|---|---|
| FR-AUD-01 | Hệ thống phải ghi nhật ký cho mọi sự kiện đăng nhập, đăng xuất và đăng nhập thất bại | BR-008 | M |
| FR-AUD-02 | Hệ thống phải ghi nhật ký cho mọi thay đổi tài khoản, vai trò và quyền hạn | BR-008 | M |
| FR-AUD-03 | Hệ thống phải ghi nhật ký cho mọi thao tác tạo, gia hạn, chấm dứt, thanh lý và đóng hợp đồng thuê slot | BR-008, BR-009, BR-013 | M |
| FR-AUD-04 | Hệ thống phải ghi nhật ký cho mọi thay đổi giá lượt xịt và gán sản phẩm vào slot | BR-008 | M |
| FR-AUD-05 | Hệ thống phải ghi nhật ký cho mọi lệnh gửi tới thiết bị và kết quả tương ứng | BR-002, BR-008 | M |
| FR-AUD-06 | Hệ thống phải ghi nhật ký cho mọi sự kiện thanh toán và hoàn tiền | BR-008 | M |
| FR-AUD-07 | Hệ thống phải ghi nhật ký cho mọi thao tác nạp nước hoa, tháo chai, điều chỉnh tồn kho, chuyển quyền sở hữu chai và xịt chẩn đoán | BR-005, BR-008, BR-013 | M |
| FR-AUD-08 | Hệ thống phải lưu cho mỗi bản ghi nhật ký: chủ thể thực hiện, thương hiệu liên quan, hành động, đối tượng tác động, thời điểm, nguồn và dữ liệu trước và sau khi thay đổi | BR-008 | M |
| FR-AUD-09 | Hệ thống phải không cung cấp bất kỳ chức năng nào cho phép sửa hoặc xóa bản ghi nhật ký kiểm toán | BR-008 | M |
| FR-AUD-10 | Hệ thống phải cho phép Platform Super Admin tìm kiếm nhật ký theo thời gian, người dùng, máy, slot, hành động và đối tượng | BR-008 | M |
| FR-AUD-11 | Hệ thống phải cho phép truy vết từ một đơn hàng đến thanh toán, lệnh xịt, kết quả thiết bị, thay đổi tồn kho, hợp đồng thuê và hoàn tiền liên quan | BR-008 | M |

---

# PHẦN B — YÊU CẦU PHI CHỨC NĂNG

## B1. NFR-PER — Hiệu năng

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-PER-01 | Kiosk phải phản hồi thao tác chọn sản phẩm trong tối đa 500ms ở điều kiện mạng bình thường | Đo trên thiết bị thật, 50 lần lặp |
| NFR-PER-02 | Hệ thống phải hiển thị mã QR thanh toán trong tối đa 3 giây kể từ khi khách xác nhận đơn | Đo trên thiết bị thật |
| NFR-PER-03 | Thời gian từ khi hệ thống nhận webhook đến khi thiết bị bắt đầu kích hoạt cơ cấu xịt tối đa 5 giây | Đo bằng log có dấu thời gian hai đầu |
| NFR-PER-04 | API trả kết quả trong tối đa 300ms ở phân vị 95 với 100 yêu cầu đồng thời | Kiểm thử tải |
| NFR-PER-05 | Báo cáo trên khoảng thời gian 30 ngày phải trả kết quả trong tối đa 3 giây | Đo với dữ liệu mô phỏng 30 ngày |
| NFR-PER-06 | Bảng quyết toán kỳ cho một thương hiệu có 20 hợp đồng slot phải sinh trong tối đa 10 giây | Đo với dữ liệu mô phỏng |

## B2. NFR-REL — Độ tin cậy và khả dụng

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-REL-01 | Hệ thống phải đạt tỷ lệ khả dụng tối thiểu 95% trong giai đoạn chạy thử thực tế | Nhật ký giám sát trong 7 ngày pilot |
| NFR-REL-02 | Tỷ lệ giao dịch đã thanh toán nhưng không xác định được kết quả xịt không vượt quá 1% | Thống kê pilot |
| NFR-REL-03 | Hệ thống không được mất dữ liệu giao dịch khi backend khởi động lại giữa lúc xử lý đơn hàng | Kiểm thử chủ động ngắt dịch vụ |
| NFR-REL-04 | Thiết bị phải tự kết nối lại MQTT trong tối đa 60 giây sau khi mạng phục hồi | Kiểm thử ngắt mạng |
| NFR-REL-05 | Thiết bị phải lưu tạm tối thiểu 500 sự kiện khi mất kết nối | Kiểm thử ngắt mạng kéo dài |
| NFR-REL-06 | Cơ cấu xịt của mỗi slot phải hoạt động ổn định qua tối thiểu 1.000 chu kỳ với sai số khối lượng dưới 15% | Kiểm thử độ bền, cân điện tử 0,01g |
| NFR-REL-07 | Việc chuyển trạng thái hợp đồng theo lịch phải thực hiện đúng ngày kể cả khi hệ thống có thời gian ngừng, thông qua cơ chế bù khi khởi động lại | Kiểm thử ngắt dịch vụ qua mốc chuyển trạng thái |

## B3. NFR-SEC — Bảo mật

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-SEC-01 | Toàn bộ giao tiếp giữa kiosk, backend và web quản trị phải qua HTTPS/TLS 1.2 trở lên | Kiểm tra cấu hình |
| NFR-SEC-02 | Toàn bộ giao tiếp MQTT giữa thiết bị và broker phải qua TLS | Kiểm tra cấu hình |
| NFR-SEC-03 | Mật khẩu phải được lưu dưới dạng băm với thuật toán bcrypt hoặc argon2 | Kiểm tra cơ sở dữ liệu |
| NFR-SEC-04 | Hệ thống phải vượt qua kiểm thử truy cập chéo thương hiệu ở mức slot trên 100% endpoint có dữ liệu thuộc thương hiệu, bao gồm trường hợp hai thương hiệu cùng một máy | Bộ test tự động |
| NFR-SEC-05 | Khóa bí mật và thông tin xác thực không được lưu trong mã nguồn hoặc kho mã | Rà soát mã nguồn |
| NFR-SEC-06 | Hệ thống phải giới hạn tối đa 10 yêu cầu tạo đơn mỗi phút cho mỗi máy | Kiểm thử tải |
| NFR-SEC-07 | Mỗi thiết bị phải có thông tin xác thực riêng, không dùng chung giữa các máy | Kiểm tra cấu hình broker |
| NFR-SEC-08 | Nhật ký kiểm toán phải chỉ cho phép thêm mới, không cho sửa hoặc xóa ở mức cơ sở dữ liệu | Kiểm tra quyền và trigger |

## B4. NFR-SAF — An toàn thiết bị

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-SAF-01 | Firmware phải giới hạn thời gian kích hoạt cơ cấu xịt ở tối đa 800ms cho mỗi chu kỳ, độc lập với logic nghiệp vụ | Kiểm thử với lệnh sai định dạng |
| NFR-SAF-02 | Máy phải có nút dừng khẩn cấp cắt nguồn cơ cấu chấp hành bằng phần cứng, không qua phần mềm | Kiểm thử với firmware bị treo |
| NFR-SAF-03 | Thiết bị phải đưa toàn bộ cơ cấu về vị trí nghỉ khi khởi động lại | Kiểm thử mất điện giữa chu kỳ |
| NFR-SAF-04 | Khoang chứa mạch điện phải tách biệt với khoang xịt bằng vách ngăn vật lý | Kiểm tra thiết kế cơ khí |
| NFR-SAF-05 | Máy phải có quạt thông gió hoạt động trong và sau mỗi lượt xịt để giảm tích tụ hơi cồn | Kiểm tra vận hành |
| NFR-SAF-06 | Nguồn cấp cho cơ cấu chấp hành phải tách khỏi nguồn cấp cho vi điều khiển | Kiểm tra sơ đồ mạch |

## B5. NFR-SCA — Khả năng mở rộng

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-SCA-01 | Nền tảng phải xử lý được heartbeat và telemetry đồng thời từ tối thiểu 50 máy | Kiểm thử bằng Device Simulator |
| NFR-SCA-02 | Thêm thương hiệu mới chỉ cần thao tác cấu hình, không cần triển khai mã nguồn hay cơ sở dữ liệu riêng | Kiểm thử quy trình |
| NFR-SCA-03 | Kiến trúc phải cho phép thêm nhà cung cấp thanh toán mới bằng cách hiện thực một adapter, không sửa logic đơn hàng | Rà soát thiết kế |
| NFR-SCA-04 | Số slot trên mỗi máy phải cấu hình được, không cố định trong mã nguồn | Kiểm thử cấu hình |
| NFR-SCA-05 | Hệ thống phải hỗ trợ một máy có slot thuộc ít nhất 4 thương hiệu khác nhau cùng lúc | Kiểm thử với dữ liệu mẫu |

## B6. NFR-USA — Khả dụng và trải nghiệm

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-USA-01 | Người dùng lần đầu phải hoàn tất một lượt trải nghiệm mà không cần hướng dẫn từ người khác | Kiểm thử với tối thiểu 10 người ngoài nhóm |
| NFR-USA-02 | Kiosk phải tự quay về màn hình chính sau 60 giây không có thao tác | Kiểm thử thời gian chờ |
| NFR-USA-03 | Mọi thông báo lỗi trên kiosk phải viết bằng ngôn ngữ thông thường, kèm hướng dẫn hành động tiếp theo | Rà soát nội dung |
| NFR-USA-04 | Giao diện kiosk phải đọc được ở khoảng cách 60cm với cỡ chữ tối thiểu 18px | Kiểm tra thiết kế |
| NFR-USA-05 | Kiosk phải hiển thị rõ thương hiệu của mỗi sản phẩm để khách phân biệt được sản phẩm của các thương hiệu khác nhau trên cùng máy | Kiểm thử với người dùng |
| NFR-USA-06 | Web quản trị phải hoạt động đúng trên Chrome, Edge và Firefox phiên bản mới nhất | Kiểm thử tương thích |

## B7. NFR-MTN — Khả năng bảo trì và vận hành

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-MTN-01 | Mã nguồn phải đạt độ phủ kiểm thử tối thiểu 60% cho các module ORD, DSP, INV, SLT và REV | Báo cáo coverage |
| NFR-MTN-02 | Hệ thống phải ghi log có cấu trúc kèm mã tương quan cho mỗi đơn hàng, xuyên suốt từ tạo đơn đến kết quả xịt | Kiểm tra log |
| NFR-MTN-03 | Hệ thống phải triển khai được bằng một lệnh docker compose trên môi trường sạch | Kiểm thử triển khai |
| NFR-MTN-04 | Toàn bộ API phải có tài liệu OpenAPI sinh tự động và luôn đồng bộ với mã nguồn | Kiểm tra tài liệu |
| NFR-MTN-05 | Giao thức MQTT phải được đặc tả bằng văn bản gồm danh sách topic, cấu trúc bản tin và ví dụ | Kiểm tra tài liệu |

## B8. NFR-DAT — Dữ liệu

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-DAT-01 | Hệ thống phải lưu toàn bộ thời điểm ở múi giờ UTC và hiển thị theo múi giờ địa phương | Kiểm tra cơ sở dữ liệu |
| NFR-DAT-02 | Hệ thống phải lưu số tiền dưới dạng số nguyên theo đơn vị nhỏ nhất của loại tiền | Kiểm tra lược đồ |
| NFR-DAT-03 | Hệ thống phải giữ dữ liệu giao dịch, hợp đồng thuê và nhật ký kiểm toán tối thiểu 12 tháng | Kiểm tra chính sách lưu trữ |
| NFR-DAT-04 | Hệ thống phải không lưu bất kỳ thông tin thẻ hoặc tài khoản ngân hàng nào của khách hàng | Rà soát lược đồ dữ liệu |
| NFR-DAT-05 | Hệ thống phải có cơ chế sao lưu cơ sở dữ liệu hằng ngày trong giai đoạn chạy thử | Kiểm tra quy trình |
| NFR-DAT-06 | Trường thương hiệu và chủ sở hữu doanh thu trên đơn hàng phải là NOT NULL và bất biến sau khi tạo | Kiểm tra ràng buộc cơ sở dữ liệu |
| NFR-DAT-07 | Hệ thống phải có chỉ số duy nhất từng phần trên slot, áp dụng cho hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE và LIQUIDATED | Kiểm tra lược đồ |

---

# PHẦN C — MA TRẬN TRUY VẾT BR → FR

| BR | Module FR liên quan |
|---|---|
| BR-001 Tự trải nghiệm không cần nhân viên | ORD, IOT |
| BR-002 Một giao dịch một lượt xịt | ORD, DSP, IOT, AUD |
| BR-003 Cô lập dữ liệu ở mức slot | AUTH, BND, USR, PRD, INV, RPT |
| BR-004 Nền tảng quản lý tập trung | MCH, USR, MNT, IOT |
| BR-005 Kiểm soát tồn kho | INV, RFQ, MCH, ALR, DSP |
| BR-006 Rút ngắn thời gian ngừng hoạt động | ALR, MNT, IOT, RPT |
| BR-007 Dữ liệu marketing cho thương hiệu | RPT, PRD, INV |
| BR-008 Truy vết đầu cuối | AUD, ORD, SLT, EXP, INV, MCH |
| BR-009 Doanh thu từ cho thuê slot | SLT, EXP, REV, RPT, ORD |
| BR-010 An toàn khi vận hành không giám sát | DSP, IOT, MNT, MCH, NFR-SAF |
| BR-011 Hạ rào cản tham gia | SLT, PRD, ORD |
| BR-012 Không lộ thông tin giữa các thương hiệu | BND, AUTH, RPT, ALR, EXP, REV, INV, MNT |
| BR-013 Thu hồi giá trị hàng tồn | EXP, REV, SLT, INV, PRD, AUTH |

Mỗi BR có tối thiểu một FR phục vụ; mỗi FR truy được về tối thiểu một BR. Không có FR mồ côi.

---

# PHẦN D — GHI CHÚ CHO NGƯỜI VIẾT TÀI LIỆU

**Về ngưỡng số.** Mọi con số trong tài liệu (30 giây heartbeat, 90 giây offline, 60 giây hiệu lực lệnh, 800ms kích hoạt, 5 phút thanh toán, 7 và 3 ngày thông báo hết hạn) đều là giá trị mặc định cấu hình được, không phải hằng số cứng. Nêu rõ trong đặc tả để không bị hỏi tại sao chọn con số đó.

**Về chủ ngữ "Thiết bị phải".** Theo ranh giới đã chốt, máy nằm ngoài hệ thống, nên các FR trong nhóm DSP và IOT có chủ ngữ này là ràng buộc giao diện mà thiết bị phải tuân thủ, không phải yêu cầu nội tại. Nêu ở đầu tài liệu để tránh bị hỏi về tính nhất quán.

**Về hợp đồng theo từng slot.** Một hợp đồng ứng với một slot. Thương hiệu thuê 3 slot có 3 hợp đồng độc lập, mỗi hợp đồng có kỳ hạn, sản phẩm và giá riêng, và có thể ở trạng thái khác nhau. Việc gộp nhóm xử lý ở tầng thông báo (FR-EXP-03) và tầng quyết toán (FR-SLT-17).

**Về ma trận truy vết đầy đủ.** Phần C là bảng tổng hợp. Bản nộp cần bảng chi tiết bốn cột BR → FR → Use Case → Test Case, dựng bằng bảng tính sau khi hoàn tất use case specification.

**Về thứ tự cắt khi tiến độ căng.** Cắt theo thứ tự: nhóm W trước, rồi nhóm S trong RPT và MNT, rồi FR-EXP-10 đến FR-EXP-12 (phần tính phí ân hạn), rồi nhóm S trong INV. **Tuyệt đối không cắt bất kỳ FR nào trong nhóm DSP, và không cắt FR-REV-01 đến FR-REV-03** — hai nhóm này là giá trị học thuật của đồ án.

---

# PHẦN E — THỐNG KÊ PHẠM VI

| Ưu tiên | Số FR |
|---|---|
| **M — Must** (phạm vi MVP 13 tuần) | 216 |
| **S — Should** (làm nếu còn thời gian sau tuần 9) | 23 |
| **W — Won't** (chuyển sang Future Work) | 3 |
| **Tổng FR** | **242** |
| **Tổng NFR** | **50** |

**Danh sách W:** FR-PRD-06 chiến dịch khuyến mãi · FR-IOT-15 cập nhật firmware từ xa · FR-ALR-15 thông báo qua kênh ngoài.

**Phân bố FR theo module:**

| Module | Số FR | Module | Số FR |
|---|---|---|---|
| AUTH | 12 | RFQ | 12 |
| BND | 8 | ORD | 23 |
| USR | 7 | DSP | 20 |
| PRD | 6 | IOT | 15 |
| MCH | 14 | ALR | 15 |
| SLT | 18 | MNT | 16 |
| EXP | 22 | RPT | 15 |
| REV | 7 | AUD | 11 |
| INV | 21 | | |
