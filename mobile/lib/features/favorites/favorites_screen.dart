import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../providers/favorites_provider.dart';
import '../../widgets/common.dart';
import '../home/match_card.dart';

/// Followed teams and matches. Following = push alerts for kick-off, goals, red cards and results.
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fav = ref.watch(favoritesProvider);
    final saved = ref.watch(savedMatchesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('favorites'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
        children: [
          _Heading(context.tr('followed_teams')),
          if (fav.teams.isEmpty)
            _Hint(context.tr('hint_teams'))
          else
            for (final t in fav.teams.values)
              Card(
                elevation: 0,
                color: context.surfaceCard,
                margin: const EdgeInsets.only(top: 8),
                child: ListTile(
                  leading: NetImage(t.logo, size: 32),
                  title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  trailing: IconButton(
                    tooltip: context.tr('unfollow'),
                    icon: const Icon(Icons.notifications_active),
                    onPressed: () => ref.read(favoritesProvider.notifier).toggleTeam(t.ref),
                  ),
                ),
              ),
          const SizedBox(height: 12),
          _Heading(context.tr('followed_matches')),
          if (fav.matchIds.isEmpty)
            _Hint(context.tr('hint_matches'))
          else
            saved.when(
              loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
              error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(savedMatchesProvider)),
              data: (matches) => Column(
                children: [
                  for (final m in matches)
                    Card(
                      elevation: 0,
                      color: context.surfaceCard,
                      margin: const EdgeInsets.only(top: 8),
                      clipBehavior: Clip.antiAlias,
                      child: MatchCard(match: m),
                    ),
                ],
              ),
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
        padding: const EdgeInsets.only(top: 8),
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      );
}

class _Hint extends StatelessWidget {
  const _Hint(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Text(text, style: TextStyle(color: context.mutedText)),
      );
}
