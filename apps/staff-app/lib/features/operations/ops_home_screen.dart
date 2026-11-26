import 'package:flutter/material.dart';
import '../auth/profile_tab.dart';
import 'alerts_tab.dart';
import 'machines_tab.dart';
import 'tickets_tab.dart';

class OpsHomeScreen extends StatefulWidget {
  const OpsHomeScreen({super.key});

  @override
  State<OpsHomeScreen> createState() => _OpsHomeScreenState();
}

class _OpsHomeScreenState extends State<OpsHomeScreen> {
  int _index = 0;

  static const _titles = [
    'Cảnh báo vận hành',
    'Phiếu bảo trì',
    'Máy & Chẩn đoán',
    'Tài khoản',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
      ),
      body: IndexedStack(
        index: _index,
        children: const [
          AlertsTab(),
          TicketsTab(),
          MachinesTab(),
          ProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.notifications_active_outlined),
            selectedIcon: Icon(Icons.notifications_active),
            label: 'Cảnh báo',
          ),
          NavigationDestination(
            icon: Icon(Icons.build_outlined),
            selectedIcon: Icon(Icons.build),
            label: 'Bảo trì',
          ),
          NavigationDestination(
            icon: Icon(Icons.precision_manufacturing_outlined),
            selectedIcon: Icon(Icons.precision_manufacturing),
            label: 'Máy & Slot',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Tài khoản',
          ),
        ],
      ),
    );
  }
}
