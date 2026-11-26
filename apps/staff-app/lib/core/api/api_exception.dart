class ApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;
  final Map<String, dynamic>? details;

  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
  });

  bool get isReauthRequired => statusCode == 403 && code == 'REAUTH_REQUIRED';

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message.isNotEmpty ? message : 'Lỗi API ($statusCode: $code)';
}
