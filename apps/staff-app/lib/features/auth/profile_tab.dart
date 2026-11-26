import 'package:flutter/material.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_scope.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  Future<void> _showChangePassword(BuildContext context) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        bool saving = false;
        String? error;
        return StatefulBuilder(
          builder: (ctx, setState) => AlertDialog(
            title: const Text('Đổi mật khẩu'),
            content: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ),
                  TextFormField(
                    controller: currentCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Mật khẩu hiện tại'),
                    validator: (v) => (v == null || v.isEmpty) ? 'Bắt buộc nhập' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: newCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Mật khẩu mới (tối thiểu 8 ký tự)'),
                    validator: (v) => (v == null || v.length < 8) ? 'Tối thiểu 8 ký tự' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: confirmCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Nhập lại mật khẩu mới'),
                    validator: (v) => v != newCtrl.text ? 'Mật khẩu không khớp' : null,
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
              FilledButton(
                onPressed: saving
                    ? null
                    : () async {
                        if (!(formKey.currentState?.validate() ?? false)) return;
                        setState(() {
                          saving = true;
                          error = null;
                        });
                        try {
                          await AuthScope.of(context).changePassword(
                            currentCtrl.text,
                            newCtrl.text,
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Đã đổi mật khẩu thành công')),
                            );
                          }
                        } on ApiException catch (e) {
                          setState(() {
                            saving = false;
                            error = e.message;
                          });
                        }
                      },
                child: const Text('Lưu'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _editServerUrl(BuildContext context) async {
    final auth = AuthScope.of(context);
    final ctrl = TextEditingController(text: auth.baseUrl);
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Địa chỉ máy chủ API'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'API Base URL'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Lưu')),
        ],
      ),
    );
    if (next != null && next.trim().isNotEmpty) {
      await auth.setBaseUrl(next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();

    final canSwitchWorkspace =
        user.isSuperAdmin || (user.isOperationsStaff && user.isInventoryStaff);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppTheme.primary,
                  child: Text(
                    user.fullName.isNotEmpty ? user.fullName[0].toUpperCase() : 'S',
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(user.email, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: user.roles
                            .map(
                              (r) => Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.accent.withValues(alpha: 0.16),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Text(
                                  roleLabel(r),
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.primary,
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (canSwitchWorkspace) ...[
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Chuyển không gian làm việc',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 10),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                        value: 'OPERATIONS_STAFF',
                        icon: Icon(Icons.build_outlined),
                        label: Text('Vận hành & Bảo trì'),
                      ),
                      ButtonSegment(
                        value: 'INVENTORY_STAFF',
                        icon: Icon(Icons.inventory_2_outlined),
                        label: Text('Kho & Nạp nước hoa'),
                      ),
                    ],
                    selected: {auth.activeRoleMode},
                    onSelectionChanged: (set) => auth.setActiveRoleMode(set.first),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.lock_reset_outlined),
                title: const Text('Đổi mật khẩu'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _showChangePassword(context),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.dns_outlined),
                title: const Text('Địa chỉ máy chủ API'),
                subtitle: Text(auth.baseUrl, style: const TextStyle(fontSize: 12)),
                trailing: const Icon(Icons.edit_outlined, size: 18),
                onTap: () => _editServerUrl(context),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () => auth.logout(),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFB91C1C),
            side: const BorderSide(color: Color(0xFFFCA5A5)),
          ),
          icon: const Icon(Icons.logout),
          label: const Text('Đăng xuất'),
        ),
      ],
    );
  }
}
