import '../core/api_client.dart';
import 'models/json.dart';
import 'models/match.dart';
import 'models/news.dart';
import 'models/remote_config.dart';
import 'models/standings.dart';

/// All network calls for football data. The server normalises provider payloads,
/// so the app never depends on a specific data vendor.
class FootballRepository {
  FootballRepository(this._api);

  final ApiClient _api;

  /// Matches for the *local* calendar day: we send local midnight-to-midnight as UTC
  /// instants, so "Today" is right in every timezone (including DST change days).
  Future<List<MatchSummary>> matchesForDay(DateTime day) async {
    final start = DateTime(day.year, day.month, day.day);
    final end = DateTime(day.year, day.month, day.day + 1);
    final data = await _api.get('/matches', query: {
      'from': start.toUtc().toIso8601String(),
      'to': end.toUtc().toIso8601String(),
    });
    return parseList(asMap(data)['matches'], MatchSummary.fromJson);
  }

  Future<List<MatchSummary>> matchesByIds(Iterable<int> ids) async {
    if (ids.isEmpty) return const [];
    final data = await _api.get('/matches/by-ids', query: {'ids': ids.take(20).join(',')});
    return parseList(asMap(data)['matches'], MatchSummary.fromJson);
  }

  Future<MatchDetails> matchDetails(int id) async {
    // Stream sources are only served to registered devices, so make sure we have a session.
    try {
      await _api.ensureAuth();
    } catch (_) {/* offline: the request below reports the real error */}
    return MatchDetails.fromJson(asMap(await _api.get('/matches/$id')));
  }

  Future<List<LeagueInfo>> leagues() async =>
      parseList(asMap(await _api.get('/leagues'))['leagues'], LeagueInfo.fromJson);

  Future<List<StandingGroup>> standings(int leagueId) async =>
      parseList(asMap(await _api.get('/leagues/$leagueId/standings'))['groups'], StandingGroup.fromJson);

  Future<List<PlayerStat>> topScorers(int leagueId) async =>
      parseList(asMap(await _api.get('/leagues/$leagueId/top-scorers'))['players'], PlayerStat.fromJson);

  Future<List<PlayerStat>> topAssists(int leagueId) async =>
      parseList(asMap(await _api.get('/leagues/$leagueId/top-assists'))['players'], PlayerStat.fromJson);

  Future<RemoteConfig> remoteConfig() async => RemoteConfig.fromJson(asMap(await _api.get('/config')));

  Future<List<NewsArticle>> news() async =>
      parseList(asMap(await _api.get('/news', query: {'limit': 30}))['articles'], NewsArticle.fromJson);
}
