import 'package:flutter/material.dart';
import '../api/api_exception.dart';
import '../auth/auth_scope.dart';

/// Hộp thoại xác thực lại mật khẩu theo FR-AUTH-09 để lấy `X-Reauth-Token` cho thao tác nhạy cảm.
Future<String?> promptReauthToken(BuildContext context, {String? actionDescription}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _ReauthDialog(actionDescription: actionDescription),
  );
}

class _ReauthDialog extends StatefulWidget {
  final String? actionDescription;

  const _ReauthDialog({this.actionDescription});

  @override
  State<_ReauthDialog> createState() => _ReauthDialogState();
}

class _ReauthDialogState extends State<_ReauthDialog> {
  final _controller = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final pwd = _controller.text;
    if (pwd.isEmpty) {
      setState(() => _error = 'Vui lòng nhập mật khẩu');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final token = await AuthScope.of(context).reauthenticate(pwd);
      if (mounted) Navigator.of(context).pop(token);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = e.message;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.verified_user_outlined, color: Color(0xFFB45309)),
          SizedBox(width: 8),
          Expanded(child: Text('Xác thực lại (FR-AUTH-09)')),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.actionDescription ??
                'Thao tác nhạy cảm yêu cầu nhập lại mật khẩu tài khoản hiện tại để tiếp tục.',
            style: const TextStyle(fontSize: 13.5, color: Color(0xFF475569)),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            obscureText: _obscure,
            autofocus: true,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Mật khẩu của bạn',
              errorText: _error,
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(null),
          child: const Text('Hủy'),
        ),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Xác nhận'),
        ),
      ],
    );
  }
}
