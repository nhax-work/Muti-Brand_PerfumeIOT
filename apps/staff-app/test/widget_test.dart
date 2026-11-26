import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scentstation_staff/app.dart';
import 'package:scentstation_staff/core/auth/auth_controller.dart';
import 'package:scentstation_staff/core/utils/formatters.dart';
import 'package:scentstation_staff/core/widgets/sales_stops_banner.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Hiển thị màn hình đăng nhập khi chưa xác thực', (tester) async {
    final controller = AuthController();
    await controller.init();

    await tester.pumpWidget(ScentStationStaffApp(controller: controller));
    await tester.pumpAndSettle();

    expect(find.text('ScentStation Staff'), findsOneWidget);
    expect(find.text('Đăng nhập nhân viên'), findsOneWidget);
    expect(find.text('Đăng nhập'), findsOneWidget);
  });

  testWidgets('Đăng nhập Operations Staff chuyển sang OpsHomeScreen', (tester) async {
    final mockHttp = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(
          '{"accessToken":"acc-1","refreshToken":"ref-1"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/auth/me')) {
        return http.Response(
          '{"id":"u-ops","email":"ops@scentstation.local","fullName":"Trần Vận Hành","brandId":null,"roles":["OPERATIONS_STAFF"],"permissions":["machine.view","machine.operate","maintenance.handle","alert.handle","dispense.diagnostic"],"mustChangePassword":false,"emailVerificationPending":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/alerts') ||
          req.url.path.endsWith('/machine-sales-stops') ||
          req.url.path.endsWith('/machines') ||
          req.url.path.endsWith('/maintenance-tickets')) {
        return http.Response('{"items":[]}', 200, headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 200);
    });

    final controller = AuthController(httpClient: mockHttp);
    await controller.init();
    final ok = await controller.login('ops@scentstation.local', 'DevPassword123!');
    expect(ok, isTrue);

    await tester.pumpWidget(ScentStationStaffApp(controller: controller));
    await tester.pumpAndSettle();

    expect(find.text('Cảnh báo vận hành'), findsOneWidget);
    expect(find.text('Bảo trì'), findsOneWidget);
    expect(find.text('Máy & Slot'), findsOneWidget);
  });

  testWidgets('Đăng nhập Inventory Staff chuyển sang InvHomeScreen', (tester) async {
    final mockHttp = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(
          '{"accessToken":"acc-2","refreshToken":"ref-2"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/auth/me')) {
        return http.Response(
          '{"id":"u-inv","email":"inventory@scentstation.local","fullName":"Lê Thủ Kho","brandId":null,"roles":["INVENTORY_STAFF"],"permissions":["inventory.manage","inventory.adjust","refill.fulfill","machine.view"],"mustChangePassword":false,"emailVerificationPending":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path.endsWith('/refill-worklist') ||
          req.url.path.endsWith('/refill-sessions') ||
          req.url.path.endsWith('/machine-sales-stops') ||
          req.url.path.endsWith('/machines') ||
          req.url.path.endsWith('/refill-requests') ||
          req.url.path.endsWith('/shipment-declarations') ||
          req.url.path.endsWith('/inventory-batches') ||
          req.url.path.endsWith('/bottles')) {
        return http.Response('{"items":[]}', 200, headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 200);
    });

    final controller = AuthController(httpClient: mockHttp);
    await controller.init();
    final ok = await controller.login('inventory@scentstation.local', 'DevPassword123!');
    expect(ok, isTrue);

    await tester.pumpWidget(ScentStationStaffApp(controller: controller));
    await tester.pumpAndSettle();

    expect(find.text('Việc cần nạp & Phiếu nạp'), findsOneWidget);
    expect(find.text('Yêu cầu'), findsOneWidget);
    expect(find.text('Tiếp nhận'), findsOneWidget);
    expect(find.text('Kho chai'), findsOneWidget);
  });

  testWidgets('SalesStopsBanner hiển thị thông tin máy dừng bán', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SalesStopsBanner(
            items: [
              SalesStopItem(
                machineId: 'm-1',
                machineName: 'Máy Vincom #1',
                serialNumber: 'M001',
                locationName: 'Vincom',
                reason: 'REFILL_SESSION',
                refillSlotNumber: 2,
                refillPerformedByName: 'Lê Thủ Kho',
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.textContaining('1 máy đang dừng bán'), findsOneWidget);
    expect(find.textContaining('Slot #2'), findsOneWidget);
  });

  test('Formatters trả về nhãn tiếng Việt chuẩn', () {
    expect(formatMl(50), '50 ml');
    expect(formatMl(12.5), '12.5 ml');
    expect(roleLabel('OPERATIONS_STAFF'), 'Nhân viên Vận hành & Bảo trì');
    expect(roleLabel('INVENTORY_STAFF'), 'Nhân viên Kho & Nạp nước hoa');
    expect(refillBlockerLabel('DOCS_NOT_APPROVED'), 'Lô hàng chưa được duyệt giấy tờ chính hãng');
  });
}
