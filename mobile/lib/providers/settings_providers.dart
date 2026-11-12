import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/push_service.dart';
import '../core/storage.dart';
import 'favorites_provider.dart';

enum TimeFormat { auto, h12, h24 }

/// App language (Arabic / English). Also tells the server which language to send push messages in.
class LocaleNotifier extends Notifier<Locale> {
  static const _key = 'locale';

  @override
  Locale build() {
    final saved = ref.read(sharedPrefsProvider).getString(_key);
    if (saved == 'ar' || saved == 'en') return Locale(saved!);
    final device = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return Locale(device == 'ar' ? 'ar' : 'en');
  }

  Future<void> set(Locale locale) async {
    state = locale;
    await ref.read(sharedPrefsProvider).setString(_key, locale.languageCode);
    await ref.read(pushServiceProvider).setLanguage(locale.languageCode);
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

class TimeFormatNotifier extends Notifier<TimeFormat> {
  static const _key = 'time.format';

  @override
  TimeFormat build() {
    final saved = ref.read(sharedPrefsProvider).getString(_key);
    return TimeFormat.values.firstWhere((t) => t.name == saved, orElse: () => TimeFormat.auto);
  }

  Future<void> set(TimeFormat value) async {
    state = value;
    await ref.read(sharedPrefsProvider).setString(_key, value.name);
  }
}

final timeFormatProvider = NotifierProvider<TimeFormatNotifier, TimeFormat>(TimeFormatNotifier.new);

/// Kick-off, goals, red cards and results of followed teams / matches.
class MatchAlertsNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(pushServiceProvider).matchAlerts;

  Future<void> set(bool value) async {
    state = value;
    final fav = ref.read(favoritesProvider);
    await ref.read(pushServiceProvider).applyMatchAlerts(value, fav.teams.keys, fav.matchIds);
  }
}

final matchAlertsProvider = NotifierProvider<MatchAlertsNotifier, bool>(MatchAlertsNotifier.new);

/// "Starting soon" reminders for followed teams / matches.
class RemindersNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(pushServiceProvider).reminders;

  Future<void> set(bool value) async {
    state = value;
    final fav = ref.read(favoritesProvider);
    await ref.read(pushServiceProvider).applyReminders(value, fav.teams.keys, fav.matchIds);
  }
}

final remindersProvider = NotifierProvider<RemindersNotifier, bool>(RemindersNotifier.new);
