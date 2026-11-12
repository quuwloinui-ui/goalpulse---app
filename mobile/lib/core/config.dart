class AppConfig {
  const AppConfig._();

  static const String appName = 'GoalPulse';

  /// Set at build time:  flutter run --dart-define=API_BASE_URL=https://api.example.com
  /// (10.0.2.2 is the Android emulator's alias for the host machine's localhost.)
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://127.0.0.1:4000');
  static const String _wsOverride = String.fromEnvironment('WS_URL');

  static String get apiUrl => '$apiBaseUrl/api/v1';
  static String get wsUrl => _wsOverride.isEmpty ? apiBaseUrl : _wsOverride;

  /// Store listing used by Share and Rate: --dart-define=STORE_URL=https://play.google.com/store/apps/details?id=...
  static const String storeUrl =
      String.fromEnvironment('STORE_URL', defaultValue: 'https://play.google.com/store/apps/details?id=com.goalpulse.goalpulse');
  static const String _privacyOverride = String.fromEnvironment('PRIVACY_URL');

  /// Served by the backend (backend/public/privacy.html). Override with --dart-define=PRIVACY_URL=...
  static String get privacyUrl => _privacyOverride.isEmpty ? '$apiBaseUrl/privacy' : _privacyOverride;
  static const String facebookUrl = 'https://www.facebook.com/share/1K6cuSrDZq/';

  /// League ids shown first on the home screen (others follow alphabetically).
  static const List<int> leaguePriority = [2, 3, 39, 140, 135, 78, 61, 307, 233, 253, 1];
}
