import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(); // the OS shows notification messages itself
}

/// FCM wrapper. The server targets *topics*, so the client only has to (un)subscribe:
///   all            broadcast announcements from the admin panel
///   team_{id}      goals / kick-off / cards / results of a followed team
///   match_{id}     the same for a single followed match
class PushService {
  PushService(this._prefs);

  final SharedPreferences _prefs;
  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  Map<String, dynamic>? _pending;

  /// Set by the app shell: opens the match screen for a tapped notification.
  void Function(int matchId)? onOpenMatch;

  static const _kEnabled = 'notifications.enabled';
  static const _kMatchAlerts = 'notif.matches';
  static const _kReminders = 'notif.reminders';
  bool get enabled => _prefs.getBool(_kEnabled) ?? true;
  bool get available => _ready;

  Future<void> init() async {
    try {
      await Firebase.initializeApp(); // needs google-services.json / GoogleService-Info.plist
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await _initLocal();
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission();
      await fm.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
      if (enabled) await fm.subscribeToTopic('all');
      await fm.subscribeToTopic('lang_$language'); // the server sends each event in the user's language
      await fm.unsubscribeFromTopic('lang_${language == 'ar' ? 'en' : 'ar'}');
      FirebaseMessaging.onMessage.listen(_onForeground);
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data));
      final initial = await fm.getInitialMessage();
      if (initial != null) _pending = initial.data;
      _ready = true;
    } catch (e) {
      debugPrint('Push disabled (is Firebase configured?): $e');
    }
  }

  Future<void> _initLocal() async {
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (resp) {
        final payload = resp.payload;
        if (payload == null) return;
        try {
          _open(Map<String, dynamic>.from(jsonDecode(payload) as Map));
        } catch (_) {}
      },
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
          'matches',
          'Match alerts',
          description: 'Goals, kick-offs and results',
          importance: Importance.high,
        ));
  }

  /// Android does not draw notifications while the app is in the foreground, so we do.
  void _onForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null) return;
    _local.show(
      m.hashCode,
      n.title,
      n.body,
      const NotificationDetails(
        android: AndroidNotificationDetails('matches', 'Match alerts', importance: Importance.high, priority: Priority.high),
        iOS: DarwinNotificationDetails(),
      ),
      payload: jsonEncode(m.data),
    );
  }

  void _open(Map<String, dynamic> data) {
    final id = int.tryParse('${data['fixtureId'] ?? ''}');
    if (id != null) onOpenMatch?.call(id);
  }

  /// Handles a notification that launched the app from the terminated state.
  void flushPending() {
    final data = _pending;
    _pending = null;
    if (data != null) _open(data);
  }

  Future<String?> token() async {
    if (!_ready) return null;
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }

  Future<void> subscribe(String topic) async {
    if (_ready) await FirebaseMessaging.instance.subscribeToTopic(topic);
  }

  Future<void> unsubscribe(String topic) async {
    if (_ready) await FirebaseMessaging.instance.unsubscribeFromTopic(topic);
  }

  bool get matchAlerts => _prefs.getBool(_kMatchAlerts) ?? true;
  bool get reminders => _prefs.getBool(_kReminders) ?? true;

  /// App language for push text: the saved choice, else the device language (Arabic or English).
  String get language {
    final saved = _prefs.getString('locale');
    if (saved == 'ar' || saved == 'en') return saved!;
    return WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'ar' ? 'ar' : 'en';
  }

  Future<void> setLanguage(String lang) async {
    await subscribe('lang_$lang');
    await unsubscribe('lang_${lang == 'ar' ? 'en' : 'ar'}');
  }

  // Event topics (match_/team_) follow "Match notifications", reminder topics (remind_*) follow "Match reminders".
  Future<void> followTeam(int id) async {
    if (matchAlerts) await subscribe('team_$id');
    if (reminders) await subscribe('remind_team_$id');
  }

  Future<void> unfollowTeam(int id) async {
    await unsubscribe('team_$id');
    await unsubscribe('remind_team_$id');
  }

  Future<void> followMatch(int id) async {
    if (matchAlerts) await subscribe('match_$id');
    if (reminders) await subscribe('remind_match_$id');
  }

  Future<void> unfollowMatch(int id) async {
    await unsubscribe('match_$id');
    await unsubscribe('remind_match_$id');
  }

  Future<void> applyMatchAlerts(bool on, Iterable<int> teams, Iterable<int> matches) async {
    await _prefs.setBool(_kMatchAlerts, on);
    for (final t in teams) {
      if (on) {
        await subscribe('team_$t');
      } else {
        await unsubscribe('team_$t');
      }
    }
    for (final m in matches) {
      if (on) {
        await subscribe('match_$m');
      } else {
        await unsubscribe('match_$m');
      }
    }
  }

  Future<void> applyReminders(bool on, Iterable<int> teams, Iterable<int> matches) async {
    await _prefs.setBool(_kReminders, on);
    for (final t in teams) {
      if (on) {
        await subscribe('remind_team_$t');
      } else {
        await unsubscribe('remind_team_$t');
      }
    }
    for (final m in matches) {
      if (on) {
        await subscribe('remind_match_$m');
      } else {
        await unsubscribe('remind_match_$m');
      }
    }
  }

  Future<void> setEnabled(bool value) async {
    await _prefs.setBool(_kEnabled, value);
    if (value) {
      await subscribe('all');
    } else {
      await unsubscribe('all');
    }
  }
}

final pushServiceProvider = Provider<PushService>(
  (ref) => throw UnimplementedError('pushServiceProvider must be overridden in main()'),
);
