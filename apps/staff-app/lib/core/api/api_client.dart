import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_exception.dart';

typedef TokenGetter = String? Function();
typedef RefreshCallback = Future<bool> Function();
typedef ReauthPromptCallback = Future<String?> Function();

class ApiClient {
  String baseUrl;
  final TokenGetter getAccessToken;
  final RefreshCallback onRefreshToken;
  final ReauthPromptCallback? onRequestReauth;
  final http.Client _http;

  ApiClient({
    required this.baseUrl,
    required this.getAccessToken,
    required this.onRefreshToken,
    this.onRequestReauth,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  Uri _buildUri(String path, [Map<String, dynamic>? query]) {
    final cleanBase = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$cleanBase$cleanPath');
    if (query == null || query.isEmpty) return uri;
    final qp = <String, String>{};
    query.forEach((key, value) {
      if (value != null && value.toString().isNotEmpty) {
        qp[key] = value.toString();
      }
    });
    return uri.replace(queryParameters: qp.isEmpty ? null : qp);
  }

  String resolveMediaUrl(String url) {
    final base = Uri.parse(baseUrl);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      final parsed = Uri.parse(url);
      if ((parsed.host == 'localhost' || parsed.host == '127.0.0.1') && base.host != parsed.host) {
        return parsed.replace(scheme: base.scheme, host: base.host, port: base.port).toString();
      }
      return url;
    }
    final origin = '${base.scheme}://${base.authority}';
    final clean = url.startsWith('/') ? url : '/$url';
    return '$origin$clean';
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) {
    return _send('GET', path, query: query);
  }

  Future<dynamic> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? reauthToken,
    bool autoReauth = false,
  }) {
    return _send(
      'POST',
      path,
      body: body,
      query: query,
      reauthToken: reauthToken,
      autoReauth: autoReauth,
    );
  }

  Future<dynamic> put(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? reauthToken,
    bool autoReauth = false,
  }) {
    return _send(
      'PUT',
      path,
      body: body,
      query: query,
      reauthToken: reauthToken,
      autoReauth: autoReauth,
    );
  }

  Future<dynamic> delete(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? reauthToken,
    bool autoReauth = false,
  }) {
    return _send(
      'DELETE',
      path,
      body: body,
      query: query,
      reauthToken: reauthToken,
      autoReauth: autoReauth,
    );
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? reauthToken,
    bool autoReauth = false,
    bool retriedRefresh = false,
    bool retriedReauth = false,
  }) async {
    final uri = _buildUri(path, query);
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
    };
    final token = getAccessToken();
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (reauthToken != null && reauthToken.isNotEmpty) {
      headers['X-Reauth-Token'] = reauthToken;
    }

    final encodedBody = body != null ? jsonEncode(body) : null;
    late final http.Response res;

    try {
      switch (method) {
        case 'GET':
          res = await _http.get(uri, headers: headers);
        case 'POST':
          res = await _http.post(uri, headers: headers, body: encodedBody);
        case 'PUT':
          res = await _http.put(uri, headers: headers, body: encodedBody);
        case 'DELETE':
          res = await _http.delete(uri, headers: headers, body: encodedBody);
        default:
          throw UnsupportedError('HTTP method $method');
      }
    } catch (e) {
      throw ApiException(
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối tới máy chủ ($uri). Vui lòng kiểm tra mạng hoặc API URL.',
      );
    }

    if (res.statusCode == 401 && !retriedRefresh && path != '/auth/login' && path != '/auth/refresh') {
      final refreshed = await onRefreshToken();
      if (refreshed) {
        return _send(
          method,
          path,
          body: body,
          query: query,
          reauthToken: reauthToken,
          autoReauth: autoReauth,
          retriedRefresh: true,
          retriedReauth: retriedReauth,
        );
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }

    Map<String, dynamic>? errorJson;
    try {
      final parsed = jsonDecode(res.body);
      if (parsed is Map<String, dynamic>) errorJson = parsed;
    } catch (_) {}

    final code = errorJson?['code'] as String? ?? 'HTTP_${res.statusCode}';
    final message = errorJson?['message'] as String? ?? 'Yêu cầu thất bại (${res.statusCode})';
    final details = errorJson?['details'] as Map<String, dynamic>?;

    if (res.statusCode == 403 &&
        code == 'REAUTH_REQUIRED' &&
        autoReauth &&
        !retriedReauth &&
        onRequestReauth != null) {
      final newReauth = await onRequestReauth!();
      if (newReauth != null && newReauth.isNotEmpty) {
        return _send(
          method,
          path,
          body: body,
          query: query,
          reauthToken: newReauth,
          autoReauth: autoReauth,
          retriedRefresh: retriedRefresh,
          retriedReauth: true,
        );
      }
    }

    throw ApiException(
      statusCode: res.statusCode,
      code: code,
      message: message,
      details: details,
    );
  }

  Future<dynamic> uploadFile(
    String path, {
    required String fieldName,
    required List<int> bytes,
    required String filename,
    Map<String, dynamic>? query,
    bool retriedRefresh = false,
  }) async {
    final uri = _buildUri(path, query);
    final req = http.MultipartRequest('POST', uri);
    req.headers['Accept'] = 'application/json';
    final token = getAccessToken();
    if (token != null && token.isNotEmpty) {
      req.headers['Authorization'] = 'Bearer $token';
    }
    req.files.add(http.MultipartFile.fromBytes(fieldName, bytes, filename: filename));

    late final http.Response res;
    try {
      final streamed = await _http.send(req);
      res = await http.Response.fromStream(streamed);
    } catch (e) {
      throw ApiException(
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối tới máy chủ ($uri). Vui lòng kiểm tra mạng hoặc API URL.',
      );
    }

    if (res.statusCode == 401 && !retriedRefresh && path != '/auth/login' && path != '/auth/refresh') {
      final refreshed = await onRefreshToken();
      if (refreshed) {
        return uploadFile(
          path,
          fieldName: fieldName,
          bytes: bytes,
          filename: filename,
          query: query,
          retriedRefresh: true,
        );
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }

    Map<String, dynamic>? errorJson;
    try {
      final parsed = jsonDecode(res.body);
      if (parsed is Map<String, dynamic>) errorJson = parsed;
    } catch (_) {}

    throw ApiException(
      statusCode: res.statusCode,
      code: errorJson?['code'] as String? ?? 'HTTP_${res.statusCode}',
      message: errorJson?['message'] as String? ?? 'Tải tệp thất bại (${res.statusCode})',
      details: errorJson?['details'] as Map<String, dynamic>?,
    );
  }
}
