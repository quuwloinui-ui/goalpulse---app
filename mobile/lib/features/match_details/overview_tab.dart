import 'package:flutter/material.dart';
import '../../l10n/strings.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models/match.dart';

class OverviewTab extends StatelessWidget {
  const OverviewTab({super.key, required this.details});

  final MatchDetails details;

  @override
  Widget build(BuildContext context) {
    final m = details.match;
    final events = details.events.where((e) => e.type != 'OTHER').toList();
    // Newest first while the match is on, chronological once it is over.
    final ordered = m.status.isLive ? events.reversed.toList() : events;

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: context.surfaceCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Column(
              children: [
                _InfoRow(Icons.schedule, context.tr('info_kickoff'), '${formatFullDate(m.kickoff)}, ${formatKickoff(context, m.kickoff)}'),
                if (m.venue != null) _InfoRow(Icons.stadium_outlined, context.tr('info_stadium'), m.venue!),
                if (m.referee != null) _InfoRow(Icons.sports, context.tr('info_referee'), m.referee!),
                if (m.round != null) _InfoRow(Icons.flag_outlined, context.tr('info_round'), m.round!),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(context.tr('timeline'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (ordered.isEmpty)
          Padding(
            padding: const EdgeInsets.all(28),
            child: Center(child: Text(context.tr('no_events'), style: TextStyle(color: context.mutedText))),
          )
        else
          for (final e in ordered) _EventRow(event: e, homeId: m.home.id),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.icon, this.label, this.value);

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, size: 18, color: context.mutedText),
          const SizedBox(width: 10),
          Text(label, style: TextStyle(color: context.mutedText)),
          const SizedBox(width: 12),
          Expanded(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.homeId});

  final MatchEvent event;
  final int homeId;

  @override
  Widget build(BuildContext context) {
    final isHome = event.teamId == homeId;
    final content = _EventText(event: event, alignEnd: isHome);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(child: isHome ? content : const SizedBox.shrink()),
          Container(
            width: 58,
            alignment: Alignment.center,
            child: Text(event.clock, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: context.mutedText)),
          ),
          Expanded(child: isHome ? const SizedBox.shrink() : content),
        ],
      ),
    );
  }
}

class _EventText extends StatelessWidget {
  const _EventText({required this.event, required this.alignEnd});

  final MatchEvent event;
  final bool alignEnd;

  String get _primary => event.kind == 'substitution' ? (event.related ?? '') : (event.player ?? '');

  String? _secondary(BuildContext context) {
    switch (event.kind) {
      case 'goal':
        return event.related != null ? context.tr('ev_assist', {'name': '${event.related}'}) : null;
      case 'penalty':
        return context.tr('ev_penalty');
      case 'own_goal':
        return context.tr('ev_own_goal');
      case 'missed_penalty':
        return context.tr('ev_pen_missed');
      case 'substitution':
        return event.player != null ? context.tr('ev_off', {'name': '${event.player}'}) : null;
      case 'second_yellow':
        return context.tr('ev_second_yellow');
      default:
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Column(
      crossAxisAlignment: alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(_primary, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        if (_secondary(context) != null)
          Text(_secondary(context)!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: context.mutedText)),
      ],
    );
    final icon = _EventIcon(kind: event.kind);
    return Row(
      mainAxisAlignment: alignEnd ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: alignEnd ? [Flexible(child: text), const SizedBox(width: 8), icon] : [icon, const SizedBox(width: 8), Flexible(child: text)],
    );
  }
}

class _EventIcon extends StatelessWidget {
  const _EventIcon({required this.kind});

  final String kind;

  Widget _card(Color c) => Container(
        width: 12,
        height: 16,
        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2)),
      );

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case 'goal':
      case 'penalty':
        return const Icon(Icons.sports_soccer, size: 18);
      case 'own_goal':
        return const Icon(Icons.sports_soccer, size: 18, color: Colors.redAccent);
      case 'missed_penalty':
        return const Icon(Icons.cancel_outlined, size: 18, color: Colors.redAccent);
      case 'yellow_card':
        return _card(Colors.amber);
      case 'red_card':
      case 'second_yellow':
        return _card(Colors.red);
      case 'substitution':
        return const Icon(Icons.swap_vert, size: 18, color: Colors.green);
      case 'var':
        return const Icon(Icons.videocam_outlined, size: 18);
      default:
        return const Icon(Icons.circle, size: 8);
    }
  }
}
