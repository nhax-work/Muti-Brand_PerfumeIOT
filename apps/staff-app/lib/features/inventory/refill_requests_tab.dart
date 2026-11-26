import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badge.dart';

class RefillRequestsTab extends StatefulWidget {
  const RefillRequestsTab({super.key});

  @override
  State<RefillRequestsTab> createState() => _RefillRequestsTabState();
}

class _RefillRequestsTabState extends State<RefillRequestsTab> {
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';
  List<Map<String, dynamic>> _requests = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _requests.isEmpty && _error == null) {
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
      final res = await api.get('/refill-requests', query: {
        'page': 1,
        'pageSize': 50,
        if (_statusFilter != 'ALL') 'status': _statusFilter,
      }) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _requests = List<Map<String, dynamic>>.from(res['items'] as List? ?? []);
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

  Future<void> _runAction(String id, String action, {Map<String, dynamic>? body, String? okMsg}) async {
    try {
      await AuthScope.of(context).api.post('/refill-requests/$id/$action', body: body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(okMsg ?? 'Thao tác thành công')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _rejectDialog(String id) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Từ chối yêu cầu bổ sung'),
        content: TextField(
          controller: ctrl,
          maxLines: 2,
          decoration: const InputDecoration(labelText: 'Lý do từ chối *'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C)),
            onPressed: () {
              if (ctrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('Từ chối'),
          ),
        ],
      ),
    );
    if (reason != null) {
      await _runAction(id, 'reject', body: {'reason': reason}, okMsg: 'Đã từ chối yêu cầu');
    }
  }

  Future<void> _scheduleDialog(String id) async {
    final now = DateTime.now().add(const Duration(hours: 2));
    final date = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now),
    );
    if (time == null || !mounted) return;
    final scheduled = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    await _runAction(
      id,
      'schedule',
      body: {'scheduledAt': scheduled.toUtc().toIso8601String()},
      okMsg: 'Đã lên lịch nạp',
    );
  }

  Future<void> _openRefill(Map<String, dynamic> req) async {
    final slotId = req['slotId'] as String?;
    final reqId = req['id'] as String;
    if (slotId == null) return;
    try {
      await AuthScope.of(context).api.post('/refill-sessions', body: {
        'slotId': slotId,
        'refillRequestId': reqId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã mở phiếu nạp cho yêu cầu này. Chuyển sang tab "Việc nạp" để đóng phiếu.')),
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
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final entry in const [
                  ('ALL', 'Tất cả'),
                  ('SUBMITTED', 'Chờ duyệt'),
                  ('ACCEPTED', 'Đã duyệt'),
                  ('SCHEDULED', 'Đã lên lịch'),
                  ('COMPLETED', 'Hoàn thành'),
                  ('REJECTED', 'Từ chối'),
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
          else if (_requests.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Center(
                  child: Text('Không có yêu cầu bổ sung nào', style: TextStyle(color: AppTheme.textSecondary)),
                ),
              ),
            )
          else
            ..._requests.map((r) {
              final id = r['id'] as String;
              final status = r['status'] as String?;
              final reason = r['reason'] as String?;
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
                                '${r['machineSerial'] ?? '—'} · Slot #${r['slotNumber'] ?? '?'}',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                              ),
                            ),
                            StatusBadge.fromCode(status, refillRequestStatusLabel(status)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${r['brandName'] ?? ''} · ${r['productName'] ?? ''}',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Lý do: ${refillRequestReasonLabel(reason)}',
                          style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                        ),
                        if (r['note'] != null && (r['note'] as String).isNotEmpty)
                          Text(
                            'Ghi chú: ${r['note']}',
                            style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                          ),
                        if (r['scheduledAt'] != null)
                          Text(
                            'Lịch hẹn: ${formatDateTime(r['scheduledAt'] as String?)}',
                            style: const TextStyle(fontSize: 12.5, color: Color(0xFF6D28D9)),
                          ),
                        if (status == 'SUBMITTED' || status == 'ACCEPTED' || status == 'SCHEDULED') ...[
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (status == 'SUBMITTED') ...[
                                FilledButton(
                                  onPressed: () => _runAction(id, 'accept', okMsg: 'Đã chấp nhận yêu cầu'),
                                  child: const Text('Chấp nhận'),
                                ),
                                OutlinedButton(
                                  onPressed: () => _rejectDialog(id),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFFB91C1C),
                                    side: const BorderSide(color: Color(0xFFFCA5A5)),
                                  ),
                                  child: const Text('Từ chối'),
                                ),
                              ],
                              if (status == 'ACCEPTED')
                                OutlinedButton(
                                  onPressed: () => _scheduleDialog(id),
                                  child: const Text('Lên lịch nạp'),
                                ),
                              if (status == 'ACCEPTED' || status == 'SCHEDULED')
                                FilledButton.icon(
                                  onPressed: () => _openRefill(r),
                                  icon: const Icon(Icons.play_arrow),
                                  label: const Text('Mở phiếu nạp'),
                                ),
                              if (status == 'ACCEPTED' || status == 'SCHEDULED')
                                OutlinedButton(
                                  onPressed: () => _runAction(id, 'cancel', okMsg: 'Đã hủy yêu cầu'),
                                  child: const Text('Hủy'),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
