import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/push_service.dart';
import 'core/storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Format dates/times in the device locale (kick-off times are converted to local time in the models).
  await initializeDateFormatting();
  try {
    Intl.defaultLocale = WidgetsBinding.instance.platformDispatcher.locale.toString();
    DateFormat.Hm(); // throws if intl does not know the locale
  } catch (_) {
    Intl.defaultLocale = 'en_US';
  }

  final prefs = await SharedPreferences.getInstance();
  final push = PushService(prefs);
  await push.init(); // no-ops gracefully when Firebase is not configured yet

  runApp(ProviderScope(
    overrides: [
      sharedPrefsProvider.overrideWithValue(prefs),
      pushServiceProvider.overrideWithValue(push),
    ],
    child: const GoalPulseApp(),
  ));
}
