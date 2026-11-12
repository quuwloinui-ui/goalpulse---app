import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/standings.dart';
import 'app_providers.dart';

final leaguesProvider = FutureProvider<List<LeagueInfo>>(
  (ref) => ref.watch(footballRepositoryProvider).leagues(),
);

/// null = first league in the list.
final selectedLeagueProvider = StateProvider<int?>((ref) => null);

final standingsProvider = FutureProvider.autoDispose.family<List<StandingGroup>, int>(
  (ref, leagueId) => ref.watch(footballRepositoryProvider).standings(leagueId),
);

final topScorersProvider = FutureProvider.autoDispose.family<List<PlayerStat>, int>(
  (ref, leagueId) => ref.watch(footballRepositoryProvider).topScorers(leagueId),
);

final topAssistsProvider = FutureProvider.autoDispose.family<List<PlayerStat>, int>(
  (ref, leagueId) => ref.watch(footballRepositoryProvider).topAssists(leagueId),
);
