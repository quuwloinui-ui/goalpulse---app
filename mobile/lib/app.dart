import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/navigation.dart';
import 'core/push_service.dart';
import 'core/theme.dart';
import 'features/match_details/match_details_screen.dart';
import 'features/shell/main_shell.dart';
import 'l10n/strings.dart';
import 'providers/app_providers.dart';
import 'providers/favorites_provider.dart';
import 'providers/settings_providers.dart';
import 'widgets/powered_by.dart';

class GoalPulseApp extends ConsumerStatefulWidget {
  const GoalPulseApp({super.key});

  @override
  ConsumerState<GoalPulseApp> createState() => _GoalPulseAppState();
}

class _GoalPulseAppState extends ConsumerState<GoalPulseApp> {
  @override
  void initState() {
    super.initState();
    final push = ref.read(pushServiceProvider);
    // Tapping a notification opens the match it is about.
    push.onOpenMatch = (id) => navigatorKey.currentState?.push(
          MaterialPageRoute<void>(builder: (_) => MatchDetailsScreen(matchId: id)),
        );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      push.flushPending();
      _bootstrap();
    });
  }

  /// Anonymous device session + restore favourites after a reinstall. Never blocks the UI.
  Future<void> _bootstrap() async {
    try {
      final token = await ref.read(pushServiceProvider).token();
      await ref.read(apiClientProvider).ensureAuth(fcmToken: token);
      await ref.read(favoritesProvider.notifier).restoreFromServer();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);
    final timeFormat = ref.watch(timeFormatProvider);
    Intl.defaultLocale = locale.languageCode; // dates and weekdays follow the chosen language

    return MaterialApp(
      navigatorKey: navigatorKey,
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      locale: locale,
      supportedLocales: L10n.supported,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // The 12/24 hour preference is applied here, so every formatKickoff() call (and Flutter's own
      // time pickers) follows it.
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        final use24 = switch (timeFormat) {
          TimeFormat.auto => mq.alwaysUse24HourFormat,
          TimeFormat.h12 => false,
          TimeFormat.h24 => true,
        };
        // SportScore attribution sits under every screen; the screens above it must not add the bottom inset twice.
        final inner = mq.copyWith(
          alwaysUse24HourFormat: use24,
          padding: mq.padding.copyWith(bottom: 0),
          viewPadding: mq.viewPadding.copyWith(bottom: 0),
        );
        return MediaQuery(
          data: mq.copyWith(alwaysUse24HourFormat: use24),
          child: Column(
            children: [
              Expanded(child: MediaQuery(data: inner, child: child ?? const SizedBox.shrink())),
              const PoweredBySportScore(),
            ],
          ),
        );
      },
      home: const MainShell(),
    );
  }
}
