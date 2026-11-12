import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../providers/app_providers.dart';
import '../../providers/match_providers.dart';
import '../../widgets/banner_card.dart';
import '../../widgets/common.dart';
import 'date_strip.dart';
import 'league_section.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(homeMatchesProvider);
    final groups = ref.watch(filteredGroupsProvider);
    final config = ref.watch(remoteConfigProvider).valueOrNull;
    final banner = config?.banners.where((b) => b.placement == 'HOME_TOP').firstOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('GoalPulse'),
        actions: [
          IconButton(
            tooltip: context.tr('pick_date'),
            icon: const Icon(Icons.calendar_month_outlined),
            onPressed: () async {
              final today = dateOnly(DateTime.now());
              final picked = await showDatePicker(
                context: context,
                initialDate: ref.read(selectedDateProvider),
                firstDate: addDays(today, -DateStrip.range),
                lastDate: addDays(today, DateStrip.range),
              );
              if (picked != null) ref.read(selectedDateProvider.notifier).state = dateOnly(picked);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          const DateStrip(),
          const _FilterBar(),
          Expanded(
            child: matches.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(homeMatchesProvider)),
              data: (_) => RefreshIndicator(
                onRefresh: () => ref.read(homeMatchesProvider.notifier).refresh(),
                // Slivers build league blocks lazily as they scroll into view.
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    if (banner != null)
                      SliverToBoxAdapter(
                        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: BannerCard(banner: banner)),
                      ),
                    if (groups.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: EmptyState(icon: Icons.sports_soccer, message: context.tr('no_matches')),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (context, i) => LeagueSection(group: groups[i]),
                            childCount: groups.length,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(homeFilterProvider);
    final live = ref.watch(liveCountProvider);
    final streamsOn = ref.watch(featuresProvider)['streams'] ?? true;
    final items = <(HomeFilter, String)>[
      (HomeFilter.all, context.tr('filter_all')),
      (HomeFilter.live, live > 0 ? context.tr('filter_live_n', {'n': '$live'}) : context.tr('filter_live')),
      (HomeFilter.upcoming, context.tr('filter_upcoming')),
      (HomeFilter.finished, context.tr('filter_finished')),
      if (streamsOn) (HomeFilter.streams, context.tr('filter_streams')),
    ];
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (filter, label) = items[i];
          return ChoiceChip(
            label: Text(label),
            selected: current == filter,
            onSelected: (_) => ref.read(homeFilterProvider.notifier).state = filter,
          );
        },
      ),
    );
  }
}
