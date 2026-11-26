import 'package:flutter/material.dart';

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  factory StatusBadge.fromCode(String? code, String label) {
    final Color c = switch (code) {
      'ONLINE' || 'NORMAL' || 'COMPLETED' || 'APPROVED' || 'PASS' || 'AVAILABLE' || 'INSTALLED' || 'RECEIVED' =>
        const Color(0xFF15803D),
      'IN_PROGRESS' || 'STARTED' || 'ACCEPTED' || 'SUBMITTED' || 'IN_STOCK' || 'ACKNOWLEDGED' || 'ASSIGNED' || 'SCHEDULED' =>
        const Color(0xFF1D4ED8),
      'DRAINING' || 'MAINTENANCE' || 'WARNING' || 'HIGH' || 'LOW' || 'LOW_STOCK' || 'OPEN' || 'PENDING' || 'DECLARED' || 'DISCREPANCY' || 'POST_TEST' || 'WAITING_PART' =>
        const Color(0xFFB45309),
      'CRITICAL' || 'OFFLINE' || 'DISABLED' || 'REJECTED' || 'DAMAGED' || 'EXPIRED' || 'FAIL' || 'UNAVAILABLE' =>
        const Color(0xFFB91C1C),
      'FIRST_INSTALL' => const Color(0xFF6D28D9),
      _ => const Color(0xFF475569),
    };
    return StatusBadge(label: label, color: c);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
