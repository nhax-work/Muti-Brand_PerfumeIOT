import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';
import 'auth_models.dart';

class AuthController extends ChangeNotifier {
  static const _keyAccess = 'scent_access_token';
  static const _keyRefresh = 'scent_refresh_token';
  static const _keyBaseUrl = 'scent_api_base_url';

  String? _accessToken;
  String? _refreshToken;
  CurrentUser? _user;
  bool _initialized = false;
  bool _loading = false;
  String? _error;
  String _activeRoleMode = 'OPERATIONS_STAFF';

  late final ApiClient api;

  AuthController({http.Client? httpClient}) {
    api = ApiClient(
      baseUrl: defaultBaseUrl(),
      getAccessToken: () => _accessToken,
      onRefreshToken: refreshTokens,
      httpClient: httpClient,
    );
  }

  static String defaultBaseUrl() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/api/v1';
    }
    return 'http://localhost:3000/api/v1';
  }

  CurrentUser? get user => _user;
  bool get isAuthenticated => _user != null && _accessToken != null;
  bool get initialized => _initialized;
  bool get loading => _loading;
  String? get error => _error;
  String get baseUrl => api.baseUrl;
  String get activeRoleMode => _activeRoleMode;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_keyBaseUrl);
    if (savedUrl != null && savedUrl.isNotEmpty) {
      api.baseUrl = savedUrl;
    }
    _accessToken = prefs.getString(_keyAccess);
    _refreshToken = prefs.getString(_keyRefresh);

    if (_accessToken != null) {
      try {
        await fetchMe();
      } catch (_) {
        await _clearSession();
      }
    }
    _initialized = true;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return;
    api.baseUrl = trimmed;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyBaseUrl, trimmed);
    notifyListeners();
  }

  void setActiveRoleMode(String role) {
    _activeRoleMode = role;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await api.post(
        '/auth/login',
        body: {'email': email.trim(), 'password': password},
      );
      final pair = TokenPair.fromJson(data as Map<String, dynamic>);
      _accessToken = pair.accessToken;
      _refreshToken = pair.refreshToken;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_keyAccess, pair.accessToken);
      await prefs.setString(_keyRefresh, pair.refreshToken);

      await fetchMe();
      if (_user != null && !_user!.isStaffSupported) {
        await _clearSession();
        _error = 'Ứng dụng này chỉ dành cho Operations Staff và Inventory Staff.';
        _loading = false;
        notifyListeners();
        return false;
      }

      if (_user != null) {
        if (_user!.isInventoryStaff && !_user!.isOperationsStaff) {
          _activeRoleMode = 'INVENTORY_STAFF';
        } else {
          _activeRoleMode = 'OPERATIONS_STAFF';
        }
      }

      _loading = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      await _clearSession();
      _error = e.message;
      _loading = false;
      notifyListeners();
      return false;
    } catch (e) {
      await _clearSession();
      _error = e.toString();
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> fetchMe() async {
    final data = await api.get('/auth/me');
    _user = CurrentUser.fromJson(data as Map<String, dynamic>);
  }

  Future<bool> refreshTokens() async {
    if (_refreshToken == null || _refreshToken!.isEmpty) return false;
    try {
      final data = await api.post(
        '/auth/refresh',
        body: {'refreshToken': _refreshToken},
      );
      final pair = TokenPair.fromJson(data as Map<String, dynamic>);
      _accessToken = pair.accessToken;
      _refreshToken = pair.refreshToken;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_keyAccess, pair.accessToken);
      await prefs.setString(_keyRefresh, pair.refreshToken);
      return true;
    } catch (_) {
      await _clearSession();
      notifyListeners();
      return false;
    }
  }

  Future<String> reauthenticate(String password) async {
    final data = await api.post('/auth/reauth', body: {'password': password});
    final res = ReauthResult.fromJson(data as Map<String, dynamic>);
    return res.reauthToken;
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await api.post(
      '/auth/change-password',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    await fetchMe();
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      if (_accessToken != null) {
        await api.post('/auth/logout');
      }
    } catch (_) {
      // Ignore network errors when logging out
    } finally {
      await _clearSession();
      notifyListeners();
    }
  }

  Future<void> _clearSession() async {
    _accessToken = null;
    _refreshToken = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyAccess);
    await prefs.remove(_keyRefresh);
  }
}
