import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models/match.dart';
import '../../providers/app_providers.dart';
import '../../providers/favorites_provider.dart';
import '../../providers/match_providers.dart';
import '../../widgets/common.dart';
import 'lineups_tab.dart';
import 'overview_tab.dart';
import 'stats_tab.dart';
import 'streams_tab.dart';

/// Match centre: header + Overview / Lineups / Stats / Watch tabs. Updates live through the
/// Socket.IO room of this match (see matchDetailsProvider).
class MatchDetailsScreen extends ConsumerWidget {
  const MatchDetailsScreen({super.key, required this.matchId, this.initial});

  final int matchId;

  /// Summary from the list, shown instantly while the full details load.
  final MatchSummary? initial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(matchDetailsProvider(matchId));
    final streamsOn = ref.watch(featuresProvider)['streams'] ?? true;
    final match = async.valueOrNull?.match ?? initial;
    final tabs = [context.tr('tab_overview'), context.tr('tab_lineups'), context.tr('tab_stats'), if (streamsOn) context.tr('tab_watch')];

    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(match?.leagueName ?? context.tr('match'), style: const TextStyle(fontSize: 16)),
          actions: [if (match != null) _FollowMatchButton(match: match)],
        ),
        body: Column(
          children: [
            if (match != null) _ScoreHeader(match: match),
            TabBar(tabs: [for (final t in tabs) Tab(text: t)]),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(matchDetailsProvider(matchId))),
                data: (d) => TabBarView(
                  children: [
                    OverviewTab(details: d),
                    LineupsTab(details: d),
                    StatsTab(details: d),
                    if (streamsOn) StreamsTab(details: d),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FollowMatchButton extends ConsumerWidget {
  const _FollowMatchButton({required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final on = ref.watch(favoritesProvider.select((s) => s.matchIds.contains(match.id)));
    return IconButton(
      tooltip: on ? context.tr('alerts_stop') : context.tr('alerts_get_goals'),
      icon: Icon(on ? Icons.notifications_active : Icons.notifications_none, color: on ? Colors.amber : null),
      onPressed: () => ref.read(favoritesProvider.notifier).toggleMatch(match),
    );
  }
}

class _ScoreHeader extends StatelessWidget {
  const _ScoreHeader({required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _HeaderTeam(team: match.home)),
          _HeaderCenter(match: match),
          Expanded(child: _HeaderTeam(team: match.away)),
        ],
      ),
    );
  }
}

class _HeaderTeam extends ConsumerWidget {
  const _HeaderTeam({required this.team});

  final TeamRef team;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final followed = ref.watch(favoritesProvider.select((s) => s.teams.containsKey(team.id)));
    return Column(
      children: [
        NetImage(team.logo, size: 56),
        const SizedBox(height: 6),
        Text(team.name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
        TextButton.icon(
          style: TextButton.styleFrom(visualDensity: VisualDensity.compact, padding: const EdgeInsets.symmetric(horizontal: 8)),
          onPressed: () => ref.read(favoritesProvider.notifier).toggleTeam(team),
          icon: Icon(followed ? Icons.notifications_active : Icons.notifications_none, size: 16),
          label: Text(followed ? context.tr('following') : context.tr('follow'), style: const TextStyle(fontSize: 12)),
        ),
      ],
    );
  }
}

class _HeaderCenter extends StatelessWidget {
  const _HeaderCenter({required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context) {
    final m = match;
    final live = m.status.isLive;
    final color = live ? (m.status == MatchStatus.halfTime ? kHalfTimeColor : kLiveColor) : null;
    final label = switch (m.status) {
      MatchStatus.live => m.minute != null ? "${m.minute}'" : context.tr('st_live'),
      MatchStatus.halfTime => context.tr('st_halftime'),
      MatchStatus.finished => context.tr('st_fulltime'),
      MatchStatus.postponed => context.tr('st_postponed'),
      MatchStatus.cancelled => context.tr('st_cancelled'),
      MatchStatus.suspended => context.tr('st_suspended'),
      _ => formatFullDate(m.kickoff),
    };
    final showScore = m.hasScore && m.status != MatchStatus.notStarted;
    return SizedBox(
      width: 112,
      child: Column(
        children: [
          const SizedBox(height: 10),
          Text(
            showScore ? '${m.homeGoals} - ${m.awayGoals}' : formatKickoff(context, m.kickoff),
            style: TextStyle(fontSize: showScore ? 34 : 24, fontWeight: FontWeight.w900, color: color),
          ),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, color: color ?? context.mutedText)),
        ],
      ),
    );
  }
}
