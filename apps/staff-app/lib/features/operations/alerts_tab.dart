import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/sales_stops_banner.dart';
import '../../core/widgets/status_badge.dart';

class AlertsTab extends StatefulWidget {
  const AlertsTab({super.key});

  @override
  State<AlertsTab> createState() => _AlertsTabState();
}

class _AlertsTabState extends State<AlertsTab> {
  bool _loading = true;
  String? _error;
  String _statusFilter = 'OPEN';
  List<Map<String, dynamic>> _alerts = [];
  List<SalesStopItem> _salesStops = [];
  Map<String, String> _machineNames = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _alerts.isEmpty && _error == null) {
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
        api.get('/alerts', query: {
          'page': 1,
          'pageSize': 50,
          if (_statusFilter != 'ALL') 'status': _statusFilter,
        }),
        api.get('/machine-sales-stops'),
        api.get('/machines', query: {'page': 1, 'pageSize': 200}),
      ]);
      final alertRes = results[0] as Map<String, dynamic>;
      final stopsRes = results[1] as Map<String, dynamic>;
      final machinesRes = results[2] as Map<String, dynamic>;

      final mMap = <String, String>{};
      for (final m in (machinesRes['items'] as List? ?? [])) {
        final mm = m as Map<String, dynamic>;
        mMap[mm['id'] as String] = '${mm['displayName']} (${mm['serialNumber']})';
      }

      if (!mounted) return;
      setState(() {
        _alerts = List<Map<String, dynamic>>.from(alertRes['items'] as List? ?? []);
        _salesStops = (stopsRes['items'] as List? ?? [])
            .map((e) => SalesStopItem.fromJson(e as Map<String, dynamic>))
            .toList();
        _machineNames = mMap;
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

  Future<void> _runAction(String id, String action, {Map<String, dynamic>? body}) async {
    final api = AuthScope.of(context).api;
    try {
      await api.post('/alerts/$id/$action', body: body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã cập nhật cảnh báo')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _resolveDialog(String id) async {
    final ctrl = TextEditingController();
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xác nhận đã xử lý cảnh báo'),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Biện pháp / kết quả xử lý *',
            hintText: 'Ví dụ: Đã kiểm tra và khởi động lại bơm xịt...',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(
            onPressed: () {
              if (ctrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('Xác nhận'),
          ),
        ],
      ),
    );
    if (res != null && res.isNotEmpty) {
      await _runAction(id, 'resolve', body: {'resolution': res});
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthScope.of(context).user;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SalesStopsBanner(items: _salesStops),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final entry in const [
                  ('OPEN', 'Đang mở'),
                  ('ACKNOWLEDGED', 'Đã tiếp nhận'),
                  ('IN_PROGRESS', 'Đang xử lý'),
                  ('RESOLVED', 'Đã xử lý'),
                  ('ALL', 'Tất cả'),
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
          else if (_alerts.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Center(
                  child: Text(
                    'Không có cảnh báo nào ở trạng thái này',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ),
              ),
            )
          else
            ..._alerts.map((a) {
              final id = a['id'] as String;
              final status = a['status'] as String?;
              final severity = a['severity'] as String?;
              final machineId = a['machineId'] as String?;
              final title = a['title'] as String? ?? a['type'] as String? ?? 'Cảnh báo';
              final desc = a['description'] as String?;

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                title,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusBadge.fromCode(severity, severityLabel(severity)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        if (machineId != null)
                          Text(
                            'Máy: ${_machineNames[machineId] ?? machineId}',
                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
                          ),
                        if (desc != null && desc.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            desc,
                            style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                          ),
                        ],
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            StatusBadge.fromCode(status, alertStatusLabel(status)),
                            Text(
                              formatDateTime(a['triggeredAt'] as String? ?? a['createdAt'] as String?),
                              style: const TextStyle(fontSize: 11.5, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                        if (status == 'OPEN' || status == 'ACKNOWLEDGED' || status == 'IN_PROGRESS' || status == 'RESOLVED') ...[
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (status == 'OPEN')
                                OutlinedButton(
                                  onPressed: () => _runAction(id, 'acknowledge'),
                                  child: const Text('Tiếp nhận'),
                                ),
                              if ((status == 'OPEN' || status == 'ACKNOWLEDGED') && user != null)
                                OutlinedButton(
                                  onPressed: () => _runAction(id, 'assign', body: {'assignedTo': user.id}),
                                  child: const Text('Nhận xử lý'),
                                ),
                              if (status == 'OPEN' || status == 'ACKNOWLEDGED' || status == 'IN_PROGRESS')
                                FilledButton(
                                  onPressed: () => _resolveDialog(id),
                                  child: const Text('Xử lý xong'),
                                ),
                              if (status == 'RESOLVED')
                                FilledButton(
                                  onPressed: () => _runAction(id, 'close'),
                                  child: const Text('Đóng cảnh báo'),
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
