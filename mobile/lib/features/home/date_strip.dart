import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/format.dart';
import '../../providers/match_providers.dart';
import '../../core/theme.dart';

/// Horizontal day slider: Yesterday / Today / Tomorrow and +-30 days (the calendar button
/// in the app bar jumps to any day in that range).
class DateStrip extends ConsumerStatefulWidget {
  const DateStrip({super.key});

  static const range = 30;

  @override
  ConsumerState<DateStrip> createState() => _DateStripState();
}

class _DateStripState extends ConsumerState<DateStrip> {
  static const _itemWidth = 68.0;

  final _controller = ScrollController();
  late final DateTime _today = dateOnly(DateTime.now());

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _center(animate: false));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _center({required bool animate}) {
    if (!_controller.hasClients) return;
    final index = daysBetween(ref.read(selectedDateProvider), _today) + DateStrip.range;
    final position = _controller.position;
    final target = (index * _itemWidth - position.viewportDimension / 2 + _itemWidth / 2)
        .clamp(0.0, position.maxScrollExtent)
        .toDouble();
    if (animate) {
      _controller.animateTo(target, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else {
      _controller.jumpTo(target);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(selectedDateProvider);
    ref.listen<DateTime>(selectedDateProvider, (_, __) => _center(animate: true));
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      height: 76,
      child: ListView.builder(
        controller: _controller,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        itemExtent: _itemWidth,
        itemCount: DateStrip.range * 2 + 1,
        itemBuilder: (context, i) {
          final day = addDays(_today, i - DateStrip.range);
          final isSelected = day == selected;
          final fg = isSelected ? scheme.onPrimary : scheme.onSurface;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
            child: Material(
              color: isSelected ? scheme.primary : context.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => ref.read(selectedDateProvider.notifier).state = day,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(dayLabel(context, day, _today), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
                    const SizedBox(height: 2),
                    Text('${day.day}', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: fg)),
                    Text(DateFormat.MMM().format(day), style: TextStyle(fontSize: 10, color: fg.withAlpha(190))),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
