# ScentStation — Yêu cầu chức năng theo Epic

Tầng trình bày tóm tắt của [FR_NFR_SCENTSTATION.md](FR_NFR_SCENTSTATION.md), dùng cho SRS nộp và trình bày bảo vệ.

---

## Quan hệ với tài liệu chi tiết

Tài liệu này là **tầng 1** trong cấu trúc 2 tầng của đặc tả yêu cầu:

- **Tầng 1 (file này):** FR gộp theo tính năng ("epic"), dùng để trình bày trong SRS và báo cáo — đọc được trong một buổi, vẫn giữ đủ chi tiết nghiệp vụ.
- **Tầng 2 ([FR_NFR_SCENTSTATION.md](FR_NFR_SCENTSTATION.md)):** FR nguyên tử (một câu một yêu cầu), dùng làm backlog kỹ thuật, sinh test case, và dựng ma trận truy vết BR → FR → Use Case → Test Case.

Mỗi epic trong tài liệu này liệt kê đầy đủ mã FR nguyên tử mà nó gộp lại, để tra ngược về tầng 2 khi cần chi tiết triển khai hoặc viết test case. Cột **Chi tiết** tóm tắt hành vi cốt lõi của epic — đủ để hiểu epic làm gì mà không cần mở tài liệu chi tiết, nhưng không thay thế nội dung FR nguyên tử khi viết use case hay test case.

**Quy tắc gộp:**
- Một epic chỉ gộp các FR cùng module, cùng một hành vi/tính năng liền mạch, không gộp xuyên module.
- **Ưu tiên của epic = ưu tiên cao nhất trong các FR thành phần** (M > S > W). Một epic chỉ ở mức S hoặc W nếu *toàn bộ* FR thành phần đều ở mức đó — vì epic đó chỉ có thể được xem là "xong" khi toàn bộ FR M bên trong đã hiện thực.
- Vai trò nhắc trong bảng dưới đã theo tên hợp nhất: **Operations Staff** thay cho Operations Manager/Technician (xem Phần D của tài liệu chi tiết).

**Thống kê:** 264 FR nguyên tử → **78 epic** (tỷ lệ nén ~3,4 lần). 75 epic mức M, 3 epic mức W (không có epic thuần S — mọi FR mức S đều gắn liền với ít nhất một FR M trong cùng epic).

---

## Mục lục theo module

| # | Module | Số epic | # | Module | Số epic |
|---|---|---|---|---|---|
| A1 | FR-AUTH | 5 | A10 | FR-RFQ | 4 |
| A2 | FR-BND | 3 | A11 | FR-ORD | 7 |
| A3 | FR-USR | 1 | A12 | FR-DSP | 5 |
| A4 | FR-PRD | 3 | A13 | FR-IOT | 6 |
| A5 | FR-MCH | 6 | A14 | FR-ALR | 3 |
| A6 | FR-SLT | 7 | A15 | FR-MNT | 4 |
| A7 | FR-EXP | 7 | A16 | FR-RPT | 5 |
| A8 | FR-REV | 2 | A17 | FR-AUD | 3 |
| A9 | FR-INV | 7 | | **Tổng** | **78** |

---

## A1. EPIC-AUTH — Xác thực và phân quyền

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-AUTH-01 | Đăng nhập, đăng xuất và quản lý phiên | Đăng nhập bằng email/mật khẩu, cấp access token 60 phút và refresh token 7 ngày, khóa tài khoản 15 phút sau 5 lần sai, đăng xuất thu hồi refresh token, và thu hồi toàn bộ phiên trong 60 giây khi tài khoản bị vô hiệu hóa. | AUTH-01, 02, 03, 04, 10 | BR-003 | M |
| EPIC-AUTH-02 | Gán vai trò và liên kết tài khoản với thương hiệu | Mỗi tài khoản gán một hoặc nhiều vai trò trong 4 vai trò chuẩn; Brand Admin bắt buộc liên kết đúng một thương hiệu, các vai trò nền tảng không liên kết thương hiệu nào. | AUTH-05, 06 | BR-003, BR-004 | M |
| EPIC-AUTH-03 | Kiểm soát phạm vi truy cập dữ liệu | Người dùng thuộc thương hiệu chỉ truy cập dữ liệu của slot đang/đã từng thuê, mọi truy cập ngoài phạm vi trả về 403; Operations Staff có thể bị giới hạn theo danh sách địa điểm/máy được phân công. | AUTH-07, 08, 12 | BR-003, BR-004, BR-012 | M |
| EPIC-AUTH-04 | Xác thực lại cho thao tác nhạy cảm | Yêu cầu nhập lại mật khẩu trước các thao tác rủi ro cao: hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý hàng tồn, đổi cấu hình máy. | AUTH-09 | BR-002, BR-005, BR-013 | M |
| EPIC-AUTH-05 | Thu hồi quyền truy cập của người dùng/thiết bị | Platform Super Admin có thể thu hồi quyền truy cập của bất kỳ người dùng hoặc thiết bị nào, bất kỳ lúc nào. | AUTH-11 | BR-003 | M |

## A2. EPIC-BND — Thương hiệu và cô lập dữ liệu

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-BND-01 | Quản lý hồ sơ thương hiệu | Platform Super Admin tạo/cập nhật hồ sơ thương hiệu (tên, mã, liên hệ, trạng thái); Brand Admin tự quản lý tên hiển thị, logo, mô tả, liên hệ của thương hiệu mình. | BND-01, 02, 03, 06 | BR-003 | M |
| EPIC-BND-02 | Cô lập dữ liệu và chặn giao dịch giữa các thương hiệu | Mọi truy vấn dữ liệu của người dùng thuộc thương hiệu tự động lọc theo tập slot đang thuê; thương hiệu SUSPENDED bị chặn tạo đơn mới; không thương hiệu nào thấy được tên, sản phẩm hay sự tồn tại của thương hiệu khác. | BND-04, 05, 08 | BR-003, BR-012 | M |
| EPIC-BND-03 | Báo cáo tổng hợp toàn nền tảng cho Super Admin | Platform Super Admin xem được dữ liệu tổng hợp của toàn bộ thương hiệu trên nền tảng. | BND-07 | BR-003, BR-009 | M |

## A3. EPIC-USR — Người dùng và vai trò

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-USR-01 | Quản lý tài khoản nhân sự nền tảng và Brand Admin | Chỉ Platform Super Admin được tạo, sửa, vô hiệu hóa và đặt lại mật khẩu cho mọi tài khoản (Brand Admin, Operations Staff, Inventory Staff); không vai trò nào khác có quyền quản lý tài khoản. | USR-01, 02, 03, 04, 05 | BR-003, BR-004, BR-012 | M |

## A4. EPIC-PRD — Danh mục sản phẩm

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-PRD-01 | Quản lý danh mục sản phẩm của thương hiệu | Brand Admin tạo và cập nhật sản phẩm nước hoa (tên, mô tả, hình ảnh, tầng hương, trạng thái kinh doanh), mỗi sản phẩm thuộc đúng một thương hiệu sở hữu. | PRD-01, 02, 03 | BR-003, BR-007, BR-011 | M |
| EPIC-PRD-02 | Giá tham chiếu và thông tin phục vụ tính phí lưu kho | Brand Admin cấu hình giá tham chiếu gợi ý và ghi nhận giá bán lẻ + dung tích chai đầy đủ; dữ liệu này dùng để tính phí lưu kho khi hợp đồng vào thời gian ân hạn. | PRD-04, 05 | BR-009, BR-013 | M |
| EPIC-PRD-03 | Chiến dịch khuyến mãi theo thời gian *(Future Work)* | Brand Admin tạo chiến dịch khuyến mãi hoặc giá tạm thời theo khoảng thời gian — chưa hiện thực trong MVP. | PRD-06 | BR-007 | W |

## A5. EPIC-MCH — Máy và slot

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-MCH-01 | Đăng ký máy và quản lý địa điểm | Platform Super Admin đăng ký máy mới với số sê-ri/định danh duy nhất, cấp thông tin xác thực MQTT riêng, tạo địa điểm và gán máy vào địa điểm. | MCH-01, 02, 03, 04 | BR-004, BR-010 | M |
| EPIC-MCH-02 | Cấu hình slot | Cấu hình số lượng slot, mã slot, liều lượng xịt và ngưỡng cảnh báo sắp hết cho từng slot; hệ thống không cho phép hai chai đang hoạt động cùng một slot. | MCH-05, 06, 07 | BR-004, BR-005 | M |
| EPIC-MCH-03 | Giám sát trạng thái kết nối và chế độ hoạt động | Hiển thị trạng thái kết nối (ONLINE/UNSTABLE/OFFLINE), chế độ hoạt động (NORMAL/MAINTENANCE/DISABLED), phiên bản firmware/cấu hình và thời điểm liên lạc gần nhất của mỗi máy. | MCH-08, 09, 10 | BR-004, BR-006 | M |
| EPIC-MCH-04 | Điều khiển bật/tắt máy và slot từ xa | Operations Staff bật/tắt toàn bộ máy hoặc từng slot riêng lẻ từ xa. | MCH-11, 12 | BR-004 | M |
| EPIC-MCH-05 | Lịch sử cấu hình và di chuyển máy | Lưu lịch sử mọi thay đổi cấu hình máy/slot và lịch sử di chuyển máy giữa các địa điểm. | MCH-13, 14 | BR-004, BR-008 | M |
| EPIC-MCH-06 | Trạng thái khả dụng (AVAILABLE/UNAVAILABLE) của slot | Slot tự chuyển AVAILABLE khi đồng thời có hợp đồng hiệu lực, đã gán sản phẩm, có chai đủ lượng và không bị tắt thủ công; ngược lại tự chuyển UNAVAILABLE ngay khi một điều kiện không còn thỏa. | MCH-15, 16, 17 | BR-002, BR-005 | M |

## A6. EPIC-SLT — Hợp đồng thuê slot

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-SLT-01 | Tạo hợp đồng và ràng buộc một hợp đồng hiệu lực/slot | Tạo hợp đồng thuê slot (slot, thương hiệu, kỳ hạn, phí cố định, tỷ lệ ăn chia); mỗi slot chỉ có một hợp đồng hiệu lực tại một thời điểm, không cho kỳ hạn chồng lấn, nhưng một thương hiệu có thể thuê nhiều slot trên cùng máy. | SLT-01, 02, 03, 04, 05 | BR-009, BR-011 | M |
| EPIC-SLT-02 | Vòng đời trạng thái hợp đồng và chặn đơn hàng ngoài phạm vi | Quản lý 8 trạng thái vòng đời hợp đồng (DRAFT…TERMINATED); chặn tạo đơn hàng mới và chuyển slot UNAVAILABLE khi hợp đồng không còn hiệu lực. | SLT-06, 10, 11 | BR-002, BR-009, BR-013 | M |
| EPIC-SLT-03 | Gán sản phẩm và định giá cho slot đã thuê | Chỉ sản phẩm thuộc thương hiệu đang thuê mới được gán vào slot; Brand Admin gán/đổi sản phẩm và tự do đặt giá, giá mới chỉ áp dụng cho đơn tạo sau đó; slot chưa gán sản phẩm không nhận đơn hàng. | SLT-07, 08, 09, 27, 28, 29 | BR-002, BR-003, BR-009, BR-011, BR-012 | M |
| EPIC-SLT-04 | Gia hạn, chấm dứt và đóng hợp đồng | Platform Super Admin gia hạn (tạo hợp đồng nối tiếp), chấm dứt trước hạn (kèm lý do), và đóng hợp đồng đã thanh lý xong để giải phóng slot; toàn bộ lịch sử hợp đồng của slot được lưu lại. | SLT-12, 13, 14, 15 | BR-008, BR-009, BR-013 | M |
| EPIC-SLT-05 | Tỷ lệ lấp đầy và bảng quyết toán theo kỳ | Hiển thị tỷ lệ lấp đầy slot theo máy/địa điểm; sinh bảng quyết toán theo kỳ cho từng thương hiệu, tách rõ doanh thu, phí thuê, phần ăn chia và phí ân hạn. | SLT-16, 17, 18 | BR-009, BR-013 | M |
| EPIC-SLT-06 | Brand Admin tự yêu cầu thuê slot trống | Brand Admin xem danh sách slot trống (không lộ thương hiệu từng thuê) và gửi yêu cầu thuê kèm kỳ hạn mong muốn; không được gửi yêu cầu trùng trên cùng slot khi còn yêu cầu chưa xử lý. | SLT-19, 20, 21, 26 | BR-011, BR-012 | M |
| EPIC-SLT-07 | Duyệt yêu cầu và tự kích hoạt hợp đồng | Platform Super Admin duyệt/từ chối yêu cầu thuê; khi duyệt, hệ thống tự tạo hợp đồng DRAFT và tự kích hoạt ACTIVE đúng ngày bắt đầu, có bù trạng thái nếu hệ thống từng ngừng hoạt động qua mốc đó. | SLT-22, 23, 24, 25 | BR-009, BR-011 | M |

## A7. EPIC-EXP — Ân hạn, gia hạn và thanh lý hàng tồn

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-EXP-01 | Thông báo hết hạn hợp đồng | Thông báo Brand Admin ở mốc T-7 và T-3 ngày trước khi hết hạn, gộp thành một thông báo nếu nhiều hợp đồng cùng hết hạn một ngày, và ghi nhật ký kiểm toán cho mỗi lần gửi. | EXP-01, 02, 03, 04 | BR-008, BR-009, BR-013 | M |
| EPIC-EXP-02 | Chuyển trạng thái EXPIRING và GRACE | Hợp đồng tự chuyển EXPIRING ở T-7 ngày, chuyển GRACE đúng ngày hết hạn nếu chưa gia hạn; Platform Super Admin ấn định độ dài thời gian ân hạn cho từng hợp đồng. | EXP-05, 06, 07 | BR-009, BR-013 | M |
| EPIC-EXP-03 | Vận hành và tính phí trong thời gian ân hạn | Trong ân hạn, slot vẫn bán bình thường và doanh thu vẫn thuộc thương hiệu; hệ thống tính phí lưu kho theo tỷ lệ % × giá chai × số tồn, hiển thị cho Brand Admin và đưa vào quyết toán kỳ. | EXP-08, 09, 10, 11, 12 | BR-009, BR-013 | M |
| EPIC-EXP-04 | Gia hạn thành công | Gia hạn thành công chuyển hợp đồng sang RENEWED và dừng tính phí ân hạn. | EXP-13 | BR-013 | M |
| EPIC-EXP-05 | Thanh lý hàng tồn và chuyển quyền sở hữu | Hết ân hạn không gia hạn: hợp đồng chuyển LIQUIDATED, toàn bộ chai còn tồn của thương hiệu chuyển quyền sở hữu sang nền tảng, ghi nhận thời điểm và hợp đồng nguồn cho mỗi chai. | EXP-14, 15, 16 | BR-008, BR-013 | M |
| EPIC-EXP-06 | Bán hàng thanh lý và cắt quyền truy cập của thương hiệu | Sau thanh lý, slot tiếp tục bán hàng thuộc sở hữu nền tảng với giá do Platform Super Admin đặt; Brand Admin được thông báo danh sách chai bị thanh lý và mất quyền truy cập dữ liệu giao dịch phát sinh sau đó. | EXP-17, 18, 19, 20 | BR-012, BR-013 | M |
| EPIC-EXP-07 | Kiểm toán và tính độc lập giữa các hợp đồng | Mọi sự kiện chuyển ân hạn/gia hạn/thanh lý/đóng hợp đồng được ghi nhật ký kiểm toán; vòng đời ân hạn-thanh lý áp dụng độc lập cho từng hợp đồng, kể cả khi cùng thương hiệu có nhiều slot trên một máy. | EXP-21, 22 | BR-008, BR-013 | M |

## A8. EPIC-REV — Phân tách doanh thu

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-REV-01 | Gán và giữ bất biến chủ sở hữu doanh thu trên đơn hàng | Mỗi đơn hàng gắn chủ sở hữu doanh thu BRAND hoặc PLATFORM ngay khi tạo (PLATFORM nếu slot đang bán hàng thanh lý, còn lại là BRAND) và giữ nguyên vĩnh viễn, không đổi theo biến động quyền sở hữu tồn kho sau đó. | REV-01, 02, 03 | BR-008, BR-009, BR-013 | M |
| EPIC-REV-02 | Báo cáo doanh thu tách theo nguồn BRAND/PLATFORM | Platform Super Admin xem doanh thu tách theo hai nguồn và báo cáo doanh thu hàng thanh lý; bảng quyết toán thương hiệu chỉ tính đơn có chủ sở hữu BRAND, Brand Admin không thấy đơn có chủ sở hữu PLATFORM. | REV-04, 05, 06, 07 | BR-009, BR-012, BR-013 | M |

## A9. EPIC-INV — Tồn kho và nạp nước hoa

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-INV-01 | Quản lý chai và lô nước hoa | Inventory Staff tạo lô nước hoa và đăng ký từng chai với mã định danh duy nhất, chủ sở hữu (thương hiệu hoặc nền tảng), trạng thái theo 7 giá trị (IN_STOCK…LIQUIDATED), và khối lượng ban đầu khi lắp. | INV-01, 02, 03, 04, 05 | BR-005, BR-013 | M |
| EPIC-INV-02 | Brand Admin gửi hàng, Inventory Staff đối soát khi nhận | Brand Admin khai báo lô hàng gửi đến kho; Inventory Staff đối soát số lượng thực nhận, đánh dấu DISCREPANCY nếu lệch, hệ thống tự tạo lô nước hoa liên kết khi xác nhận nhận hàng. | INV-22, 23, 24, 25, 26, 27, 28 | BR-005, BR-008 | M |
| EPIC-INV-03 | Lắp chai vào slot (kiểm tra hợp đồng, sản phẩm, hạn dùng) | Từ chối lắp nếu thương hiệu không có hợp đồng thuê slot đó, cảnh báo nếu sản phẩm không khớp cấu hình slot, từ chối nếu chai đã quá hạn sử dụng. | INV-06, 07, 08 | BR-003, BR-005, BR-012 | M |
| EPIC-INV-04 | Theo dõi tồn kho theo thời gian thực | Ước tính lượng còn lại theo số lượt xịt và mức tiêu thụ đã hiệu chuẩn, cập nhật sau mỗi lượt xịt, sinh cảnh báo sắp hết và chuyển slot UNAVAILABLE khi không đủ cho một lượt xịt. | INV-09, 10, 11, 12 | BR-005 | M |
| EPIC-INV-05 | Phiên nạp và phiếu nạp (kèm chống báo động giả cửa mở) | Inventory Staff mở phiếu nạp trước khi thao tác (tạm ngưng cảnh báo cửa mở trong lúc mở phiếu), hoàn thành checklist, và đóng phiếu để khôi phục giám sát; hệ thống lưu đầy đủ chi tiết phiên nạp. | INV-13, 14, 29, 30, 31 | BR-005, BR-006, BR-008 | M |
| EPIC-INV-06 | Tháo chai và điều chỉnh tồn kho | Quy trình tháo chai trả về kho (ghi nhận khối lượng còn lại) và ghi nhận điều chỉnh tồn kho thủ công kèm lý do bắt buộc. | INV-15, 16 | BR-005, BR-013 | M |
| EPIC-INV-07 | Lịch sử, đối chiếu rò rỉ và báo cáo tồn kho | Lưu lịch sử toàn bộ vòng đời từng chai; so sánh tiêu thụ tính toán với số đo load cell để cảnh báo nghi rò rỉ (lệch >20%); cảnh báo lô sắp hết hạn; xuất báo cáo tồn kho đa chiều. | INV-17, 18, 19, 20, 21 | BR-005, BR-007, BR-008 | M |

## A10. EPIC-RFQ — Yêu cầu bổ sung nước hoa

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-RFQ-01 | Tạo và quản lý vòng đời yêu cầu bổ sung | Brand Admin tạo yêu cầu bổ sung nước hoa cho slot mình thuê kèm lý do bắt buộc (LOW_STOCK/EXPIRING/PRODUCT_CHANGE), quản lý theo 6 trạng thái, không cho tạo yêu cầu trùng khi slot còn yêu cầu chưa hoàn tất. | RFQ-01, 02, 03, 04, 12 | BR-005 | M |
| EPIC-RFQ-02 | Thông báo và duyệt yêu cầu | Yêu cầu mới thông báo cho Platform Super Admin và Inventory Staff; Platform Super Admin chấp nhận hoặc từ chối kèm lý do bắt buộc khi từ chối. | RFQ-05, 06 | BR-005 | M |
| EPIC-RFQ-03 | Thực hiện và đóng yêu cầu qua phiên nạp | Inventory Staff lên lịch và thực hiện yêu cầu đã duyệt qua một phiên nạp thực tế; yêu cầu tự chuyển COMPLETED khi phiên nạp liên kết hoàn tất; Brand Admin không được tự thực hiện hay sửa phiên nạp. | RFQ-07, 08, 09, 11 | BR-005, BR-008 | M |
| EPIC-RFQ-04 | Brand Admin theo dõi trạng thái yêu cầu | Brand Admin xem trạng thái và lịch sử toàn bộ yêu cầu bổ sung của thương hiệu mình. | RFQ-10 | BR-005 | M |

## A11. EPIC-ORD — Đơn hàng và thanh toán

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-ORD-01 | Duyệt danh mục và chọn slot trên kiosk | Kiosk hiển thị sản phẩm của mọi slot khả dụng trên máy kèm tên thương hiệu, chi tiết sản phẩm khi chọn slot, và cho phép lọc theo thương hiệu. | ORD-01, 02, 03 | BR-001, BR-011 | M |
| EPIC-ORD-02 | Tạo đơn hàng và chốt dữ liệu tại thời điểm tạo | Chỉ tạo đơn khi máy ONLINE và slot AVAILABLE; đơn hàng chốt lại máy, slot, hợp đồng, thương hiệu, sản phẩm, giá, loại tiền và chủ sở hữu doanh thu tại thời điểm tạo, kèm mã tham chiếu duy nhất. | ORD-04, 05, 06, 07 | BR-001, BR-002, BR-008, BR-013 | M |
| EPIC-ORD-03 | Thanh toán QR và vòng đời trạng thái đơn hàng | Sinh mã QR thanh toán, gán thời hạn thanh toán 5 phút, quản lý 9 trạng thái vòng đời đơn hàng, hiển thị trạng thái trên kiosk cập nhật trong 3 giây, tự chuyển EXPIRED nếu quá hạn. | ORD-08, 09, 10, 11, 16 | BR-001, BR-002, BR-008 | M |
| EPIC-ORD-04 | Xử lý webhook thanh toán an toàn và idempotent | Nhận webhook kết quả thanh toán, xác minh chữ ký, khớp mã tham chiếu/số tiền/loại tiền với đơn hàng, và đảm bảo mỗi webhook chỉ xử lý đúng một lần dù gửi lại nhiều lần. | ORD-12, 13, 14, 15 | BR-002 | M |
| EPIC-ORD-05 | Liên kết đơn hàng với lệnh xịt | Chỉ tạo lệnh xịt từ đơn PAID (không từ FAILED/EXPIRED/REFUNDED); lưu toàn bộ lịch sử chuyển trạng thái đơn hàng kèm thời điểm và nguyên nhân. | ORD-17, 18 | BR-002, BR-008 | M |
| EPIC-ORD-06 | Xử lý sự cố thanh toán/xịt và hoàn tiền | Đơn thanh toán thành công nhưng xịt thất bại/không rõ kết quả được đánh dấu cần kiểm tra thủ công, Operations Staff khởi tạo hoàn tiền, kiosk hiển thị hướng dẫn kèm mã sự cố cho khách. | ORD-19, 20, 21 | BR-002, BR-006 | M |
| EPIC-ORD-07 | Tìm kiếm và đối soát giao dịch | Tìm kiếm giao dịch đa tiêu chí (thời gian, máy, slot, địa điểm, sản phẩm, mã, trạng thái) và đối soát nội bộ với dữ liệu từ nhà cung cấp thanh toán. | ORD-22, 23 | BR-008, BR-009 | M |

## A12. EPIC-DSP — Điều khiển lượt xịt an toàn

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-DSP-01 | Tạo và ký số lệnh xịt | Chỉ tạo lệnh xịt sau khi đơn PAID; mỗi lệnh có mã duy nhất, định danh máy/slot đích, thời điểm tạo, thời hạn hiệu lực tối đa 60 giây, được ký số trước khi gửi, và mỗi đơn không quá một lệnh hiệu lực cùng lúc. | DSP-01, 02, 03, 04, 05, 06 | BR-002 | M |
| EPIC-DSP-02 | Thiết bị xác minh lệnh trước khi thực hiện | Thiết bị xác minh chữ ký lệnh, từ chối lệnh quá hạn, lệnh sai định danh máy đích, và lệnh có mã trùng đã thực hiện trước đó. | DSP-07, 08, 09, 10 | BR-002, BR-010 | M |
| EPIC-DSP-03 | Điều kiện an toàn bắt buộc trước khi xịt | Thiết bị gửi xác nhận tiếp nhận trước khi thực hiện; từ chối thực hiện khi cửa đang mở, máy đang MAINTENANCE, hoặc slot đích được đánh dấu rỗng. | DSP-11, 12, 13, 14 | BR-002, BR-005, BR-010 | M |
| EPIC-DSP-04 | Thực hiện xịt và xác nhận kết quả hai chiều | Thiết bị chỉ kích hoạt đúng slot đích theo chu kỳ đã hiệu chuẩn, gửi kết quả về hệ thống; hệ thống chỉ chuyển đơn DISPENSED khi nhận kết quả thành công, chuyển lệnh UNKNOWN nếu không có phản hồi trong 60 giây và không tự tạo lệnh mới cho đơn đó. | DSP-15, 16, 17, 18, 19 | BR-002, BR-008, BR-010 | M |
| EPIC-DSP-05 | Xịt chẩn đoán tách biệt khỏi doanh thu | Lượt xịt chẩn đoán được ghi nhận tách biệt, không tính vào doanh thu hay thống kê lượt xịt khách hàng. | DSP-20 | BR-005, BR-008 | M |

## A13. EPIC-IOT — Giao tiếp và giám sát thiết bị

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-IOT-01 | Heartbeat và phát hiện mất kết nối | Thiết bị gửi heartbeat mỗi 30 giây; hệ thống đánh dấu UNSTABLE khi thiếu 2-3 nhịp liên tiếp và OFFLINE khi quá 90 giây không nhận được. | IOT-01, 02, 03 | BR-004, BR-006 | M |
| EPIC-IOT-02 | Telemetry, sự kiện thiết bị và lịch sử | Thiết bị gửi telemetry (khối lượng từng slot, trạng thái cửa/cơ cấu/nguồn điện) và các sự kiện vận hành (khởi động, tắt máy, kết nối lại, bảo trì, lỗi cảm biến/xịt); hệ thống lưu lịch sử telemetry phục vụ báo cáo. | IOT-04, 05, 14 | BR-005, BR-006, BR-007 | M |
| EPIC-IOT-03 | Gửi lệnh và xác thực kết nối MQTT | Hệ thống gửi lệnh xịt/chẩn đoán/cấu hình qua MQTT, liên kết mỗi lệnh với xác nhận và kết quả; chỉ thiết bị đã đăng ký với thông tin xác thực hợp lệ mới kết nối được, và chỉ được publish/subscribe trên topic của chính máy mình. | IOT-06, 07, 08, 09 | BR-002, BR-003, BR-004, BR-008, BR-010 | M |
| EPIC-IOT-04 | Đệm cục bộ và phục hồi dữ liệu khi mất mạng | Thiết bị lưu tạm sự kiện chưa gửi được khi mất kết nối và gửi lại kèm mã sự kiện để hệ thống loại bản trùng khi kết nối lại. | IOT-10, 11 | BR-006, BR-008 | M |
| EPIC-IOT-05 | Chặn giao dịch và hiển thị trạng thái khi offline | Hệ thống từ chối tạo đơn hàng khi máy OFFLINE; kiosk hiển thị trạng thái tạm ngưng khi mất liên lạc với hệ thống. | IOT-12, 13 | BR-001, BR-002, BR-010 | M |
| EPIC-IOT-06 | Cập nhật firmware từ xa *(Future Work)* | Cập nhật firmware từ xa có xác minh chữ ký — chưa hiện thực trong MVP. | IOT-15 | BR-004 | W |

## A14. EPIC-ALR — Cảnh báo

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-ALR-01 | Phát hiện, phân loại và chống trùng cảnh báo | Tự động sinh cảnh báo khi: máy OFFLINE, slot sắp hết/hết, cửa mở quá 5 phút ngoài phiên bảo trì/phiên nạp, 3 lượt xịt lỗi liên tiếp cùng slot, hoặc lỗi cảm biến/cơ cấu; mỗi cảnh báo được phân loại đầy đủ và không sinh trùng khi còn cảnh báo cùng loại chưa xử lý. | ALR-01, 02, 03, 04, 05, 06, 07 | BR-005, BR-006, BR-010 | M |
| EPIC-ALR-02 | Vòng đời xử lý cảnh báo và thông báo thương hiệu bị ảnh hưởng | Quản lý 4 trạng thái vòng đời cảnh báo; xác định thương hiệu bị ảnh hưởng và thông báo riêng cho từng Brand Admin không lộ thông tin chéo; Operations Staff tiếp nhận/phân công/đóng, có thể tự sinh phiếu bảo trì cho cảnh báo nghiêm trọng và tự nâng mức khi trễ hạn xử lý. | ALR-08, 09, 10, 11, 12, 13, 14 | BR-006, BR-008, BR-012 | M |
| EPIC-ALR-03 | Thông báo cảnh báo qua kênh ngoài *(Future Work)* | Gửi thông báo cảnh báo qua kênh ngoài (email, Zalo) — chưa hiện thực trong MVP. | ALR-15 | BR-006 | W |

## A15. EPIC-MNT — Bảo trì

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-MNT-01 | Tạo, phân công và phân loại phiếu bảo trì | Operations Staff tạo phiếu bảo trì thủ công cho một máy, phân công cho tài khoản cụ thể, phân loại theo nhóm sự cố/mức nghiêm trọng/ưu tiên/hạn xử lý, quản lý theo 5 trạng thái vòng đời. | MNT-01, 02, 03, 04 | BR-004, BR-006 | M |
| EPIC-MNT-02 | Chuyển chế độ MAINTENANCE và bảo vệ vận hành | Operations Staff chuyển máy sang MAINTENANCE; hệ thống chặn đơn hàng mới trên máy đang bảo trì và thông báo cho mọi Brand Admin có slot trên máy đó. | MNT-05, 06, 07 | BR-002, BR-006, BR-010, BR-012 | M |
| EPIC-MNT-03 | Chẩn đoán và khắc phục tại hiện trường | Operations Staff xem dữ liệu cảm biến/lỗi/sự kiện gần đây, thực hiện lượt xịt chẩn đoán sau xác thực lại, và ghi kết quả chẩn đoán, nguyên nhân, biện pháp xử lý, linh kiện đã thay. | MNT-08, 09, 10 | BR-006, BR-008 | M |
| EPIC-MNT-04 | Checklist an toàn, đóng phiếu và lịch sử bảo trì | Bắt buộc hoàn thành checklist an toàn trước khi trả máy về NORMAL, bắt buộc ghi kết quả xử lý trước khi đóng phiếu; lưu lịch sử bảo trì, cho đính kèm ghi chú/hình ảnh và đo thời gian xử lý sự cố. | MNT-11, 12, 13, 14, 15, 16 | BR-006, BR-008, BR-010 | M |

## A16. EPIC-RPT — Dashboard và báo cáo

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-RPT-01 | Dashboard vận hành cho Platform Super Admin | Số lượng máy theo trạng thái/chế độ, số giao dịch theo trạng thái đơn, tỷ lệ xịt thành công/thất bại, danh sách đơn đã trả tiền chưa xác nhận xịt, và thời gian hoạt động/ngừng/tần suất cảnh báo theo máy. | RPT-01, 03, 04, 05, 13 | BR-002, BR-006, BR-007 | M |
| EPIC-RPT-02 | Báo cáo doanh thu và giao dịch | Báo cáo doanh thu và số giao dịch theo ngày/tuần/tháng/khoảng tùy chọn, và theo máy/địa điểm/slot/thương hiệu cho Platform Super Admin. | RPT-02, 09 | BR-007, BR-009 | M |
| EPIC-RPT-03 | Báo cáo marketing và tồn kho | Xếp hạng sản phẩm theo lượt chọn (lọc theo slot/máy/địa điểm/thời gian) phục vụ marketing, và hiển thị tồn kho ước tính cùng danh sách slot sắp hết. | RPT-06, 07 | BR-005, BR-007 | M |
| EPIC-RPT-04 | Báo cáo cho Brand Admin, giới hạn phạm vi theo hợp đồng | Brand Admin xem báo cáo doanh thu/lượt xịt theo slot mình thuê, với mọi báo cáo tự động giới hạn phạm vi theo hợp đồng và không hiển thị chỉ số cho phép suy ra dữ liệu thương hiệu khác. | RPT-08, 10, 11, 12 | BR-003, BR-007, BR-009, BR-012 | M |
| EPIC-RPT-05 | Xuất báo cáo và quyền xem tổng hợp toàn nền tảng | Xuất báo cáo định dạng CSV cho người có quyền; chỉ Platform Super Admin xem được báo cáo tổng hợp toàn nền tảng. | RPT-14, 15 | BR-003, BR-007, BR-012 | M |

## A17. EPIC-AUD — Nhật ký kiểm toán

| Mã Epic | Tên epic | Chi tiết | FR nguyên tử | BR | Ưu tiên |
|---|---|---|---|---|---|
| EPIC-AUD-01 | Ghi nhật ký cho mọi hành động nghiệp vụ trọng yếu | Ghi nhật ký cho toàn bộ sự kiện trọng yếu: đăng nhập/đăng xuất, đổi tài khoản/vai trò, vòng đời hợp đồng, đổi giá/gán sản phẩm, lệnh thiết bị và kết quả, thanh toán/hoàn tiền, và các thao tác tồn kho (nạp/tháo/điều chỉnh/chuyển sở hữu/chẩn đoán). | AUD-01, 02, 03, 04, 05, 06, 07 | BR-002, BR-005, BR-008, BR-009, BR-013 | M |
| EPIC-AUD-02 | Cấu trúc bản ghi và bất biến | Mỗi bản ghi lưu đủ chủ thể, thương hiệu liên quan, hành động, đối tượng, thời điểm, nguồn, dữ liệu trước/sau; không có chức năng nào cho phép sửa hoặc xóa nhật ký. | AUD-08, 09 | BR-008 | M |
| EPIC-AUD-03 | Tìm kiếm và truy vết xuyên suốt | Platform Super Admin tìm kiếm nhật ký theo nhiều tiêu chí và truy vết trọn chuỗi từ đơn hàng đến thanh toán, lệnh xịt, kết quả thiết bị, tồn kho, hợp đồng và hoàn tiền liên quan. | AUD-10, 11 | BR-008 | M |

---

## Thống kê tổng hợp

| Ưu tiên | Số epic |
|---|---|
| M — Must | 75 |
| S — Should | 0 |
| W — Won't (Future Work) | 3 |
| **Tổng** | **78** |

**Danh sách epic W:** EPIC-PRD-03, EPIC-IOT-06, EPIC-ALR-03 — tương ứng đúng 3 FR nguyên tử mức W đã có ở tài liệu chi tiết (FR-PRD-06, FR-IOT-15, FR-ALR-15).

**Lưu ý:** không có epic nào thuần mức S vì mọi FR mức S trong tài liệu chi tiết đều được gộp cùng epic với ít nhất một FR mức M liên quan trực tiếp (ví dụ FR-MCH-14 mức S nằm trong EPIC-MCH-05 cùng FR-MCH-13 mức M). Khi cần xác định phạm vi cắt giảm theo epic, phải mở lại tài liệu chi tiết để tách phần S ra khỏi epic đó — epic không tự nhiên co giãn ưu tiên.

---

*Tài liệu sinh từ [FR_NFR_SCENTSTATION.md](FR_NFR_SCENTSTATION.md), phiên bản tương ứng với 264 FR / 50 NFR. Khi tài liệu chi tiết thay đổi (thêm/bớt FR nguyên tử), cần đồng bộ lại bảng epic tương ứng ở đây.*
