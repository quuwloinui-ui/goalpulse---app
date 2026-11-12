import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/push_service.dart';
import '../core/storage.dart';
import '../data/football_repository.dart';
import '../data/models/remote_config.dart';

final footballRepositoryProvider = Provider<FootballRepository>(
  (ref) => FootballRepository(ref.watch(apiClientProvider)),
);

/// Feature toggles + banners from the admin panel. Re-read every 2 minutes.
final remoteConfigProvider = FutureProvider<RemoteConfig>((ref) async {
  final timer = Timer(const Duration(minutes: 2), ref.invalidateSelf);
  ref.onDispose(timer.cancel);
  try {
    return await ref.watch(footballRepositoryProvider).remoteConfig();
  } catch (_) {
    return const RemoteConfig(); // offline / server down: default everything on
  }
});

final featuresProvider = Provider<Map<String, bool>>(
  (ref) => ref.watch(remoteConfigProvider).valueOrNull?.features ?? const {},
);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme.mode';

  @override
  ThemeMode build() {
    final saved = ref.read(sharedPrefsProvider).getString(_key);
    return ThemeMode.values.firstWhere((m) => m.name == saved, orElse: () => ThemeMode.system);
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(sharedPrefsProvider).setString(_key, mode.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

class NotificationsNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(pushServiceProvider).enabled;

  Future<void> set(bool value) async {
    state = value;
    await ref.read(pushServiceProvider).setEnabled(value);
  }
}

final notificationsEnabledProvider = NotifierProvider<NotificationsNotifier, bool>(NotificationsNotifier.new);
