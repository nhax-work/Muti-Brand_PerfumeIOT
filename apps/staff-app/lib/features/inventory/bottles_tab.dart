import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/reauth_dialog.dart';
import '../../core/widgets/status_badge.dart';

class BottlesTab extends StatefulWidget {
  const BottlesTab({super.key});

  @override
  State<BottlesTab> createState() => _BottlesTabState();
}

class _BottlesTabState extends State<BottlesTab> {
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';
  List<Map<String, dynamic>> _bottles = [];
  List<Map<String, dynamic>> _machines = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _bottles.isEmpty && _error == null) {
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
        api.get('/bottles', query: {
          'page': 1,
          'pageSize': 80,
          if (_statusFilter != 'ALL') 'status': _statusFilter,
        }),
        api.get('/machines', query: {'page': 1, 'pageSize': 200}),
      ]);
      if (!mounted) return;
      setState(() {
        _bottles = List<Map<String, dynamic>>.from((results[0] as Map)['items'] as List? ?? []);
        _machines = List<Map<String, dynamic>>.from((results[1] as Map)['items'] as List? ?? []);
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

  Future<void> _removeBottleFromSlotDialog() async {
    if (_machines.isEmpty) return;
    final api = AuthScope.of(context).api;
    String selectedMachineId = _machines.first['id'] as String;
    List<Map<String, dynamic>> slots = [];
    String? selectedSlotId;
    bool loadingSlots = true;
    final notesCtrl = TextEditingController();

    Future<void> loadSlots(StateSetter setDialogState, String mId) async {
      setDialogState(() => loadingSlots = true);
      try {
        final list = List<Map<String, dynamic>>.from(await api.get('/machines/$mId/slots') as List);
        final withBottle = list.where((s) => s['currentBottleId'] != null).toList();
        setDialogState(() {
          slots = withBottle;
          selectedSlotId = withBottle.isNotEmpty ? withBottle.first['id'] as String : null;
          loadingSlots = false;
        });
      } catch (_) {
        setDialogState(() => loadingSlots = false);
      }
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        bool initialized = false;
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            if (!initialized) {
              initialized = true;
              Future.microtask(() => loadSlots(setDialogState, selectedMachineId));
            }
            return AlertDialog(
              title: const Text('Tháo chai khỏi Slot về kho (FR-INV-15)'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedMachineId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Chọn máy'),
                    items: _machines
                        .map(
                          (m) => DropdownMenuItem<String>(
                            value: m['id'] as String,
                            child: Text('${m['displayName']} (${m['serialNumber']})'),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v == null) return;
                      setDialogState(() => selectedMachineId = v);
                      loadSlots(setDialogState, v);
                    },
                  ),
                  const SizedBox(height: 10),
                  if (loadingSlots)
                    const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator())
                  else if (slots.isEmpty)
                    const Text(
                      'Máy này không có slot nào đang lắp chai.',
                      style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                    )
                  else
                    DropdownButtonFormField<String>(
                      initialValue: selectedSlotId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Slot đang có chai'),
                      items: slots
                          .map(
                            (s) => DropdownMenuItem<String>(
                              value: s['id'] as String,
                              child: Text('Slot #${s['slotNumber']} · ${formatMl(s['estimatedRemainingMl'])}'),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setDialogState(() => selectedSlotId = v),
                    ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: notesCtrl,
                    decoration: const InputDecoration(labelText: 'Ghi chú (tùy chọn)'),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ],
                ],
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
                FilledButton(
                  onPressed: (selectedSlotId == null || saving)
                      ? null
                      : () async {
                          setDialogState(() {
                            saving = true;
                            error = null;
                          });
                          try {
                            await api.delete(
                              '/slots/$selectedSlotId/bottle',
                              body: {
                                if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
                              },
                            );
                            if (ctx.mounted) Navigator.pop(ctx);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Đã tháo chai về kho thành công')),
                              );
                              await _load();
                            }
                          } on ApiException catch (e) {
                            setDialogState(() {
                              saving = false;
                              error = e.message;
                            });
                          }
                        },
                  child: const Text('Xác nhận tháo'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _markDamaged(Map<String, dynamic> bottle) async {
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Báo hư hỏng chai ${bottle['identifier']}'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'Lý do hư hỏng *',
            hintText: 'VD: Vỡ chai trong kho / Rò rỉ vòi',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C)),
            onPressed: () {
              if (reasonCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, reasonCtrl.text.trim());
            },
            child: const Text('Tiếp tục'),
          ),
        ],
      ),
    );
    if (reason == null || !mounted) return;
    final reauth = await promptReauthToken(
      context,
      actionDescription: 'Ghi nhận chai hư hỏng cần xác thực lại mật khẩu.',
    );
    if (reauth == null || !mounted) return;

    try {
      await AuthScope.of(context).api.post(
            '/bottles/${bottle['id']}/mark-damaged',
            body: {'reason': reason},
            reauthToken: reauth,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã ghi nhận chai hư hỏng')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _adjustStock(Map<String, dynamic> bottle) async {
    final mlCtrl = TextEditingController(text: '${bottle['currentEstimatedMl'] ?? 0}');
    final reasonCtrl = TextEditingController();

    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Điều chỉnh tồn kho ${bottle['identifier']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: mlCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Dung tích thực tế sau kiểm (ml) *'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: reasonCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Lý do điều chỉnh *',
                hintText: 'VD: Hao hụt thực tế khi kiểm tra định kỳ',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(
            onPressed: () {
              final ml = double.tryParse(mlCtrl.text.trim());
              if (ml == null || ml < 0 || reasonCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, {
                'bottleId': bottle['id'],
                'afterQuantityMl': ml,
                'reason': reasonCtrl.text.trim(),
              });
            },
            child: const Text('Tiếp tục'),
          ),
        ],
      ),
    );
    if (payload == null || !mounted) return;
    final reauth = await promptReauthToken(
      context,
      actionDescription: 'Điều chỉnh tồn kho yêu cầu xác thực lại mật khẩu (FR-INV-16).',
    );
    if (reauth == null || !mounted) return;

    try {
      await AuthScope.of(context).api.post(
            '/inventory-adjustments',
            body: payload,
            reauthToken: reauth,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã điều chỉnh tồn kho chai')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _showHistory(Map<String, dynamic> bottle) async {
    final api = AuthScope.of(context).api;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => FutureBuilder<dynamic>(
        future: api.get('/bottles/${bottle['id']}/history', query: {'page': 1, 'pageSize': 50}),
        builder: (ctx, snap) {
          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.6,
            builder: (ctx, scrollCtrl) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) {
                return Center(child: Text('${snap.error}'));
              }
              final items = List<Map<String, dynamic>>.from(
                (snap.data as Map<String, dynamic>)['items'] as List? ?? [],
              );
              return ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Lịch sử vòng đời chai ${bottle['identifier']}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    const Text('Chưa có lịch sử nào', style: TextStyle(color: AppTheme.textSecondary))
                  else
                    ...items.map(
                      (e) => ListTile(
                        dense: true,
                        leading: const Icon(Icons.history, size: 18),
                        title: Text('${e['action'] ?? ''}'),
                        subtitle: Text(formatDateTime(e['createdAt'] as String?)),
                      ),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _removeBottleFromSlotDialog,
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.eject_outlined),
        label: const Text('Tháo chai về kho'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 88),
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final entry in const [
                    ('ALL', 'Tất cả'),
                    ('IN_STOCK', 'Trong kho'),
                    ('INSTALLED', 'Đang lắp'),
                    ('LOW', 'Sắp hết'),
                    ('EMPTY', 'Đã hết'),
                    ('DAMAGED', 'Hư hỏng'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(entry.$2),
                        selected: _statusFilter == entry.$1,
                        onSelected: (_) {
                          setState(() => _statusFilter = entry.$1);
                          _load();
                        },
                      ),
                    ),
                ],
              ),
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
            else if (_bottles.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Center(
                    child: Text('Không có chai nào', style: TextStyle(color: AppTheme.textSecondary)),
                  ),
                ),
              )
            else
              ..._bottles.map((b) {
                final status = b['status'] as String?;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  b['identifier'] as String? ?? '—',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                ),
                              ),
                              StatusBadge.fromCode(status, bottleStatusLabel(status)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Còn lại: ${formatMl(b['currentEstimatedMl'])} / ${formatMl(b['initialVolumeMl'])} · HSD: ${formatDate(b['expiresAt'] as String?)}',
                            style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton(
                                onPressed: () => _showHistory(b),
                                child: const Text('Lịch sử'),
                              ),
                              OutlinedButton(
                                onPressed: () => _adjustStock(b),
                                child: const Text('Điều chỉnh ml'),
                              ),
                              if (status != 'DAMAGED' && status != 'RETURNED_TO_BRAND')
                                OutlinedButton(
                                  onPressed: () => _markDamaged(b),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFFB91C1C),
                                    side: const BorderSide(color: Color(0xFFFCA5A5)),
                                  ),
                                  child: const Text('Báo hỏng'),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
