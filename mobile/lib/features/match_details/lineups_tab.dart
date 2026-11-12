import 'package:flutter/material.dart';
import '../../l10n/strings.dart';

import '../../core/theme.dart';
import '../../data/models/match.dart';
import '../../widgets/common.dart';

/// Starting XI on a pitch (rows come from the provider's "row:col" grid) or as a plain list.
class LineupsTab extends StatefulWidget {
  const LineupsTab({super.key, required this.details});

  final MatchDetails details;

  @override
  State<LineupsTab> createState() => _LineupsTabState();
}

class _LineupsTabState extends State<LineupsTab> {
  bool _pitch = true;

  @override
  Widget build(BuildContext context) {
    final d = widget.details;
    if (d.lineups.length < 2) {
      return EmptyState(icon: Icons.groups_outlined, message: context.tr('lineups_empty'));
    }
    final home = d.lineups.firstWhere((l) => l.team.id == d.match.home.id, orElse: () => d.lineups.first);
    final away = d.lineups.firstWhere((l) => l.team.id == d.match.away.id, orElse: () => d.lineups.last);
    final showPitch = _pitch && home.hasGrid && away.hasGrid;

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Row(
          children: [
            Expanded(child: Text(home.formation ?? '', style: const TextStyle(fontWeight: FontWeight.w800))),
            SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: true, label: Text(context.tr('pitch'))),
                ButtonSegment(value: false, label: Text(context.tr('list'))),
              ],
              selected: {showPitch},
              onSelectionChanged: (s) => setState(() => _pitch = s.first),
            ),
            Expanded(child: Text(away.formation ?? '', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w800))),
          ],
        ),
        const SizedBox(height: 10),
        if (showPitch)
          _Pitch(home: home, away: away)
        else
          _TwoColumns(left: _PlayerList(title: context.tr('starting_xi'), lineup: home, starters: true), right: _PlayerList(title: context.tr('starting_xi'), lineup: away, starters: true)),
        const SizedBox(height: 18),
        _TwoColumns(left: _PlayerList(title: context.tr('substitutes'), lineup: home, starters: false), right: _PlayerList(title: context.tr('substitutes'), lineup: away, starters: false)),
      ],
    );
  }
}

class _TwoColumns extends StatelessWidget {
  const _TwoColumns({required this.left, required this.right});

  final Widget left;
  final Widget right;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [Expanded(child: left), const SizedBox(width: 12), Expanded(child: right)],
      );
}

class _PlayerList extends StatelessWidget {
  const _PlayerList({required this.title, required this.lineup, required this.starters});

  final String title;
  final TeamLineup lineup;
  final bool starters;

  @override
  Widget build(BuildContext context) {
    final players = starters ? lineup.startXI : lineup.subs;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(lineup.team.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
        Text(title, style: TextStyle(fontSize: 12, color: context.mutedText)),
        const SizedBox(height: 6),
        for (final p in players)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                SizedBox(width: 24, child: Text('${p.number ?? ''}', style: TextStyle(fontWeight: FontWeight.w700, color: context.mutedText))),
                Expanded(child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
          ),
        if (!starters && lineup.coach != null) ...[
          const SizedBox(height: 8),
          Text(context.tr('coach', {'name': '${lineup.coach}'}), style: TextStyle(fontSize: 12, color: context.mutedText)),
        ],
      ],
    );
  }
}

class _Pitch extends StatelessWidget {
  const _Pitch({required this.home, required this.away});

  final TeamLineup home;
  final TeamLineup away;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 0.62,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          fit: StackFit.expand,
          children: [
            CustomPaint(painter: _PitchPainter()),
            Column(
              children: [
                Expanded(child: _Half(lineup: home, color: const Color(0xFF1E6BFF), flip: false)),
                Expanded(child: _Half(lineup: away, color: const Color(0xFFE5392E), flip: true)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// One team's half: players grouped by grid row (1 = goalkeeper), away team mirrored.
class _Half extends StatelessWidget {
  const _Half({required this.lineup, required this.color, required this.flip});

  final TeamLineup lineup;
  final Color color;
  final bool flip;

  @override
  Widget build(BuildContext context) {
    final rows = <int, List<LineupPlayer>>{};
    for (final p in lineup.startXI) {
      rows.putIfAbsent(p.gridRow ?? 1, () => []).add(p);
    }
    final keys = rows.keys.toList()..sort();
    final ordered = flip ? keys.reversed.toList() : keys;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (final k in ordered)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final p in ([...rows[k]!]..sort((a, b) => (a.gridCol ?? 0).compareTo(b.gridCol ?? 0))))
                  _PlayerDot(player: p, color: color),
              ],
            ),
        ],
      ),
    );
  }
}

class _PlayerDot extends StatelessWidget {
  const _PlayerDot({required this.player, required this.color});

  final LineupPlayer player;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 14,
          backgroundColor: color,
          child: Text('${player.number ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 2),
        SizedBox(
          width: 60,
          child: Text(
            player.shortName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w600, shadows: [Shadow(blurRadius: 3, color: Colors.black54)]),
          ),
        ),
      ],
    );
  }
}

class _PitchPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1F7A3E), Color(0xFF2A8F4C)],
        ).createShader(rect),
    );
    final stripe = Paint()..color = Colors.white.withAlpha(12);
    final band = size.height / 10;
    for (var i = 0; i < 10; i += 2) {
      canvas.drawRect(Rect.fromLTWH(0, i * band, size.width, band), stripe);
    }
    final line = Paint()
      ..color = Colors.white.withAlpha(190)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    const inset = 8.0;
    final field = Rect.fromLTWH(inset, inset, size.width - inset * 2, size.height - inset * 2);
    canvas.drawRect(field, line);
    canvas.drawLine(Offset(field.left, size.height / 2), Offset(field.right, size.height / 2), line);
    canvas.drawCircle(Offset(size.width / 2, size.height / 2), size.width * 0.13, line);
    final boxW = field.width * 0.56;
    final boxH = field.height * 0.14;
    canvas.drawRect(Rect.fromLTWH((size.width - boxW) / 2, field.top, boxW, boxH), line);
    canvas.drawRect(Rect.fromLTWH((size.width - boxW) / 2, field.bottom - boxH, boxW, boxH), line);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
