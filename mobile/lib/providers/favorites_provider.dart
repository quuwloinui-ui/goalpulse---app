import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/push_service.dart';
import '../core/storage.dart';
import '../data/models/json.dart';
import '../data/models/match.dart';
import 'app_providers.dart';

class FavoriteTeam {
  const FavoriteTeam({required this.id, required this.name, this.logo});

  final int id;
  final String name;
  final String? logo;

  TeamRef get ref => TeamRef(id: id, name: name, logo: logo);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'logo': logo};

  factory FavoriteTeam.fromJson(Map<String, dynamic> j) =>
      FavoriteTeam(id: toInt(j['id']), name: (j['name'] ?? '') as String, logo: j['logo'] as String?);
}

class FavoritesState {
  const FavoritesState({this.teams = const {}, this.matchIds = const {}});

  final Map<int, FavoriteTeam> teams;
  final Set<int> matchIds;

  FavoritesState copyWith({Map<int, FavoriteTeam>? teams, Set<int>? matchIds}) =>
      FavoritesState(teams: teams ?? this.teams, matchIds: matchIds ?? this.matchIds);
}

/// Favourites live on the device (instant UI), are mirrored to the server (survive reinstalls)
/// and drive FCM topic subscriptions (team_{id} / match_{id}) for goal and kick-off alerts.
class FavoritesNotifier extends Notifier<FavoritesState> {
  static const _kTeams = 'fav.teams';
  static const _kMatches = 'fav.matches';

  SharedPreferences get _prefs => ref.read(sharedPrefsProvider);

  @override
  FavoritesState build() {
    final teams = <int, FavoriteTeam>{};
    try {
      final raw = _prefs.getString(_kTeams);
      if (raw != null) {
        for (final e in jsonDecode(raw) as List) {
          final t = FavoriteTeam.fromJson(asMap(e));
          teams[t.id] = t;
        }
      }
    } catch (_) {}
    final ids = (_prefs.getStringList(_kMatches) ?? const <String>[]).map(int.tryParse).whereType<int>().toSet();
    return FavoritesState(teams: teams, matchIds: ids);
  }

  Future<void> _persist() async {
    await _prefs.setString(_kTeams, jsonEncode(state.teams.values.map((t) => t.toJson()).toList()));
    await _prefs.setStringList(_kMatches, state.matchIds.map((e) => '$e').toList());
  }

  Future<void> _sync(Future<void> Function() job) async {
    try {
      await job();
    } catch (_) {/* best effort: local state is the source of truth for the UI */}
  }

  Future<void> toggleTeam(TeamRef team) async {
    final push = ref.read(pushServiceProvider);
    final api = ref.read(apiClientProvider);
    final teams = Map<int, FavoriteTeam>.from(state.teams);
    final adding = !teams.containsKey(team.id);
    if (adding) {
      teams[team.id] = FavoriteTeam(id: team.id, name: team.name, logo: team.logo);
    } else {
      teams.remove(team.id);
    }
    state = state.copyWith(teams: teams);
    await _persist();

    if (adding) {
      unawaited(push.followTeam(team.id));
      unawaited(_sync(() async {
        await api.ensureAuth();
        await api.put('/me/favorites/teams/${team.id}', data: {'name': team.name, 'logo': team.logo});
      }));
    } else {
      unawaited(push.unfollowTeam(team.id));
      unawaited(_sync(() async {
        await api.ensureAuth();
        await api.delete('/me/favorites/teams/${team.id}');
      }));
    }
  }

  Future<void> toggleMatch(MatchSummary match) async {
    final push = ref.read(pushServiceProvider);
    final api = ref.read(apiClientProvider);
    final ids = {...state.matchIds};
    final adding = ids.add(match.id);
    if (!adding) ids.remove(match.id);
    state = state.copyWith(matchIds: ids);
    await _persist();

    if (adding) {
      unawaited(push.followMatch(match.id));
      unawaited(_sync(() async {
        await api.ensureAuth();
        await api.put('/me/favorites/matches/${match.id}', data: {
          'homeName': match.home.name,
          'awayName': match.away.name,
          'kickoffAt': match.kickoff.toUtc().toIso8601String(),
        });
      }));
    } else {
      unawaited(push.unfollowMatch(match.id));
      unawaited(_sync(() async {
        await api.ensureAuth();
        await api.delete('/me/favorites/matches/${match.id}');
      }));
    }
  }

  /// Used when the account is deleted: forget everything locally and stop every alert.
  Future<void> clearAll() async {
    final push = ref.read(pushServiceProvider);
    for (final id in state.teams.keys) {
      unawaited(push.unfollowTeam(id));
    }
    for (final id in state.matchIds) {
      unawaited(push.unfollowMatch(id));
    }
    state = const FavoritesState();
    await _persist();
  }

  /// After a reinstall the device has no favourites locally: pull them from the server
  /// and re-subscribe to their topics.
  Future<void> restoreFromServer() async {
    await _sync(() async {
      final api = ref.read(apiClientProvider);
      final push = ref.read(pushServiceProvider);
      final data = asMap(await api.get('/me/favorites'));

      final teams = Map<int, FavoriteTeam>.from(state.teams);
      for (final j in (data['teams'] as List? ?? const [])) {
        final m = asMap(j);
        final id = toInt(m['teamId']);
        if (id > 0 && !teams.containsKey(id)) {
          teams[id] = FavoriteTeam(id: id, name: (m['name'] ?? '') as String, logo: m['logo'] as String?);
          unawaited(push.followTeam(id));
        }
      }
      final ids = {...state.matchIds};
      for (final j in (data['matches'] as List? ?? const [])) {
        final id = toInt(asMap(j)['fixtureId']);
        if (id > 0 && ids.add(id)) unawaited(push.followMatch(id));
      }
      state = state.copyWith(teams: teams, matchIds: ids);
      await _persist();
    });
  }
}

final favoritesProvider = NotifierProvider<FavoritesNotifier, FavoritesState>(FavoritesNotifier.new);

/// Live data for the followed matches (Favorites tab).
final savedMatchesProvider = FutureProvider.autoDispose<List<MatchSummary>>((ref) async {
  final ids = ref.watch(favoritesProvider.select((s) => s.matchIds));
  final list = await ref.watch(footballRepositoryProvider).matchesByIds(ids);
  return [...list]..sort((a, b) => a.kickoff.compareTo(b.kickoff));
});
