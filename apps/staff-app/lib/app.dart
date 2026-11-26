import 'package:flutter/material.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/auth_scope.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/inventory/inv_home_screen.dart';
import 'features/operations/ops_home_screen.dart';

class ScentStationStaffApp extends StatefulWidget {
  final AuthController? controller;

  const ScentStationStaffApp({super.key, this.controller});

  @override
  State<ScentStationStaffApp> createState() => _ScentStationStaffAppState();
}

class _ScentStationStaffAppState extends State<ScentStationStaffApp> {
  late final AuthController _auth;

  @override
  void initState() {
    super.initState();
    _auth = widget.controller ?? AuthController();
    if (!_auth.initialized) {
      _auth.init();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: _auth,
      child: AnimatedBuilder(
        animation: _auth,
        builder: (context, _) {
          Widget home;
          if (!_auth.initialized) {
            home = const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          } else if (!_auth.isAuthenticated) {
            home = const LoginScreen();
          } else if (_auth.activeRoleMode == 'INVENTORY_STAFF') {
            home = const InvHomeScreen();
          } else {
            home = const OpsHomeScreen();
          }

          return MaterialApp(
            title: 'ScentStation Staff',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light,
            home: home,
          );
        },
      ),
    );
  }
}
