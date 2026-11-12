import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models/match.dart';
import '../../providers/app_providers.dart';
import '../../providers/favorites_provider.dart';
import '../../widgets/common.dart';
import '../match_details/match_details_screen.dart';

void openMatch(BuildContext context, MatchSummary match) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => MatchDetailsScreen(matchId: match.id, initial: match)),
  );
}

class MatchCard extends ConsumerWidget {
  const MatchCard({super.key, required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFav = ref.watch(favoritesProvider.select((s) => s.matchIds.contains(match.id)));
    final streamsOn = ref.watch(featuresProvider)['streams'] ?? true;
    return InkWell(
      onTap: () => openMatch(context, match),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 4, 10),
        child: Row(
          children: [
            Expanded(child: _TeamColumn(team: match.home)),
            SizedBox(width: 84, child: _CenterInfo(match: match)),
            Expanded(child: _TeamColumn(team: match.away)),
            SizedBox(
              width: 44,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: isFav ? context.tr('alerts_stop') : context.tr('alerts_get'),
                    icon: Icon(isFav ? Icons.star : Icons.star_border, color: isFav ? Colors.amber : null),
                    onPressed: () => ref.read(favoritesProvider.notifier).toggleMatch(match),
                  ),
                  if (match.hasStream && streamsOn)
                    Icon(Icons.live_tv, size: 18, color: Theme.of(context).colorScheme.primary),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TeamColumn extends StatelessWidget {
  const _TeamColumn({required this.team});

  final TeamRef team;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        NetImage(team.logo, size: 38),
        const SizedBox(height: 6),
        Text(
          team.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.2),
        ),
      ],
    );
  }
}

class _CenterInfo extends StatelessWidget {
  const _CenterInfo({required this.match});

  final MatchSummary match;

  @override
  Widget build(BuildContext context) {
    final m = match;
    final Color? statusColor = switch (m.status) {
      MatchStatus.live => kLiveColor,
      MatchStatus.halfTime => kHalfTimeColor,
      _ => null,
    };
    final String label = switch (m.status) {
      MatchStatus.live => m.minute != null ? "${m.minute}'" : context.tr('st_live'),
      MatchStatus.halfTime => context.tr('st_ht'),
      MatchStatus.finished => context.tr('st_ft'),
      MatchStatus.postponed => context.tr('st_postponed'),
      MatchStatus.cancelled => context.tr('st_cancelled'),
      MatchStatus.suspended => context.tr('st_suspended'),
      _ => '',
    };
    final showScore = m.hasScore && m.status != MatchStatus.notStarted;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          showScore ? '${m.homeGoals} - ${m.awayGoals}' : formatKickoff(context, m.kickoff),
          style: TextStyle(fontSize: showScore ? 22 : 17, fontWeight: FontWeight.w800, color: statusColor),
        ),
        if (label.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: statusColor ?? context.mutedText)),
          ),
      ],
    );
  }
}
