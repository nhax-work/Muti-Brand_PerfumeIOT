import 'package:flutter/material.dart';
import '../utils/formatters.dart';

class SalesStopItem {
  final String machineId;
  final String machineName;
  final String serialNumber;
  final String locationName;
  final String reason;
  final String? since;
  final int? refillSlotNumber;
  final String? refillPerformedByName;

  const SalesStopItem({
    required this.machineId,
    required this.machineName,
    required this.serialNumber,
    required this.locationName,
    required this.reason,
    this.since,
    this.refillSlotNumber,
    this.refillPerformedByName,
  });

  factory SalesStopItem.fromJson(Map<String, dynamic> json) {
    final refill = json['refillSession'] as Map<String, dynamic>?;
    return SalesStopItem(
      machineId: json['machineId'] as String,
      machineName: json['machineName'] as String? ?? '',
      serialNumber: json['serialNumber'] as String? ?? '',
      locationName: json['locationName'] as String? ?? '',
      reason: json['reason'] as String? ?? '',
      since: json['since'] as String?,
      refillSlotNumber: refill?['slotNumber'] as int?,
      refillPerformedByName: refill?['performedByName'] as String?,
    );
  }

  String get reasonText {
    return switch (reason) {
      'REFILL_SESSION' =>
        'Đang mở phiếu nạp Slot #${refillSlotNumber ?? '?'} (${refillPerformedByName ?? 'Thủ kho'})',
      'MAINTENANCE' => 'Đang bảo trì',
      'DRAINING' => 'Đang chờ cạn đơn để bảo trì',
      'DISABLED' => 'Đã vô hiệu hóa',
      'OFFLINE' => 'Mất kết nối (Offline)',
      _ => reason,
    };
  }
}

class SalesStopsBanner extends StatelessWidget {
  final List<SalesStopItem> items;

  const SalesStopsBanner({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Color(0xFFB45309), size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${items.length} máy đang dừng bán — Kiosk không nhận đơn mới',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: Color(0xFF92400E),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ...items.map(
            (e) => Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '• ${e.machineName} (${e.serialNumber}): ${e.reasonText}${e.since != null ? ' · từ ${formatDateTime(e.since)}' : ''}',
                style: const TextStyle(fontSize: 12, color: Color(0xFF78350F)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
