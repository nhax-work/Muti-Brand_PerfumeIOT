import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badge.dart';

class ShipmentsTab extends StatefulWidget {
  const ShipmentsTab({super.key});

  @override
  State<ShipmentsTab> createState() => _ShipmentsTabState();
}

class _ShipmentsTabState extends State<ShipmentsTab> {
  bool _loading = true;
  String? _error;
  int _segment = 0; // 0: Khai báo gửi hàng, 1: Lô nước hoa
  List<Map<String, dynamic>> _shipments = [];
  List<Map<String, dynamic>> _batches = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _shipments.isEmpty && _batches.isEmpty && _error == null) {
      _load();
    }
  }

  Future<void> _load() async {
    final api = AuthScope.of(context).api;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        api.get('/shipment-declarations', query: {'page': 1, 'pageSize': 50}),
        api.get('/inventory-batches', query: {'page': 1, 'pageSize': 50}),
      ]);
      if (!mounted) return;
      setState(() {
        _shipments = List<Map<String, dynamic>>.from((results[0] as Map)['items'] as List? ?? []);
        _batches = List<Map<String, dynamic>>.from((results[1] as Map)['items'] as List? ?? []);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _receiveDialog(Map<String, dynamic> shipment) async {
    final id = shipment['id'] as String;
    final declaredQty = shipment['declaredQuantity'] as int? ?? 0;
    final qtyCtrl = TextEditingController(text: declaredQty.toString());
    final batchCtrl = TextEditingController(
      text: 'LOT-${DateTime.now().toIso8601String().substring(0, 10).replaceAll('-', '')}',
    );
    final notesCtrl = TextEditingController();
    DateTime? expiresAt = DateTime.now().add(const Duration(days: 365));

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            final receivedQty = int.tryParse(qtyCtrl.text.trim()) ?? declaredQty;
            final hasDiscrepancy = receivedQty != declaredQty;
            return AlertDialog(
              title: const Text('Tiếp nhận & Đối chiếu lô hàng'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Khai báo: $declaredQty chai × ${formatMl(shipment['declaredBottleVolumeMl'])}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: qtyCtrl,
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setDialogState(() {}),
                      decoration: const InputDecoration(labelText: 'Số lượng thực nhận *'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: batchCtrl,
                      decoration: const InputDecoration(labelText: 'Số lô (Batch number) *'),
                    ),
                    const SizedBox(height: 10),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Hạn sử dụng lô', style: TextStyle(fontSize: 13)),
                      subtitle: Text(
                        expiresAt != null ? formatDate(expiresAt!.toIso8601String()) : 'Chưa chọn',
                      ),
                      trailing: const Icon(Icons.calendar_today_outlined, size: 18),
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: expiresAt ?? DateTime.now().add(const Duration(days: 365)),
                          firstDate: DateTime.now(),
                          lastDate: DateTime.now().add(const Duration(days: 3650)),
                        );
                        if (picked != null) setDialogState(() => expiresAt = picked);
                      },
                    ),
                    if (hasDiscrepancy) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFFBEB),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'Số thực nhận khác khai báo — trạng thái sẽ chuyển DISCREPANCY và bắt buộc nhập ghi chú (FR-INV-25).',
                          style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: notesCtrl,
                        maxLines: 2,
                        decoration: const InputDecoration(labelText: 'Ghi chú lệch số lượng *'),
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 8),
                      Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          final qty = int.tryParse(qtyCtrl.text.trim());
                          if (qty == null || qty < 0) {
                            setDialogState(() => error = 'Số lượng không hợp lệ');
                            return;
                          }
                          if (batchCtrl.text.trim().isEmpty) {
                            setDialogState(() => error = 'Vui lòng nhập số lô');
                            return;
                          }
                          if (qty != declaredQty && notesCtrl.text.trim().isEmpty) {
                            setDialogState(() => error = 'Bắt buộc nhập ghi chú khi lệch số lượng');
                            return;
                          }
                          setDialogState(() {
                            saving = true;
                            error = null;
                          });
                          try {
                            await AuthScope.of(context).api.post(
                              '/shipment-declarations/$id/receive',
                              body: {
                                'receivedQuantity': qty,
                                'batchNumber': batchCtrl.text.trim(),
                                if (expiresAt != null) 'expiresAt': expiresAt!.toUtc().toIso8601String(),
                                if (notesCtrl.text.trim().isNotEmpty)
                                  'discrepancyNotes': notesCtrl.text.trim(),
                              },
                            );
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } on ApiException catch (e) {
                            setDialogState(() {
                              saving = false;
                              error = e.message;
                            });
                          }
                        },
                  child: const Text('Xác nhận tiếp nhận'),
                ),
              ],
            );
          },
        );
      },
    );

    if (ok == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã tiếp nhận lô hàng và tự động tạo chai vào kho!')),
        );
      }
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Khai báo gửi hàng')),
              ButtonSegment(value: 1, label: Text('Lô nước hoa')),
            ],
            selected: {_segment},
            onSelectionChanged: (s) => setState(() => _segment = s.first),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  children: [
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 10),
                    FilledButton(onPressed: _load, child: const Text('Thử lại')),
                  ],
                ),
              ),
            )
          else if (_segment == 0) ...[
            if (_shipments.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Center(
                    child: Text('Chưa có khai báo gửi hàng nào', style: TextStyle(color: AppTheme.textSecondary)),
                  ),
                ),
              )
            else
              ..._shipments.map((s) {
                final status = s['status'] as String?;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  'Khai báo ${s['declaredQuantity']} chai × ${formatMl(s['declaredBottleVolumeMl'])}',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                                ),
                              ),
                              StatusBadge.fromCode(status, shipmentStatusLabel(status)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          if (s['expectedShipDate'] != null)
                            Text(
                              'Dự kiến gửi: ${formatDate(s['expectedShipDate'] as String?)}',
                              style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                            ),
                          if (s['receivedQuantity'] != null)
                            Text(
                              'Thực nhận: ${s['receivedQuantity']} chai',
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                            ),
                          if (s['discrepancyNotes'] != null)
                            Text(
                              'Ghi chú lệch: ${s['discrepancyNotes']}',
                              style: const TextStyle(fontSize: 12.5, color: Color(0xFFB45309)),
                            ),
                          if (status == 'DECLARED') ...[
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: () => _receiveDialog(s),
                                icon: const Icon(Icons.inventory_outlined),
                                label: const Text('Tiếp nhận & Đối chiếu'),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                );
              }),
          ] else ...[
            if (_batches.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Center(
                    child: Text('Chưa có lô nước hoa nào', style: TextStyle(color: AppTheme.textSecondary)),
                  ),
                ),
              )
            else
              ..._batches.map((b) {
                final authStatus = b['authenticityStatus'] as String?;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  'Lô ${b['batchNumber'] ?? '—'}',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                ),
                              ),
                              StatusBadge.fromCode(authStatus, authenticityStatusLabel(authStatus)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Số lượng nhập: ${b['quantityReceived']} chai · Hạn dùng: ${formatDate(b['expiresAt'] as String?)}',
                            style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                          ),
                          Text(
                            'Ngày nhập: ${formatDateTime(b['receivedAt'] as String?)}',
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}
