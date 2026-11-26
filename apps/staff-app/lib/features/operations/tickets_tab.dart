import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badge.dart';
import 'ticket_detail_screen.dart';

class TicketsTab extends StatefulWidget {
  const TicketsTab({super.key});

  @override
  State<TicketsTab> createState() => _TicketsTabState();
}

class _TicketsTabState extends State<TicketsTab> {
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';
  bool _onlyMine = false;
  List<Map<String, dynamic>> _tickets = [];
  List<Map<String, dynamic>> _machines = [];
  Map<String, String> _machineNames = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _tickets.isEmpty && _error == null) {
      _load();
    }
  }

  Future<void> _load() async {
    final auth = AuthScope.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        auth.api.get('/maintenance-tickets', query: {
          'page': 1,
          'pageSize': 50,
          if (_statusFilter != 'ALL') 'status': _statusFilter,
          if (_onlyMine && auth.user != null) 'assignedTo': auth.user!.id,
        }),
        auth.api.get('/machines', query: {'page': 1, 'pageSize': 200}),
      ]);
      final tRes = results[0] as Map<String, dynamic>;
      final mRes = results[1] as Map<String, dynamic>;
      final mList = List<Map<String, dynamic>>.from(mRes['items'] as List? ?? []);
      final mMap = <String, String>{
        for (final m in mList) m['id'] as String: '${m['displayName']} (${m['serialNumber']})',
      };

      if (!mounted) return;
      setState(() {
        _tickets = List<Map<String, dynamic>>.from(tRes['items'] as List? ?? []);
        _machines = mList;
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

  Future<void> _createTicketDialog() async {
    if (_machines.isEmpty) return;
    String selectedMachineId = _machines.first['id'] as String;
    String category = 'DISPENSER';
    String severity = 'HIGH';
    String priority = 'HIGH';
    final descCtrl = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setDialogState) => AlertDialog(
            title: const Text('Tạo phiếu bảo trì mới'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ),
                  DropdownButtonFormField<String>(
                    initialValue: selectedMachineId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Máy cần bảo trì'),
                    items: _machines
                        .map(
                          (m) => DropdownMenuItem<String>(
                            value: m['id'] as String,
                            child: Text('${m['displayName']} (${m['serialNumber']})'),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setDialogState(() => selectedMachineId = v ?? selectedMachineId),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: category,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Nhóm sự cố'),
                    items: const [
                      DropdownMenuItem(value: 'DISPENSER', child: Text('Bộ xịt / Van phun')),
                      DropdownMenuItem(value: 'HARDWARE', child: Text('Phần cứng chung')),
                      DropdownMenuItem(value: 'SENSOR', child: Text('Cảm biến / Đèn nút')),
                      DropdownMenuItem(value: 'NETWORK', child: Text('Mạng / MQTT')),
                      DropdownMenuItem(value: 'POWER', child: Text('Nguồn điện')),
                      DropdownMenuItem(value: 'OTHER', child: Text('Khác')),
                    ],
                    onChanged: (v) => setDialogState(() => category = v ?? category),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: severity,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Mức độ'),
                          items: const [
                            DropdownMenuItem(value: 'CRITICAL', child: Text('Nghiêm trọng', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'HIGH', child: Text('Cao', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'WARNING', child: Text('Cảnh báo', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'INFO', child: Text('Thông tin', overflow: TextOverflow.ellipsis)),
                          ],
                          onChanged: (v) => setDialogState(() => severity = v ?? severity),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: priority,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Ưu tiên'),
                          items: const [
                            DropdownMenuItem(value: 'CRITICAL', child: Text('Khẩn cấp', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'HIGH', child: Text('Cao', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'MEDIUM', child: Text('Trung bình', overflow: TextOverflow.ellipsis)),
                            DropdownMenuItem(value: 'LOW', child: Text('Thấp', overflow: TextOverflow.ellipsis)),
                          ],
                          onChanged: (v) => setDialogState(() => priority = v ?? priority),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: descCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Mô tả sự cố',
                      hintText: 'Mô tả chi tiết tình trạng máy...',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
              FilledButton(
                onPressed: saving
                    ? null
                    : () async {
                        setDialogState(() {
                          saving = true;
                          error = null;
                        });
                        try {
                          await AuthScope.of(context).api.post('/maintenance-tickets', body: {
                            'machineId': selectedMachineId,
                            'category': category,
                            'severity': severity,
                            'priority': priority,
                            if (descCtrl.text.trim().isNotEmpty) 'description': descCtrl.text.trim(),
                          });
                          if (ctx.mounted) Navigator.pop(ctx, true);
                        } on ApiException catch (e) {
                          setDialogState(() {
                            saving = false;
                            error = e.message;
                          });
                        }
                      },
                child: const Text('Tạo phiếu'),
              ),
            ],
          ),
        );
      },
    );

    if (created == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã tạo phiếu bảo trì mới')),
        );
      }
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createTicketDialog,
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Tạo phiếu'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 88),
          children: [
            Row(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final entry in const [
                          ('ALL', 'Tất cả'),
                          ('OPEN', 'Mới mở'),
                          ('ASSIGNED', 'Đã phân công'),
                          ('IN_PROGRESS', 'Đang xử lý'),
                          ('RESOLVED', 'Đã khắc phục'),
                          ('CLOSED', 'Đã đóng'),
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
                ),
              ],
            ),
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Chỉ hiển thị phiếu được giao cho tôi', style: TextStyle(fontSize: 13.5)),
              value: _onlyMine,
              onChanged: (v) {
                setState(() => _onlyMine = v);
                _load();
              },
            ),
            const SizedBox(height: 6),
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
            else if (_tickets.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Center(
                    child: Text(
                      'Không có phiếu bảo trì nào',
                      style: TextStyle(color: AppTheme.textSecondary),
                    ),
                  ),
                ),
              )
            else
              ..._tickets.map((t) {
                final id = t['id'] as String;
                final ticketNumber = t['ticketNumber'] as String? ?? id.substring(0, 8);
                final machineId = t['machineId'] as String?;
                final status = t['status'] as String?;
                final priority = t['priority'] as String?;
                final postTestResult = t['postTestResult'] as String?;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => TicketDetailScreen(
                              ticketId: id,
                              machineName: _machineNames[machineId] ?? machineId ?? '',
                            ),
                          ),
                        );
                        await _load();
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    ticketNumber,
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                  ),
                                ),
                                StatusBadge.fromCode(status, ticketStatusLabel(status)),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Máy: ${_machineNames[machineId] ?? machineId ?? '—'}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              children: [
                                StatusBadge.fromCode(priority, 'Ưu tiên: ${priorityLabel(priority)}'),
                                if (postTestResult != null)
                                  StatusBadge.fromCode(postTestResult, 'Post-test: $postTestResult'),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Nhóm: ${t['category'] ?? '—'}',
                                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                                ),
                                Text(
                                  formatDateTime(t['createdAt'] as String?),
                                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                                ),
                              ],
                            ),
                          ],
                        ),
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
