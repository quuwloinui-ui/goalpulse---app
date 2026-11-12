import 'package:flutter/material.dart';
import '../../l10n/strings.dart';

import '../../data/models/match.dart';
import '../../widgets/common.dart';
import 'stream_player.dart';

/// "Watch" tab: admin-curated sources for this match. Tap a source to switch the player.
class StreamsTab extends StatefulWidget {
  const StreamsTab({super.key, required this.details});

  final MatchDetails details;

  @override
  State<StreamsTab> createState() => _StreamsTabState();
}

class _StreamsTabState extends State<StreamsTab> {
  int _selectedId = -1;

  @override
  Widget build(BuildContext context) {
    final links = widget.details.streams;
    if (links.isEmpty) {
      return EmptyState(icon: Icons.live_tv_outlined, message: context.tr('streams_empty'));
    }
    final current = links.firstWhere((l) => l.id == _selectedId, orElse: () => links.first);

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: StreamPlayer(key: ValueKey(current.id), link: current),
          ),
        ),
        const SizedBox(height: 14),
        Text(context.tr('sources'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        for (final l in links)
          Card(
            elevation: 0,
            margin: const EdgeInsets.only(top: 8),
            child: ListTile(
              selected: l.id == current.id,
              leading: Icon(l.isHls ? Icons.play_circle_outline : Icons.language),
              title: Text(l.title),
              subtitle: Text([if (l.quality != null) l.quality!, if (l.language != null) l.language!].join('  ·  ')),
              trailing: l.id == current.id ? const Icon(Icons.check_circle) : null,
              onTap: () => setState(() => _selectedId = l.id),
            ),
          ),
      ],
    );
  }
}
