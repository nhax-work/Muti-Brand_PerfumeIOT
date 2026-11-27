import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/reauth_dialog.dart';
import '../../core/widgets/status_badge.dart';

class MachineDetailScreen extends StatefulWidget {
  final String machineId;
  final String initialTitle;

  const MachineDetailScreen({
    super.key,
    required this.machineId,
    required this.initialTitle,
  });

  @override
  State<MachineDetailScreen> createState() => _MachineDetailScreenState();
}

class _MachineDetailScreenState extends State<MachineDetailScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _machine;
  List<Map<String, dynamic>> _slots = [];
  List<Map<String, dynamic>> _events = [];
  List<Map<String, dynamic>> _readings = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _machine == null && _error == null) {
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
        api.get('/machines/${widget.machineId}'),
        api.get('/machines/${widget.machineId}/slots'),
        api.get('/machines/${widget.machineId}/device-events', query: {'page': 1, 'pageSize': 15}),
        api.get('/machines/${widget.machineId}/sensor-readings', query: {'page': 1, 'pageSize': 15}),
      ]);
      if (!mounted) return;
      setState(() {
        _machine = results[0] as Map<String, dynamic>;
        _slots = List<Map<String, dynamic>>.from(results[1] as List? ?? []);
        _events = List<Map<String, dynamic>>.from((results[2] as Map)['items'] as List? ?? []);
        _readings = List<Map<String, dynamic>>.from((results[3] as Map)['items'] as List? ?? []);
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

  Future<void> _changeMode({bool initialForce = false}) async {
    final currentMode = _machine?['operatingMode'] as String? ?? 'NORMAL';
    String selectedMode = initialForce
        ? 'MAINTENANCE'
        : (currentMode == 'DRAINING' ? 'MAINTENANCE' : currentMode);
    bool force = initialForce;
    final reasonCtrl = TextEditingController();

    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final isForceMaint = selectedMode == 'MAINTENANCE' && force;
          return AlertDialog(
            title: const Text('Đổi chế độ hoạt động máy'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedMode,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Chế độ mới'),
                    items: const [
                      DropdownMenuItem(value: 'NORMAL', child: Text('Bình thường (NORMAL)')),
                      DropdownMenuItem(value: 'MAINTENANCE', child: Text('Bảo trì (qua DRAINING)')),
                      DropdownMenuItem(value: 'DISABLED', child: Text('Vô hiệu hóa (DISABLED)')),
                    ],
                    onChanged: (v) => setDialogState(() => selectedMode = v ?? selectedMode),
                  ),
                  if (selectedMode == 'MAINTENANCE') ...[
                    const SizedBox(height: 10),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: force,
                      title: const Text(
                        'Ép bảo trì ngay (Khẩn cấp — FR-MNT-17)',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFFB91C1C)),
                      ),
                      subtitle: const Text(
                        'Ngắt ngay đơn chờ lượt, chuyển FAILED & hoàn tiền. Bắt buộc nhập lý do.',
                        style: TextStyle(fontSize: 11.5),
                      ),
                      onChanged: (v) => setDialogState(() => force = v ?? false),
                    ),
                  ],
                  const SizedBox(height: 10),
                  TextField(
                    controller: reasonCtrl,
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: isForceMaint ? 'Lý do khẩn cấp *' : 'Lý do (tùy chọn)',
                      hintText: 'Nhập lý do đổi chế độ...',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
              FilledButton(
                onPressed: () {
                  if (isForceMaint && reasonCtrl.text.trim().isEmpty) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      const SnackBar(content: Text('Ép bảo trì khẩn cấp bắt buộc nhập lý do')),
                    );
                    return;
                  }
                  Navigator.pop(ctx, {
                    'operatingMode': selectedMode,
                    if (reasonCtrl.text.trim().isNotEmpty) 'reason': reasonCtrl.text.trim(),
                    if (isForceMaint) 'force': true,
                  });
                },
                child: const Text('Tiếp tục'),
              ),
            ],
          );
        },
      ),
    );

    if (payload == null || !mounted) return;
    final reauth = await promptReauthToken(
      context,
      actionDescription: 'Đổi chế độ máy là thao tác nhạy cảm. Vui lòng nhập mật khẩu để xác nhận.',
    );
    if (reauth == null || !mounted) return;

    try {
      await AuthScope.of(context).api.put(
            '/machines/${widget.machineId}/mode',
            body: payload,
            reauthToken: reauth,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã cập nhật chế độ máy')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _pushConfig() async {
    final reauth = await promptReauthToken(
      context,
      actionDescription: 'Đẩy lại cấu hình xuống thiết bị qua MQTT.',
    );
    if (reauth == null || !mounted) return;
    try {
      await AuthScope.of(context).api.post(
            '/machines/${widget.machineId}/config/push',
            reauthToken: reauth,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã gửi lệnh đồng bộ cấu hình tới máy')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _toggleSlot(Map<String, dynamic> slot) async {
    final slotId = slot['id'] as String;
    final slotNo = slot['slotNumber'];
    final currentStatus = slot['status'] as String?;
    final nextEnabled = currentStatus == 'DISABLED';
    final reasonCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(nextEnabled ? 'Bật lại Slot #$slotNo' : 'Tắt tạm thời Slot #$slotNo'),
        content: TextField(
          controller: reasonCtrl,
          decoration: const InputDecoration(labelText: 'Lý do (tùy chọn)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(nextEnabled ? 'Bật slot' : 'Tắt slot'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await AuthScope.of(context).api.put(
        '/slots/$slotId/enabled',
        body: {
          'enabled': nextEnabled,
          if (reasonCtrl.text.trim().isNotEmpty) 'reason': reasonCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(nextEnabled ? 'Đã bật Slot #$slotNo' : 'Đã tắt Slot #$slotNo')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _diagnosticDispense(Map<String, dynamic> slot) async {
    final slotId = slot['id'] as String;
    final slotNo = slot['slotNumber'];
    final noteCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Xịt chẩn đoán Slot #$slotNo (FR-MNT-09)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Gửi lệnh xịt thử kỹ thuật xuống máy (không tính tiền). Lượt xịt thành công vẫn trừ vào dung tích chai.',
              style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              decoration: const InputDecoration(
                labelText: 'Ghi chú kiểm tra',
                hintText: 'VD: Test áp lực vòi sau bảo trì',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xác thực & Xịt thử'),
          ),
        ],
      ),
    );

    if (ok != true || !mounted) return;
    final reauth = await promptReauthToken(
      context,
      actionDescription: 'Xịt chẩn đoán cần xác thực lại mật khẩu.',
    );
    if (reauth == null || !mounted) return;

    try {
      await AuthScope.of(context).api.post(
            '/machines/${widget.machineId}/diagnostic-dispense',
            body: {
              'slotId': slotId,
              if (noteCtrl.text.trim().isNotEmpty) 'note': noteCtrl.text.trim(),
            },
            reauthToken: reauth,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã gửi lệnh xịt chẩn đoán tới Slot #$slotNo')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = _machine;
    final mode = m?['operatingMode'] as String?;
    final status = m?['status'] as String?;

    return Scaffold(
      appBar: AppBar(title: Text(m?['displayName'] as String? ?? widget.initialTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Thử lại')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(14),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${m?['displayName'] ?? ''} (${m?['serialNumber'] ?? ''})',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                    ),
                                  ),
                                  StatusBadge.fromCode(status, machineStatusLabel(status)),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  StatusBadge.fromCode(mode, machineModeLabel(mode)),
                                  const SizedBox(width: 10),
                                  Text(
                                    'Firmware: ${m?['firmwareVersion'] ?? '—'}',
                                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                                  ),
                                ],
                              ),
                              if (m?['nextPeriodicMaintenanceAt'] != null) ...[
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    const Icon(Icons.event_repeat, size: 16, color: AppTheme.primary),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        'Bảo trì định kỳ (${m?['periodicMaintenanceIntervalDays'] ?? 30} ngày/lần): ${formatDateTime(m?['nextPeriodicMaintenanceAt'] as String?)}',
                                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                              const SizedBox(height: 14),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  FilledButton.icon(
                                    onPressed: () => _changeMode(),
                                    icon: const Icon(Icons.tune),
                                    label: const Text('Đổi chế độ'),
                                  ),
                                  if (mode == 'DRAINING' || mode == 'NORMAL')
                                    OutlinedButton.icon(
                                      onPressed: () => _changeMode(initialForce: true),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: const Color(0xFFB91C1C),
                                        side: const BorderSide(color: Color(0xFFFCA5A5)),
                                      ),
                                      icon: const Icon(Icons.emergency_outlined),
                                      label: const Text('Ép bảo trì'),
                                    ),
                                  OutlinedButton.icon(
                                    onPressed: _pushConfig,
                                    icon: const Icon(Icons.cloud_upload_outlined),
                                    label: const Text('Đẩy cấu hình'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Danh sách Slot & Chẩn đoán',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      ..._slots.map((s) {
                        final slotNo = s['slotNumber'];
                        final sStatus = s['status'] as String?;
                        final ml = s['estimatedRemainingMl'];
                        final sprays = s['estimatedRemainingSprays'];
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
                                      Text(
                                        'Slot #$slotNo',
                                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                      ),
                                      StatusBadge.fromCode(sStatus, sStatus ?? '—'),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Còn lại: ${formatMl(ml)} (~${sprays ?? 0} lượt xịt)',
                                    style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: OutlinedButton.icon(
                                          onPressed: () => _toggleSlot(s),
                                          icon: Icon(
                                            sStatus == 'DISABLED'
                                                ? Icons.power_settings_new
                                                : Icons.block,
                                            size: 18,
                                          ),
                                          label: Text(sStatus == 'DISABLED' ? 'Bật slot' : 'Tắt slot'),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: FilledButton.tonalIcon(
                                          onPressed: () => _diagnosticDispense(s),
                                          icon: const Icon(Icons.bolt, size: 18),
                                          label: const Text('Xịt chẩn đoán'),
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
                      const SizedBox(height: 10),
                      Card(
                        child: ExpansionTile(
                          title: Text(
                            'Sự kiện thiết bị gần đây (${_events.length})',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          children: _events.isEmpty
                              ? [
                                  const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: Text('Chưa có sự kiện nào'),
                                  ),
                                ]
                              : _events
                                  .map(
                                    (e) => ListTile(
                                      dense: true,
                                      title: Text('${e['eventType'] ?? e['code'] ?? 'Sự kiện'}'),
                                      subtitle: Text(
                                        '${e['severity'] ?? ''} · ${formatDateTime(e['occurredAt'] as String? ?? e['createdAt'] as String?)}',
                                      ),
                                    ),
                                  )
                                  .toList(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Card(
                        child: ExpansionTile(
                          title: Text(
                            'Dữ liệu cảm biến gần đây (${_readings.length})',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          children: _readings.isEmpty
                              ? [
                                  const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: Text('Chưa có số đo cảm biến nào'),
                                  ),
                                ]
                              : _readings
                                  .map(
                                    (r) => ListTile(
                                      dense: true,
                                      title: Text('${r['readingType'] ?? ''}: ${r['value'] ?? ''} ${r['unit'] ?? ''}'),
                                      subtitle: Text(formatDateTime(r['recordedAt'] as String? ?? r['createdAt'] as String?)),
                                    ),
                                  )
                                  .toList(),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
