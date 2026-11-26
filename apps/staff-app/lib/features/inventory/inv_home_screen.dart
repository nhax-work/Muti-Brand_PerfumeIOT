import 'package:flutter/material.dart';
import '../auth/profile_tab.dart';
import 'bottles_tab.dart';
import 'refill_requests_tab.dart';
import 'refill_worklist_tab.dart';
import 'shipments_tab.dart';

class InvHomeScreen extends StatefulWidget {
  const InvHomeScreen({super.key});

  @override
  State<InvHomeScreen> createState() => _InvHomeScreenState();
}

class _InvHomeScreenState extends State<InvHomeScreen> {
  int _index = 0;

  static const _titles = [
    'Việc cần nạp & Phiếu nạp',
    'Yêu cầu bổ sung',
    'Tiếp nhận & Lô hàng',
    'Kho chai nước hoa',
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
          RefillWorklistTab(),
          RefillRequestsTab(),
          ShipmentsTab(),
          BottlesTab(),
          ProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.water_drop_outlined),
            selectedIcon: Icon(Icons.water_drop),
            label: 'Việc nạp',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Yêu cầu',
          ),
          NavigationDestination(
            icon: Icon(Icons.move_to_inbox_outlined),
            selectedIcon: Icon(Icons.move_to_inbox),
            label: 'Tiếp nhận',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Kho chai',
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
