class CurrentUser {
  final String id;
  final String email;
  final String fullName;
  final String? brandId;
  final List<String> roles;
  final List<String> permissions;
  final bool mustChangePassword;
  final bool emailVerificationPending;

  const CurrentUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.brandId,
    required this.roles,
    required this.permissions,
    required this.mustChangePassword,
    required this.emailVerificationPending,
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    return CurrentUser(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: json['fullName'] as String,
      brandId: json['brandId'] as String?,
      roles: List<String>.from(json['roles'] as List? ?? const []),
      permissions: List<String>.from(json['permissions'] as List? ?? const []),
      mustChangePassword: json['mustChangePassword'] as bool? ?? false,
      emailVerificationPending: json['emailVerificationPending'] as bool? ?? false,
    );
  }

  bool get isOperationsStaff => roles.contains('OPERATIONS_STAFF');
  bool get isInventoryStaff => roles.contains('INVENTORY_STAFF');
  bool get isSuperAdmin => roles.contains('PLATFORM_SUPER_ADMIN');
  bool get isStaffSupported => isOperationsStaff || isInventoryStaff || isSuperAdmin;

  bool hasPermission(String permission) => permissions.contains(permission);
}

class TokenPair {
  final String accessToken;
  final String refreshToken;

  const TokenPair({required this.accessToken, required this.refreshToken});

  factory TokenPair.fromJson(Map<String, dynamic> json) {
    return TokenPair(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

class ReauthResult {
  final String reauthToken;
  final String expiresAt;

  const ReauthResult({required this.reauthToken, required this.expiresAt});

  factory ReauthResult.fromJson(Map<String, dynamic> json) {
    return ReauthResult(
      reauthToken: json['reauthToken'] as String,
      expiresAt: json['expiresAt'] as String? ?? '',
    );
  }
}
