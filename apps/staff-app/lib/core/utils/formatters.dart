import 'package:intl/intl.dart';

String formatDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return iso;
  return DateFormat('dd/MM/yyyy HH:mm').format(dt);
}

String formatDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return iso;
  return DateFormat('dd/MM/yyyy').format(dt);
}

String formatMl(dynamic value) {
  if (value == null) return '0 ml';
  final num? n = value is num ? value : num.tryParse(value.toString());
  if (n == null) return '$value ml';
  if (n == n.roundToDouble()) return '${n.toInt()} ml';
  return '${n.toStringAsFixed(1)} ml';
}

String roleLabel(String role) {
  return switch (role) {
    'OPERATIONS_STAFF' => 'Nhân viên Vận hành & Bảo trì',
    'INVENTORY_STAFF' => 'Nhân viên Kho & Nạp nước hoa',
    'PLATFORM_SUPER_ADMIN' => 'Quản trị viên nền tảng',
    'BRAND_ADMIN' => 'Quản trị Thương hiệu',
    _ => role,
  };
}

String machineStatusLabel(String? status) {
  return switch (status) {
    'ONLINE' => 'Trực tuyến',
    'UNSTABLE' => 'Không ổn định',
    'OFFLINE' => 'Ngoại tuyến',
    _ => status ?? '—',
  };
}

String machineModeLabel(String? mode) {
  return switch (mode) {
    'NORMAL' => 'Bình thường',
    'DRAINING' => 'Chờ bảo trì (Draining)',
    'MAINTENANCE' => 'Bảo trì',
    'DISABLED' => 'Vô hiệu hóa',
    _ => mode ?? '—',
  };
}

String ticketStatusLabel(String? status) {
  return switch (status) {
    'OPEN' => 'Mới mở',
    'ASSIGNED' => 'Đã phân công',
    'IN_PROGRESS' => 'Đang xử lý',
    'WAITING_PART' => 'Chờ linh kiện',
    'POST_TEST' => 'Kiểm tra sau sửa',
    'RESOLVED' => 'Đã khắc phục',
    'CLOSED' => 'Đã đóng',
    'REOPENED' => 'Mở lại',
    _ => status ?? '—',
  };
}

String alertStatusLabel(String? status) {
  return switch (status) {
    'OPEN' => 'Đang mở',
    'ACKNOWLEDGED' => 'Đã tiếp nhận',
    'IN_PROGRESS' => 'Đang xử lý',
    'RESOLVED' => 'Đã xử lý',
    'CLOSED' => 'Đã đóng',
    _ => status ?? '—',
  };
}

String severityLabel(String? severity) {
  return switch (severity) {
    'CRITICAL' => 'Nghiêm trọng',
    'HIGH' => 'Cao',
    'WARNING' => 'Cảnh báo',
    'INFO' => 'Thông tin',
    _ => severity ?? '—',
  };
}

String priorityLabel(String? priority) {
  return switch (priority) {
    'CRITICAL' => 'Khẩn cấp',
    'HIGH' => 'Cao',
    'MEDIUM' => 'Trung bình',
    'LOW' => 'Thấp',
    _ => priority ?? '—',
  };
}

String refillWorkKindLabel(String? kind) {
  return switch (kind) {
    'FIRST_INSTALL' => 'Lắp chai đầu tiên',
    'REFILL_REQUEST' => 'Theo yêu cầu bổ sung',
    'LOW_STOCK' => 'Sắp hết nước hoa',
    _ => kind ?? '—',
  };
}

String refillBlockerLabel(String? blocker) {
  return switch (blocker) {
    'PRODUCT_NOT_ASSIGNED' => 'Thương hiệu chưa gán sản phẩm cho slot',
    'REQUEST_NOT_APPROVED' => 'Yêu cầu bổ sung chưa được duyệt',
    'NO_STOCK' => 'Kho hết chai còn hạn của sản phẩm này',
    'DOCS_NOT_APPROVED' => 'Lô hàng chưa được duyệt giấy tờ chính hãng',
    _ => blocker ?? '',
  };
}

String refillSessionStatusLabel(String? status) {
  return switch (status) {
    'STARTED' => 'Đang thực hiện',
    'COMPLETED' => 'Hoàn thành',
    'CANCELLED' => 'Đã hủy',
    _ => status ?? '—',
  };
}

String refillRequestStatusLabel(String? status) {
  return switch (status) {
    'SUBMITTED' => 'Chờ duyệt',
    'ACCEPTED' => 'Đã duyệt',
    'SCHEDULED' => 'Đã lên lịch',
    'COMPLETED' => 'Hoàn thành',
    'REJECTED' => 'Từ chối',
    'CANCELLED' => 'Đã hủy',
    _ => status ?? '—',
  };
}

String refillRequestReasonLabel(String? reason) {
  return switch (reason) {
    'LOW_STOCK' => 'Sắp hết nước hoa',
    'EXPIRING' => 'Chai sắp hết hạn',
    'PRODUCT_CHANGE' => 'Đổi sản phẩm',
    _ => reason ?? '—',
  };
}

String shipmentStatusLabel(String? status) {
  return switch (status) {
    'DECLARED' => 'Chờ tiếp nhận',
    'RECEIVED' => 'Đã tiếp nhận',
    'DISCREPANCY' => 'Lệch số lượng',
    'CANCELLED' => 'Đã hủy',
    _ => status ?? '—',
  };
}

String authenticityStatusLabel(String? status) {
  return switch (status) {
    'NOT_SUBMITTED' => 'Chưa nộp giấy tờ',
    'PENDING' => 'Chờ duyệt giấy tờ',
    'APPROVED' => 'Đã duyệt chính hãng',
    'REJECTED' => 'Từ chối giấy tờ',
    _ => status ?? '—',
  };
}

String bottleStatusLabel(String? status) {
  return switch (status) {
    'IN_STOCK' => 'Trong kho',
    'INSTALLED' => 'Đang lắp trên máy',
    'LOW' => 'Sắp hết',
    'EMPTY' => 'Đã hết',
    'DAMAGED' => 'Hư hỏng',
    'EXPIRED' => 'Hết hạn',
    'LIQUIDATED' => 'Đã thanh lý',
    'RETURNED_TO_BRAND' => 'Đã trả thương hiệu',
    _ => status ?? '—',
  };
}
