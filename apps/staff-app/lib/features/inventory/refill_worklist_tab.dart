import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/sales_stops_banner.dart';
import '../../core/widgets/status_badge.dart';

class RefillWorklistTab extends StatefulWidget {
  const RefillWorklistTab({super.key});

  @override
  State<RefillWorklistTab> createState() => _RefillWorklistTabState();
}

class _RefillWorklistTabState extends State<RefillWorklistTab> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _worklist = [];
  List<Map<String, dynamic>> _sessions = [];
  List<SalesStopItem> _salesStops = [];
  List<Map<String, dynamic>> _machines = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _worklist.isEmpty && _sessions.isEmpty && _error == null) {
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
        api.get('/refill-worklist'),
        api.get('/refill-sessions', query: {'page': 1, 'pageSize': 50}),
        api.get('/machine-sales-stops'),
        api.get('/machines', query: {'page': 1, 'pageSize': 200}),
      ]);
      if (!mounted) return;
      setState(() {
        _worklist = List<Map<String, dynamic>>.from((results[0] as Map)['items'] as List? ?? []);
        _sessions = List<Map<String, dynamic>>.from((results[1] as Map)['items'] as List? ?? []);
        _salesStops = ((results[2] as Map)['items'] as List? ?? [])
            .map((e) => SalesStopItem.fromJson(e as Map<String, dynamic>))
            .toList();
        _machines = List<Map<String, dynamic>>.from((results[3] as Map)['items'] as List? ?? []);
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

  Future<void> _openSession(String slotId, {String? refillRequestId}) async {
    final api = AuthScope.of(context).api;
    try {
      await api.post('/refill-sessions', body: {
        'slotId': slotId,
        'refillRequestId': ?refillRequestId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã mở phiếu nạp. Kiosk tạm dừng bán trên máy này.')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _openManualDialog() async {
    if (_machines.isEmpty) return;
    final api = AuthScope.of(context).api;
    String selectedMachineId = _machines.first['id'] as String;
    List<Map<String, dynamic>> slots = [];
    String? selectedSlotId;
    bool loadingSlots = true;

    Future<void> loadSlots(StateSetter setDialogState, String machineId) async {
      setDialogState(() => loadingSlots = true);
      try {
        final res = await api.get('/machines/$machineId/slots') as List;
        final list = List<Map<String, dynamic>>.from(res);
        setDialogState(() {
          slots = list;
          selectedSlotId = list.isNotEmpty ? list.first['id'] as String : null;
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
              title: const Text('Mở phiếu nạp thủ công'),
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
                  const SizedBox(height: 12),
                  if (loadingSlots)
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(),
                    )
                  else
                    DropdownButtonFormField<String>(
                      initialValue: selectedSlotId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Chọn Slot'),
                      items: slots
                          .map(
                            (s) => DropdownMenuItem<String>(
                              value: s['id'] as String,
                              child: Text('Slot #${s['slotNumber']} (${s['status']})'),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setDialogState(() => selectedSlotId = v),
                    ),
                  if (error != null) ...[
                    const SizedBox(height: 10),
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
                            await api.post('/refill-sessions', body: {'slotId': selectedSlotId});
                            if (ctx.mounted) Navigator.pop(ctx);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Đã mở phiếu nạp')),
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
                  child: const Text('Mở phiếu'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _closeSessionDialog(Map<String, dynamic> session) async {
    final api = AuthScope.of(context).api;
    final sessionId = session['id'] as String;
    final slotId = session['slotId'] as String?;
    final productId = session['fragranceProductId'] as String?;

    // Tìm chai gợi ý từ worklist nếu khớp slot
    Map<String, dynamic>? matchingWork;
    for (final w in _worklist) {
      if (w['slotId'] == slotId) {
        matchingWork = w;
        break;
      }
    }
    final suggestedId = (matchingWork?['suggestedBottle'] as Map?)?['id'] as String?;

    List<Map<String, dynamic>> eligibleBottles = [];
    String? selectedBottleId = suggestedId;
    bool loadingBottles = true;
    String? loadError;

    final checks = [false, false, false, false];
    const checklistItems = [
      '1. Đã mở cửa máy an toàn, ngắt thao tác khách hàng',
      '2. Đã tháo chai cũ (nếu có) và đối chiếu mã định danh',
      '3. Đã lắp chai mới đúng khớp nối, kiểm tra không rò rỉ',
      '4. Đã đóng kín cửa máy và kiểm tra đèn sẵn sàng',
    ];
    final notesCtrl = TextEditingController();

    Future<void> fetchEligibleBottles(StateSetter setDialogState) async {
      try {
        final results = await Future.wait([
          api.get('/bottles', query: {
            'page': 1,
            'pageSize': 200,
            'status': 'IN_STOCK',
            'fragranceProductId': ?productId,
          }),
          api.get('/inventory-batches', query: {
            'page': 1,
            'pageSize': 200,
            'authenticityStatus': 'APPROVED',
          }),
        ]);
        final bottleItems = List<Map<String, dynamic>>.from((results[0] as Map)['items'] as List? ?? []);
        final batchItems = List<Map<String, dynamic>>.from((results[1] as Map)['items'] as List? ?? []);
        final approvedBatchIds = batchItems.map((b) => b['id'] as String).toSet();
        final now = DateTime.now();

        final filtered = bottleItems.where((b) {
          if (b['status'] != 'IN_STOCK') return false;
          if (!approvedBatchIds.contains(b['batchId'])) return false;
          // Loại bỏ chai đã qua sử dụng (từng lắp vào máy / tháo ra / đã tiêu hao dung tích)
          if (b['installedAt'] != null || b['removedAt'] != null) return false;
          final currentMl = double.tryParse('${b['currentEstimatedMl'] ?? ''}') ?? 0;
          final initialMl = double.tryParse('${b['initialVolumeMl'] ?? ''}');
          if (currentMl <= 0) return false;
          if (initialMl != null && currentMl < initialMl) return false;
          // Loại bỏ chai đã hết hạn
          final exp = b['expiresAt'] as String?;
          if (exp != null) {
            final dt = DateTime.tryParse(exp);
            if (dt != null && !dt.isAfter(now)) return false;
          }
          return true;
        }).toList()
          ..sort((a, b) {
            final ea = a['expiresAt'] as String?;
            final eb = b['expiresAt'] as String?;
            if (ea == null && eb == null) return 0;
            if (ea == null) return 1;
            if (eb == null) return -1;
            return ea.compareTo(eb);
          });

        setDialogState(() {
          eligibleBottles = filtered;
          if (selectedBottleId == null || !filtered.any((b) => b['id'] == selectedBottleId)) {
            selectedBottleId = filtered.isNotEmpty ? filtered.first['id'] as String : null;
          }
          loadingBottles = false;
        });
      } on ApiException catch (e) {
        setDialogState(() {
          loadError = e.message;
          loadingBottles = false;
        });
      }
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        bool initialized = false;
        bool saving = false;
        String? submitError;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            if (!initialized) {
              initialized = true;
              Future.microtask(() => fetchEligibleBottles(setDialogState));
            }
            final allChecked = checks.every((c) => c);
            return AlertDialog(
              title: const Text('Đóng phiếu nạp & Lắp chai mới'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (loadingBottles)
                      const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
                    else if (loadError != null)
                      Text(loadError!, style: const TextStyle(color: Colors.red))
                    else if (eligibleBottles.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'Không có chai mới hợp lệ trong kho (cần chai mới chưa qua sử dụng, IN_STOCK, còn hạn và lô đã duyệt giấy tờ chính hãng - FR-INV-35).',
                          style: TextStyle(fontSize: 12.5, color: Color(0xFFB91C1C)),
                        ),
                      )
                    else
                      DropdownButtonFormField<String>(
                        initialValue: selectedBottleId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Chọn chai mới lắp vào slot *'),
                        items: eligibleBottles.map((b) {
                          final exp = b['expiresAt'] as String?;
                          return DropdownMenuItem<String>(
                            value: b['id'] as String,
                            child: Text(
                              '${b['identifier']} · ${formatMl(b['currentEstimatedMl'])}${exp != null ? ' · HSD ${formatDate(exp)}' : ''}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (v) => setDialogState(() => selectedBottleId = v),
                      ),
                    const SizedBox(height: 12),
                    const Text(
                      'Checklist nạp nước hoa (FR-INV-14):',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    for (int i = 0; i < checklistItems.length; i++)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        value: checks[i],
                        title: Text(checklistItems[i], style: const TextStyle(fontSize: 12.5)),
                        onChanged: (v) => setDialogState(() => checks[i] = v ?? false),
                      ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: notesCtrl,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Ghi chú (tùy chọn)'),
                    ),
                    if (submitError != null) ...[
                      const SizedBox(height: 8),
                      Text(submitError!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
                FilledButton(
                  onPressed: (selectedBottleId == null || !allChecked || saving)
                      ? null
                      : () async {
                          setDialogState(() {
                            saving = true;
                            submitError = null;
                          });
                          try {
                            await api.post('/refill-sessions/$sessionId/close', body: {
                              'newBottleId': selectedBottleId,
                              'checklistCompleted': true,
                              if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
                            });
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } on ApiException catch (e) {
                            setDialogState(() {
                              saving = false;
                              submitError = e.message;
                            });
                          }
                        },
                  child: const Text('Hoàn tất & Mở bán'),
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
          const SnackBar(content: Text('Đã hoàn tất nạp chai và khôi phục bán hàng!')),
        );
      }
      await _load();
    }
  }

  Future<void> _cancelSessionDialog(String sessionId) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hủy phiếu nạp (FR-INV-37)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Hủy phiếu sẽ giữ nguyên chai cũ và cho phép máy nhận đơn hàng trở lại ngay.',
              style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Lý do hủy *',
                hintText: 'VD: Quên mang chai thay thế / Chờ kiểm tra lại',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C)),
            onPressed: () {
              if (ctrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('Xác nhận hủy'),
          ),
        ],
      ),
    );
    if (reason == null || !mounted) return;
    try {
      await AuthScope.of(context).api.post(
            '/refill-sessions/$sessionId/cancel',
            body: {'reason': reason},
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã hủy phiếu nạp và mở bán lại máy')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final openSessions = _sessions.where((s) => s['status'] == 'STARTED').toList();
    final historySessions = _sessions.where((s) => s['status'] != 'STARTED').take(10).toList();
    final machineNames = <String, String>{
      for (final m in _machines) m['id'] as String: '${m['displayName']} (${m['serialNumber']})',
    };

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openManualDialog,
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Mở phiếu nạp'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 88),
          children: [
            SalesStopsBanner(items: _salesStops),
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
            else ...[
              if (openSessions.isNotEmpty) ...[
                const Text(
                  'Phiếu nạp đang mở (Cần hoàn tất hoặc hủy)',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8)),
                ),
                const SizedBox(height: 8),
                ...openSessions.map((s) {
                  final id = s['id'] as String;
                  final mId = s['machineId'] as String?;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: const BorderSide(color: Color(0xFF3B82F6), width: 1.4),
                      ),
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
                                    machineNames[mId] ?? mId ?? '—',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                  ),
                                ),
                                StatusBadge.fromCode('STARTED', 'Đang nạp'),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Mở lúc: ${formatDateTime(s['startedAt'] as String?)}',
                              style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => _cancelSessionDialog(id),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: const Color(0xFFB91C1C),
                                      side: const BorderSide(color: Color(0xFFFCA5A5)),
                                    ),
                                    child: const Text('Hủy phiếu'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  flex: 2,
                                  child: FilledButton.icon(
                                    onPressed: () => _closeSessionDialog(s),
                                    icon: const Icon(Icons.check_circle_outline),
                                    label: const Text('Đóng & Lắp chai'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 12),
              ],
              const Text(
                'Việc cần nạp (ADR-0026)',
                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              if (_worklist.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        'Hiện không có slot nào cần nạp nước hoa',
                        style: TextStyle(color: AppTheme.textSecondary),
                      ),
                    ),
                  ),
                )
              else
                ..._worklist.map((w) {
                  final kind = w['kind'] as String?;
                  final blocker = w['blocker'] as String?;
                  final openId = w['openRefillSessionId'] as String?;
                  final suggested = w['suggestedBottle'] as Map<String, dynamic>?;
                  final reqId = w['refillRequestId'] as String?;
                  final reqStatus = w['refillRequestStatus'] as String?;
                  final linkableReq = (reqStatus == 'ACCEPTED' || reqStatus == 'SCHEDULED') ? reqId : null;

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
                                    '${w['machineName']} (${w['machineSerial']}) · Slot #${w['slotNumber']}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                                  ),
                                ),
                                StatusBadge.fromCode(kind, refillWorkKindLabel(kind)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${w['locationName'] ?? ''} · ${w['brandName'] ?? ''}',
                              style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Sản phẩm: ${w['productName'] ?? 'Chưa gán sản phẩm'}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                            if (w['estimatedRemainingSprays'] != null)
                              Text(
                                'Còn lại trên máy: ~${w['estimatedRemainingSprays']} lượt xịt',
                                style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                              ),
                            if (w['scheduledAt'] != null)
                              Text(
                                'Lịch hẹn: ${formatDateTime(w['scheduledAt'] as String?)}',
                                style: const TextStyle(fontSize: 12.5, color: Color(0xFF6D28D9)),
                              ),
                            if (suggested != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  'Chai gợi ý (FEFO): ${suggested['identifier']} (${formatMl(suggested['currentEstimatedMl'])}) · Kho còn ${w['availableBottleCount'] ?? 0} chai',
                                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF15803D)),
                                ),
                              ),
                            if (blocker != null)
                              Container(
                                margin: const EdgeInsets.only(top: 8),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFEF2F2),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.block, size: 16, color: Color(0xFFB91C1C)),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        refillBlockerLabel(blocker),
                                        style: const TextStyle(fontSize: 12, color: Color(0xFFB91C1C)),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (openId == null && blocker == null) ...[
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: () => _openSession(
                                    w['slotId'] as String,
                                    refillRequestId: linkableReq,
                                  ),
                                  icon: const Icon(Icons.play_arrow_outlined),
                                  label: const Text('Mở phiếu nạp'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              if (historySessions.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'Lịch sử phiếu nạp gần đây',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                ...historySessions.map((s) {
                  final status = s['status'] as String?;
                  final mId = s['machineId'] as String?;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: ListTile(
                        title: Text(
                          machineNames[mId] ?? mId ?? '—',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                        ),
                        subtitle: Text(
                          'Mở: ${formatDateTime(s['startedAt'] as String?)}${s['notes'] != null ? '\nGhi chú: ${s['notes']}' : ''}',
                          style: const TextStyle(fontSize: 12),
                        ),
                        trailing: StatusBadge.fromCode(status, refillSessionStatusLabel(status)),
                      ),
                    ),
                  );
                }),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
