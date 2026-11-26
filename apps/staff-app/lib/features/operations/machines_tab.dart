import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badge.dart';
import 'machine_detail_screen.dart';

class MachinesTab extends StatefulWidget {
  const MachinesTab({super.key});

  @override
  State<MachinesTab> createState() => _MachinesTabState();
}

class _MachinesTabState extends State<MachinesTab> {
  bool _loading = true;
  String? _error;
  String _modeFilter = 'ALL';
  List<Map<String, dynamic>> _machines = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _machines.isEmpty && _error == null) {
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
      final res = await api.get('/machines', query: {
        'page': 1,
        'pageSize': 100,
        if (_modeFilter != 'ALL') 'operatingMode': _modeFilter,
      }) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _machines = List<Map<String, dynamic>>.from(res['items'] as List? ?? []);
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
                  ('NORMAL', 'Bình thường'),
                  ('DRAINING', 'Đang draining'),
                  ('MAINTENANCE', 'Bảo trì'),
                  ('DISABLED', 'Vô hiệu hóa'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(entry.$2),
                      selected: _modeFilter == entry.$1,
                      onSelected: (_) {
                        setState(() => _modeFilter = entry.$1);
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
          else if (_machines.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Center(
                  child: Text('Không có máy nào', style: TextStyle(color: AppTheme.textSecondary)),
                ),
              ),
            )
          else
            ..._machines.map((m) {
              final id = m['id'] as String;
              final status = m['status'] as String?;
              final mode = m['operatingMode'] as String?;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => MachineDetailScreen(
                            machineId: id,
                            initialTitle: m['displayName'] as String? ?? 'Chi tiết máy',
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
                                  '${m['displayName'] ?? '—'}',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5),
                                ),
                              ),
                              StatusBadge.fromCode(status, machineStatusLabel(status)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Text(
                                'Serial: ${m['serialNumber'] ?? '—'} · ${m['slotCount'] ?? 0} slot',
                                style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              StatusBadge.fromCode(mode, machineModeLabel(mode)),
                              Text(
                                'Online cuối: ${formatDateTime(m['lastSeenAt'] as String?)}',
                                style: const TextStyle(fontSize: 11.5, color: AppTheme.textSecondary),
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
    );
  }
}
