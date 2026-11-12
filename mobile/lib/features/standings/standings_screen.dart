import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/models/standings.dart';
import '../../providers/standings_providers.dart';
import '../../widgets/common.dart';

class StandingsScreen extends ConsumerWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leagues = ref.watch(leaguesProvider);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(context.tr('standings')),
          bottom: TabBar(tabs: [Tab(text: context.tr('tab_table')), Tab(text: context.tr('tab_scorers')), Tab(text: context.tr('tab_assists'))]),
        ),
        body: leagues.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(leaguesProvider)),
          data: (list) {
            if (list.isEmpty) return EmptyState(icon: Icons.leaderboard_outlined, message: context.tr('no_leagues'));
            final selected = ref.watch(selectedLeagueProvider) ?? list.first.id;
            return Column(
              children: [
                _LeagueChips(leagues: list, selected: selected),
                Expanded(
                  child: TabBarView(
                    children: [
                      _TableTab(leagueId: selected),
                      _PlayersTab(leagueId: selected, assists: false),
                      _PlayersTab(leagueId: selected, assists: true),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _LeagueChips extends ConsumerWidget {
  const _LeagueChips({required this.leagues, required this.selected});

  final List<LeagueInfo> leagues;
  final int selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        itemCount: leagues.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final l = leagues[i];
          return ChoiceChip(
            avatar: NetImage(l.logo, size: 18, fallback: Icons.emoji_events_outlined),
            label: Text(l.name),
            selected: l.id == selected,
            onSelected: (_) => ref.read(selectedLeagueProvider.notifier).state = l.id,
          );
        },
      ),
    );
  }
}

class _TableTab extends ConsumerWidget {
  const _TableTab({required this.leagueId});

  final int leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(standingsProvider(leagueId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(standingsProvider(leagueId))),
      data: (groups) {
        if (groups.isEmpty || groups.every((g) => g.rows.isEmpty)) {
          return EmptyState(icon: Icons.table_rows_outlined, message: context.tr('no_table'));
        }
        return RefreshIndicator(
          onRefresh: () async => ref.refresh(standingsProvider(leagueId).future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
            children: [
              for (final g in groups) ...[
                if (groups.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(top: 14, bottom: 6, left: 4),
                    child: Text(g.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                _GroupTable(group: g),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _GroupTable extends StatelessWidget {
  const _GroupTable({required this.group});

  final StandingGroup group;

  static Color? _zone(String? description) {
    final d = (description ?? '').toLowerCase();
    if (d.contains('relegation')) return Colors.red;
    if (d.contains('champions league') || d.contains('promotion')) return Colors.green;
    if (d.contains('europa') || d.contains('conference')) return Colors.orange;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: context.mutedText);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(top: 10),
      color: context.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 12, 6),
            child: Row(
              children: [
                SizedBox(width: 30, child: Text('#', style: muted)),
                Expanded(child: Text(context.tr('col_team'), style: muted)),
                SizedBox(width: 30, child: Text(context.tr('col_p'), textAlign: TextAlign.center, style: muted)),
                SizedBox(width: 38, child: Text(context.tr('col_gd'), textAlign: TextAlign.center, style: muted)),
                SizedBox(width: 38, child: Text(context.tr('col_pts'), textAlign: TextAlign.end, style: muted)),
              ],
            ),
          ),
          const Divider(),
          for (final r in group.rows)
            Container(
              decoration: BoxDecoration(
                border: Border(left: BorderSide(width: 4, color: _zone(r.description) ?? Colors.transparent)),
              ),
              padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
              child: Row(
                children: [
                  SizedBox(width: 30, child: Text('${r.rank}', style: const TextStyle(fontWeight: FontWeight.w700))),
                  NetImage(r.team.logo, size: 22),
                  const SizedBox(width: 10),
                  Expanded(child: Text(r.team.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                  SizedBox(width: 30, child: Text('${r.played}', textAlign: TextAlign.center)),
                  SizedBox(width: 38, child: Text(r.goalDiff > 0 ? '+${r.goalDiff}' : '${r.goalDiff}', textAlign: TextAlign.center)),
                  SizedBox(width: 38, child: Text('${r.points}', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w900))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PlayersTab extends ConsumerWidget {
  const _PlayersTab({required this.leagueId, required this.assists});

  final int leagueId;
  final bool assists;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = assists ? topAssistsProvider(leagueId) : topScorersProvider(leagueId);
    return ref.watch(provider).when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(provider)),
          data: (players) {
            if (players.isEmpty) return EmptyState(icon: Icons.emoji_events_outlined, message: context.tr('no_players'));
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 24),
              itemCount: players.length,
              separatorBuilder: (_, __) => const Divider(),
              itemBuilder: (_, i) => _PlayerRow(player: players[i], assists: assists),
            );
          },
        );
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({required this.player, required this.assists});

  final PlayerStat player;
  final bool assists;

  @override
  Widget build(BuildContext context) {
    final main = assists ? player.assists : player.goals;
    final other = assists ? player.goals : player.assists;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(width: 28, child: Text('${player.rank}', style: const TextStyle(fontWeight: FontWeight.w800))),
          NetImage(player.photo, size: 38, circle: true, fallback: Icons.person_outline),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(player.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                Row(
                  children: [
                    NetImage(player.team.logo, size: 14),
                    const SizedBox(width: 6),
                    Flexible(child: Text(player.team.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.mutedText))),
                  ],
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('$main', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              Text(context.tr(assists ? 'goals_n' : 'assists_n', {'n': '$other'}), style: TextStyle(fontSize: 11, color: context.mutedText)),
            ],
          ),
        ],
      ),
    );
  }
}
