import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../providers/match_providers.dart';
import '../../widgets/common.dart';
import 'match_card.dart';

/// Expandable league block with its matches.
class LeagueSection extends StatelessWidget {
  const LeagueSection({super.key, required this.group});

  final LeagueGroup group;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 10),
      elevation: 0,
      color: context.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: PageStorageKey<String>('league-${group.id}'),
          initiallyExpanded: true,
          tilePadding: const EdgeInsets.symmetric(horizontal: 14),
          childrenPadding: EdgeInsets.zero,
          leading: NetImage(group.logo, size: 26, fallback: Icons.emoji_events_outlined),
          title: Text(group.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          subtitle: group.country == null
              ? null
              : Text(group.country!, style: TextStyle(fontSize: 12, color: context.mutedText)),
          children: [
            for (final m in group.matches) ...[
              const Divider(),
              MatchCard(match: m),
            ],
          ],
        ),
      ),
    );
  }
}
