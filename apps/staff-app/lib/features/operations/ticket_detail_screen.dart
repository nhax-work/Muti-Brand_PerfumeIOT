import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
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
  bool _uploadingPhoto = false;
  String? _error;
  Map<String, dynamic>? _ticket;
  List<Map<String, dynamic>> _activities = [];
  final ImagePicker _picker = ImagePicker();

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

  Future<void> _startTicket() async {
    try {
      await AuthScope.of(context).api.post('/maintenance-tickets/${widget.ticketId}/start');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã mở phiếu bảo trì — máy đã chuyển sang chế độ bảo trì'),
        ),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _uploadPendingPhotos(List<_PendingPhoto> photos, String notes) async {
    if (photos.isEmpty) return;
    final api = AuthScope.of(context).api;
    for (final p in photos) {
      await api.uploadFile(
        '/maintenance-tickets/${widget.ticketId}/evidence',
        fieldName: 'file',
        bytes: p.bytes,
        filename: p.name,
        query: {'notes': notes},
      );
    }
  }

  Future<void> _pickAndUploadSingleEvidence() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Chụp ảnh mới'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Chọn ảnh từ thư viện'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final picked = await _picker.pickImage(source: source, imageQuality: 85, maxWidth: 1600);
    if (picked == null || !mounted) return;
    final bytes = await picked.readAsBytes();
    if (!mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      await AuthScope.of(context).api.uploadFile(
        '/maintenance-tickets/${widget.ticketId}/evidence',
        fieldName: 'file',
        bytes: bytes,
        filename: picked.name,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã tải lên ảnh bằng chứng bảo trì')),
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red.shade700),
      );
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  void _showImagePreview(String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: Stack(
          children: [
            InteractiveViewer(
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Không thể tải ảnh bằng chứng'),
                ),
              ),
            ),
            Positioned(
              top: 6,
              right: 6,
              child: IconButton.filledTonal(
                onPressed: () => Navigator.pop(ctx),
                icon: const Icon(Icons.close),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openResolveDialog() async {
    final diagCtrl = TextEditingController(text: _ticket?['diagnosis'] as String? ?? '');
    final actionCtrl = TextEditingController(text: _ticket?['correctiveAction'] as String? ?? '');
    final partsCtrl = TextEditingController(
      text: (_ticket?['replacementParts'] as List?)?.join(', ') ?? '',
    );
    final pendingPhotos = <_PendingPhoto>[];

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
                  const SizedBox(height: 12),
                  _PhotoPickerSection(
                    label: 'Ảnh bằng chứng xử lý (tùy chọn)',
                    photos: pendingPhotos,
                    picker: _picker,
                    onChanged: () => setDialogState(() {}),
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
                          await _uploadPendingPhotos(
                            pendingPhotos,
                            'Ảnh bằng chứng xử lý bảo trì',
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
    final pendingPhotos = <_PendingPhoto>[];

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
                    const SizedBox(height: 12),
                    _PhotoPickerSection(
                      label: 'Ảnh bằng chứng hoàn thành (tùy chọn)',
                      photos: pendingPhotos,
                      picker: _picker,
                      onChanged: () => setDialogState(() {}),
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
                            await _uploadPendingPhotos(
                              pendingPhotos,
                              'Ảnh bằng chứng kiểm tra sau bảo trì',
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
                                if (status == 'OPEN' || status == 'ASSIGNED' || status == 'REOPENED')
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: FilledButton.icon(
                                      onPressed: _startTicket,
                                      icon: const Icon(Icons.play_arrow),
                                      label: const Text('Mở phiếu bảo trì'),
                                    ),
                                  ),
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
                                const SizedBox(height: 8),
                                OutlinedButton.icon(
                                  onPressed: _uploadingPhoto ? null : _pickAndUploadSingleEvidence,
                                  icon: _uploadingPhoto
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Icon(Icons.add_a_photo_outlined),
                                  label: Text(
                                    _uploadingPhoto
                                        ? 'Đang tải ảnh bằng chứng...'
                                        : 'Chụp / Tải ảnh bằng chứng',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      _buildEvidenceCard(context),
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
                                              if (act['attachments'] is List &&
                                                  (act['attachments'] as List).isNotEmpty)
                                                Padding(
                                                  padding: const EdgeInsets.only(top: 6, bottom: 4),
                                                  child: Wrap(
                                                    spacing: 8,
                                                    runSpacing: 8,
                                                    children: [
                                                      for (final att in (act['attachments'] as List))
                                                        if (att is Map && att['url'] is String)
                                                          GestureDetector(
                                                            onTap: () => _showImagePreview(
                                                              AuthScope.of(context)
                                                                  .api
                                                                  .resolveMediaUrl(att['url'] as String),
                                                            ),
                                                            child: ClipRRect(
                                                              borderRadius: BorderRadius.circular(6),
                                                              child: Image.network(
                                                                AuthScope.of(context)
                                                                    .api
                                                                    .resolveMediaUrl(att['url'] as String),
                                                                width: 64,
                                                                height: 64,
                                                                fit: BoxFit.cover,
                                                                errorBuilder: (_, _, _) =>
                                                                    Container(
                                                                  width: 64,
                                                                  height: 64,
                                                                  color: Colors.grey.shade200,
                                                                  child: const Icon(
                                                                    Icons.broken_image_outlined,
                                                                    size: 20,
                                                                  ),
                                                                ),
                                                              ),
                                                            ),
                                                          ),
                                                    ],
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

  Widget _buildEvidenceCard(BuildContext context) {
    final api = AuthScope.of(context).api;
    final urls = <String>[];
    for (final act in _activities) {
      final atts = act['attachments'];
      if (atts is List) {
        for (final att in atts) {
          if (att is Map && att['url'] is String) {
            urls.add(api.resolveMediaUrl(att['url'] as String));
          }
        }
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Bằng chứng hình ảnh',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
            ),
            const SizedBox(height: 10),
            if (urls.isEmpty)
              const Text(
                'Chưa có ảnh bằng chứng nào',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final url in urls)
                    GestureDetector(
                      onTap: () => _showImagePreview(url),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          url,
                          width: 84,
                          height: 84,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(
                            width: 84,
                            height: 84,
                            color: Colors.grey.shade200,
                            child: const Icon(Icons.broken_image_outlined),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _PendingPhoto {
  final String name;
  final Uint8List bytes;

  _PendingPhoto({required this.name, required this.bytes});
}

class _PhotoPickerSection extends StatelessWidget {
  final String label;
  final List<_PendingPhoto> photos;
  final ImagePicker picker;
  final VoidCallback onChanged;

  const _PhotoPickerSection({
    required this.label,
    required this.photos,
    required this.picker,
    required this.onChanged,
  });

  Future<void> _pick(ImageSource source) async {
    final picked = await picker.pickImage(source: source, imageQuality: 85, maxWidth: 1600);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    photos.add(_PendingPhoto(name: picked.name, bytes: bytes));
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: photos.length >= 5 ? null : () => _pick(ImageSource.camera),
              icon: const Icon(Icons.camera_alt_outlined, size: 18),
              label: const Text('Chụp ảnh'),
            ),
            OutlinedButton.icon(
              onPressed: photos.length >= 5 ? null : () => _pick(ImageSource.gallery),
              icon: const Icon(Icons.photo_library_outlined, size: 18),
              label: const Text('Thư viện'),
            ),
          ],
        ),
        if (photos.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (int idx = 0; idx < photos.length; idx++)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.memory(
                        photos[idx].bytes,
                        width: 72,
                        height: 72,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Positioned(
                      top: 2,
                      right: 2,
                      child: GestureDetector(
                        onTap: () {
                          photos.removeAt(idx);
                          onChanged();
                        },
                        child: Container(
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          padding: const EdgeInsets.all(2),
                          child: const Icon(Icons.close, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ],
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
