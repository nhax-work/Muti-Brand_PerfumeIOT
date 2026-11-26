import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badge.dart';

class TicketDetailScreen extends StatefulWidget {
  final String ticketId;
  final String machineName;

  const TicketDetailScreen({
    super.key,
    required this.ticketId,
    required this.machineName,
  });

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _ticket;
  List<Map<String, dynamic>> _activities = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _ticket == null && _error == null) {
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
        api.get('/maintenance-tickets/${widget.ticketId}'),
        api.get('/maintenance-tickets/${widget.ticketId}/activities'),
      ]);
      if (!mounted) return;
      setState(() {
        _ticket = results[0] as Map<String, dynamic>;
        _activities = List<Map<String, dynamic>>.from(results[1] as List? ?? []);
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

  Future<void> _takeOver() async {
    final auth = AuthScope.of(context);
    if (auth.user == null) return;
    try {
      await auth.api.post(
        '/maintenance-tickets/${widget.ticketId}/assign',
        body: {'assignedTo': auth.user!.id},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã nhận xử lý phiếu bảo trì')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _openResolveDialog() async {
    final diagCtrl = TextEditingController(text: _ticket?['diagnosis'] as String? ?? '');
    final actionCtrl = TextEditingController(text: _ticket?['correctiveAction'] as String? ?? '');
    final partsCtrl = TextEditingController(
      text: (_ticket?['replacementParts'] as List?)?.join(', ') ?? '',
    );

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setDialogState) => AlertDialog(
            title: const Text('Ghi kết quả xử lý (FR-MNT-10)'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ),
                  TextField(
                    controller: diagCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Chẩn đoán nguyên nhân *',
                      hintText: 'VD: Nghẹt đầu vòi phun slot 2',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: actionCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Biện pháp xử lý *',
                      hintText: 'VD: Thay van phun mới và sục rửa ống dẫn',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: partsCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Linh kiện đã thay (cách nhau dấu phẩy)',
                      hintText: 'VD: Van phun v2, Gioăng cao su',
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
                        if (diagCtrl.text.trim().isEmpty || actionCtrl.text.trim().isEmpty) {
                          setDialogState(() => error = 'Vui lòng nhập đầy đủ chẩn đoán và biện pháp xử lý');
                          return;
                        }
                        setDialogState(() {
                          saving = true;
                          error = null;
                        });
                        try {
                          final parts = partsCtrl.text
                              .split(',')
                              .map((e) => e.trim())
                              .where((e) => e.isNotEmpty)
                              .toList();
                          await AuthScope.of(context).api.post(
                            '/maintenance-tickets/${widget.ticketId}/resolve',
                            body: {
                              'diagnosis': diagCtrl.text.trim(),
                              'correctiveAction': actionCtrl.text.trim(),
                              if (parts.isNotEmpty) 'replacementParts': parts,
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
                child: const Text('Lưu kết quả'),
              ),
            ],
          ),
        );
      },
    );

    if (ok == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã ghi nhận kết quả xử lý')),
        );
      }
      await _load();
    }
  }

  Future<void> _openPostTestDialog() async {
    final checks = [false, false, false, false];
    const labels = [
      '1. Nguồn điện và kết nối MQTT/mạng ổn định',
      '2. Buồng máy khô ráo, cửa máy đóng kín an toàn',
      '3. Đã kiểm tra áp suất & xịt thử chẩn đoán đạt chuẩn',
      '4. Đã vệ sinh đầu vòi xịt và khu vực xung quanh',
    ];
    String result = 'PASS';
    final notesCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            final allChecked = checks.every((c) => c);
            return AlertDialog(
              title: const Text('Checklist sau bảo trì (FR-MNT-11)'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Hoàn tất toàn bộ checklist trước khi cho phép máy trở lại bình thường (FR-MNT-12):',
                      style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    for (int i = 0; i < labels.length; i++)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        value: checks[i],
                        title: Text(labels[i], style: const TextStyle(fontSize: 13)),
                        onChanged: (v) => setDialogState(() => checks[i] = v ?? false),
                      ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: result,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Kết quả kiểm tra'),
                      items: const [
                        DropdownMenuItem(value: 'PASS', child: Text('Đạt (PASS) — Sẵn sàng mở bán')),
                        DropdownMenuItem(value: 'FAIL', child: Text('Không đạt (FAIL) — Tiếp tục sửa')),
                      ],
                      onChanged: (v) => setDialogState(() => result = v ?? 'PASS'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: notesCtrl,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Ghi chú kiểm tra (tùy chọn)'),
                    ),
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
                  onPressed: (!allChecked || saving)
                      ? null
                      : () async {
                          setDialogState(() {
                            saving = true;
                            error = null;
                          });
                          try {
                            await AuthScope.of(context).api.post(
                              '/maintenance-tickets/${widget.ticketId}/post-test',
                              body: {
                                'checklistCompleted': true,
                                'result': result,
                                if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
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
                  child: const Text('Gửi kết quả'),
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
          const SnackBar(content: Text('Đã hoàn tất checklist sau bảo trì')),
        );
      }
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _ticket;
    final status = t?['status'] as String?;
    final currentUserId = AuthScope.of(context).user?.id;
    final assignedTo = t?['assignedTo'] as String?;
    final canPostTest = t?['diagnosis'] != null && status != 'CLOSED';

    return Scaffold(
      appBar: AppBar(title: Text(t?['ticketNumber'] as String? ?? 'Chi tiết phiếu bảo trì')),
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
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    t?['ticketNumber'] as String? ?? '—',
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                                  ),
                                  StatusBadge.fromCode(status, ticketStatusLabel(status)),
                                ],
                              ),
                              const SizedBox(height: 12),
                              _InfoRow('Máy', widget.machineName),
                              _InfoRow('Nhóm sự cố', t?['category'] as String? ?? '—'),
                              _InfoRow('Mức độ', severityLabel(t?['severity'] as String?)),
                              _InfoRow('Ưu tiên', priorityLabel(t?['priority'] as String?)),
                              _InfoRow('Tạo lúc', formatDateTime(t?['createdAt'] as String?)),
                              _InfoRow('Hạn xử lý', formatDateTime(t?['dueAt'] as String?)),
                              if (t?['diagnosis'] != null)
                                _InfoRow('Chẩn đoán', t!['diagnosis'] as String),
                              if (t?['correctiveAction'] != null)
                                _InfoRow('Biện pháp', t!['correctiveAction'] as String),
                              if (t?['replacementParts'] is List &&
                                  (t!['replacementParts'] as List).isNotEmpty)
                                _InfoRow(
                                  'Linh kiện thay',
                                  (t['replacementParts'] as List).join(', '),
                                ),
                              if (t?['postTestResult'] != null)
                                _InfoRow('Post-test', t!['postTestResult'] as String),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (status != 'CLOSED')
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  'Thao tác xử lý bảo trì',
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                                ),
                                const SizedBox(height: 10),
                                if (assignedTo != currentUserId)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: OutlinedButton.icon(
                                      onPressed: _takeOver,
                                      icon: const Icon(Icons.assignment_ind_outlined),
                                      label: const Text('Nhận xử lý phiếu này'),
                                    ),
                                  ),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: FilledButton.icon(
                                    onPressed: _openResolveDialog,
                                    icon: const Icon(Icons.build_circle_outlined),
                                    label: const Text('Ghi kết quả xử lý (FR-MNT-10)'),
                                  ),
                                ),
                                FilledButton.tonalIcon(
                                  onPressed: canPostTest ? _openPostTestDialog : null,
                                  icon: const Icon(Icons.fact_check_outlined),
                                  label: Text(
                                    canPostTest
                                        ? 'Checklist kiểm tra sau bảo trì (FR-MNT-11)'
                                        : 'Cần ghi kết quả xử lý trước khi Post-test',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Nhật ký hoạt động (FR-MNT-14)',
                                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                              ),
                              const SizedBox(height: 10),
                              if (_activities.isEmpty)
                                const Text(
                                  'Chưa có hoạt động nào',
                                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                                )
                              else
                                ..._activities.map(
                                  (act) => Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Icon(Icons.circle, size: 8, color: AppTheme.primary),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                '${act['activityType'] ?? ''}${act['toStatus'] != null ? ' → ${ticketStatusLabel(act['toStatus'] as String?)}' : ''}',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              if (act['notes'] != null &&
                                                  (act['notes'] as String).isNotEmpty)
                                                Text(
                                                  act['notes'] as String,
                                                  style: const TextStyle(
                                                    fontSize: 12.5,
                                                    color: AppTheme.textSecondary,
                                                  ),
                                                ),
                                              Text(
                                                formatDateTime(act['createdAt'] as String?),
                                                style: const TextStyle(
                                                  fontSize: 11.5,
                                                  color: AppTheme.textSecondary,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
