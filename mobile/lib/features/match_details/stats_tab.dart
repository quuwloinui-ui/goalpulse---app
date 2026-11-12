import 'package:flutter/material.dart';
import '../../l10n/strings.dart';

import '../../core/theme.dart';
import '../../data/models/match.dart';
import '../../widgets/common.dart';

class StatsTab extends StatelessWidget {
  const StatsTab({super.key, required this.details});

  final MatchDetails details;

  @override
  Widget build(BuildContext context) {
    if (details.stats.isEmpty) {
      return EmptyState(icon: Icons.bar_chart_outlined, message: context.tr('stats_empty'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: details.stats.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (_, i) => _StatBar(row: details.stats[i]),
    );
  }
}

class _StatBar extends StatelessWidget {
  const _StatBar({required this.row});

  final StatRow row;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final h = row.homeValue;
    final a = row.awayValue;
    final total = h + a;
    // Flex must be a positive int; 1/1 when both are zero.
    final homeFlex = total == 0 ? 1 : (h / total * 1000).round().clamp(1, 999).toInt();
    final awayFlex = total == 0 ? 1 : (a / total * 1000).round().clamp(1, 999).toInt();
    final homeLeads = h >= a;
    return Column(
      children: [
        Row(
          children: [
            SizedBox(width: 56, child: Text(row.home, style: TextStyle(fontWeight: homeLeads ? FontWeight.w800 : FontWeight.w500))),
            Expanded(child: Text(context.statLabel(row.label), textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: context.mutedText))),
            SizedBox(width: 56, child: Text(row.away, textAlign: TextAlign.end, style: TextStyle(fontWeight: !homeLeads ? FontWeight.w800 : FontWeight.w500))),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(flex: homeFlex, child: Container(height: 6, decoration: BoxDecoration(color: homeLeads ? scheme.primary : scheme.primary.withAlpha(90), borderRadius: BorderRadius.circular(3)))),
            const SizedBox(width: 3),
            Expanded(flex: awayFlex, child: Container(height: 6, decoration: BoxDecoration(color: !homeLeads ? scheme.tertiary : scheme.tertiary.withAlpha(90), borderRadius: BorderRadius.circular(3)))),
          ],
        ),
      ],
    );
  }
}
