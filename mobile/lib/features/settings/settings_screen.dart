import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/theme.dart';
import '../../l10n/strings.dart';
import '../../providers/account_provider.dart';
import '../../providers/app_providers.dart';
import '../../providers/settings_providers.dart';
import '../account/account_screen.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _open(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);
    final timeFormat = ref.watch(timeFormatProvider);
    final matchAlerts = ref.watch(matchAlertsProvider);
    final reminders = ref.watch(remindersProvider);
    final announcements = ref.watch(notificationsEnabledProvider);
    final account = ref.watch(accountProvider);

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('settings'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          _Heading(context.tr('language')),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ar', label: Text('العربية')),
              ButtonSegment(value: 'en', label: Text('English')),
            ],
            selected: {locale.languageCode},
            onSelectionChanged: (s) => ref.read(localeProvider.notifier).set(Locale(s.first)),
          ),
          _Heading(context.tr('appearance')),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment(value: ThemeMode.system, icon: const Icon(Icons.brightness_auto), label: Text(context.tr('theme_auto'))),
              ButtonSegment(value: ThemeMode.light, icon: const Icon(Icons.light_mode_outlined), label: Text(context.tr('theme_light'))),
              ButtonSegment(value: ThemeMode.dark, icon: const Icon(Icons.dark_mode_outlined), label: Text(context.tr('theme_dark'))),
            ],
            selected: {themeMode},
            onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).set(s.first),
          ),
          _Heading(context.tr('time_format')),
          SegmentedButton<TimeFormat>(
            segments: [
              ButtonSegment(value: TimeFormat.auto, label: Text(context.tr('time_auto'))),
              ButtonSegment(value: TimeFormat.h12, label: Text(context.tr('time_12'))),
              ButtonSegment(value: TimeFormat.h24, label: Text(context.tr('time_24'))),
            ],
            selected: {timeFormat},
            onSelectionChanged: (s) => ref.read(timeFormatProvider.notifier).set(s.first),
          ),
          _Heading(context.tr('notifications')),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.tr('notif_matches')),
            subtitle: Text(context.tr('notif_matches_sub')),
            value: matchAlerts,
            onChanged: (v) => ref.read(matchAlertsProvider.notifier).set(v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.tr('notif_reminders')),
            subtitle: Text(context.tr('notif_reminders_sub')),
            value: reminders,
            onChanged: (v) => ref.read(remindersProvider.notifier).set(v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.tr('notif_announcements')),
            subtitle: Text(context.tr('notif_announcements_sub')),
            value: announcements,
            onChanged: (v) => ref.read(notificationsEnabledProvider.notifier).set(v),
          ),
          _Heading(context.tr('account')),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person_outline),
            title: Text(account.email ?? context.tr('sign_in')),
            subtitle: account.signedIn ? null : Text(context.tr('account_anon')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AccountScreen())),
          ),
          _Heading(context.tr('support')),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.share_outlined),
            title: Text(context.tr('share_app')),
            onTap: () => Share.share('${context.tr('share_text')}\n${AppConfig.storeUrl}'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.star_outline),
            title: Text(context.tr('rate_app')),
            onTap: () => _open(AppConfig.storeUrl),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.privacy_tip_outlined),
            title: Text(context.tr('privacy')),
            onTap: () => _open(AppConfig.privacyUrl),
          ),
          _Heading(context.tr('our_accounts')),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.facebook),
            title: Text(context.tr('facebook')),
            trailing: const Icon(Icons.open_in_new, size: 18),
            onTap: () => _open(AppConfig.facebookUrl),
          ),
          const SizedBox(height: 20),
          Text(
            '${context.tr('timezone_note')}\n${AppConfig.apiBaseUrl}',
            style: TextStyle(fontSize: 12.5, color: context.mutedText, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 24, bottom: 10),
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      );
}
