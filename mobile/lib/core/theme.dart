import 'package:flutter/material.dart';

const kLiveColor = Color(0xFFE5392E);
const kHalfTimeColor = Color(0xFFF29900);

class AppTheme {
  const AppTheme._();

  static const _seed = Color(0xFF12A15F);

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: _seed, brightness: brightness);
    final bg = dark ? const Color(0xFF0B1220) : const Color(0xFFF3F5F8);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: scheme.onSurface),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: dark ? const Color(0xFF111B2E) : Colors.white,
        indicatorColor: scheme.primary.withAlpha(48),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant.withAlpha(110), space: 1, thickness: 1),
    );
  }
}

extension ThemeX on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get surfaceCard => isDark ? const Color(0xFF121C30) : Colors.white;
  Color get mutedText => Theme.of(this).colorScheme.onSurface.withAlpha(150);
}
