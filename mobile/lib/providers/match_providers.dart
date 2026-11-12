import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/format.dart';
import '../core/socket_service.dart';
import '../data/models/match.dart';
import 'app_providers.dart';

final selectedDateProvider = StateProvider<DateTime>((ref) => dateOnly(DateTime.now()));

enum HomeFilter { all, live, upcoming, finished, streams }

final homeFilterProvider = StateProvider<HomeFilter>((ref) => HomeFilter.all);

/// The day's matches. Patched in place by Socket.IO `live:update` events, with a slow
/// (10 minute) refresh as a safety net in case a message is missed.
class HomeMatchesNotifier extends AsyncNotifier<List<MatchSummary>> {
  @override
  Future<List<MatchSummary>> build() async {
    final day = ref.watch(selectedDateProvider);
    final socket = ref.read(socketServiceProvider);
    socket.subscribeLive();

    final sub = socket.liveUpdates.listen(_apply);
    ref.onDispose(sub.cancel);
    final timer = Timer.periodic(const Duration(minutes: 10), (_) => refresh());
    ref.onDispose(timer.cancel);

    return ref.read(footballRepositoryProvider).matchesForDay(day);
  }

  void _apply(List<LiveUpdate> updates) {
    final current = state.valueOrNull;
    if (current == null) return;
    final byId = {for (final u in updates) u.id: u};
    state = AsyncData([for (final m in current) byId[m.id]?.applyTo(m) ?? m]);
  }

  Future<void> refresh() async {
    try {
      final fresh = await ref.read(footballRepositoryProvider).matchesForDay(ref.read(selectedDateProvider));
      state = AsyncData(fresh);
    } catch (e, st) {
      if (!state.hasValue) state = AsyncError(e, st);
    }
  }
}

final homeMatchesProvider =
    AsyncNotifierProvider<HomeMatchesNotifier, List<MatchSummary>>(HomeMatchesNotifier.new);

class LeagueGroup {
  const LeagueGroup({required this.id, required this.name, this.logo, this.country, required this.matches});

  final int id;
  final String name;
  final String? logo;
  final String? country;
  final List<MatchSummary> matches;
}

int _leaguePriority(int id) {
  final i = AppConfig.leaguePriority.indexOf(id);
  return i == -1 ? 1000 : i;
}

/// Home list after applying the filter chip, grouped by league (featured leagues first).
final filteredGroupsProvider = Provider<List<LeagueGroup>>((ref) {
  final all = ref.watch(homeMatchesProvider).valueOrNull ?? const <MatchSummary>[];
  final filter = ref.watch(homeFilterProvider);

  final visible = all.where((m) {
    switch (filter) {
      case HomeFilter.all:
        return true;
      case HomeFilter.live:
        return m.status.isLive;
      case HomeFilter.upcoming:
        return m.status == MatchStatus.notStarted;
      case HomeFilter.finished:
        return m.status == MatchStatus.finished;
      case HomeFilter.streams:
        return m.hasStream;
    }
  });

  final byLeague = <int, List<MatchSummary>>{};
  for (final m in visible) {
    byLeague.putIfAbsent(m.leagueId, () => []).add(m);
  }
  final groups = [
    for (final e in byLeague.entries)
      LeagueGroup(
        id: e.key,
        name: e.value.first.leagueName,
        logo: e.value.first.leagueLogo,
        country: e.value.first.leagueCountry,
        matches: [...e.value]..sort((a, b) => a.kickoff.compareTo(b.kickoff)),
      ),
  ];
  groups.sort((a, b) {
    final byPriority = _leaguePriority(a.id).compareTo(_leaguePriority(b.id));
    return byPriority != 0 ? byPriority : a.name.compareTo(b.name);
  });
  return groups;
});

final liveCountProvider = Provider<int>(
  (ref) => (ref.watch(homeMatchesProvider).valueOrNull ?? const <MatchSummary>[]).where((m) => m.status.isLive).length,
);

/// Full match data. Joins the match's socket room and re-fetches (through the server's Redis
/// cache) the instant a goal / event / new stream source is announced, plus every 45 s so the
/// minute and statistics keep moving.
final matchDetailsProvider = FutureProvider.autoDispose.family<MatchDetails, int>((ref, id) async {
  final socket = ref.watch(socketServiceProvider);
  socket.joinMatch(id);
  ref.onDispose(() => socket.leaveMatch(id));

  final sub = socket.matchChanges(id).listen((_) => ref.invalidateSelf());
  ref.onDispose(sub.cancel);
  final timer = Timer.periodic(const Duration(seconds: 45), (_) => ref.invalidateSelf());
  ref.onDispose(timer.cancel);

  return ref.watch(footballRepositoryProvider).matchDetails(id);
});
