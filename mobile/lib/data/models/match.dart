import 'json.dart';

enum MatchStatus {
  notStarted,
  live,
  halfTime,
  finished,
  postponed,
  cancelled,
  suspended,
  unknown;

  static MatchStatus parse(String? v) {
    switch (v) {
      case 'NOT_STARTED':
        return MatchStatus.notStarted;
      case 'LIVE':
        return MatchStatus.live;
      case 'HALF_TIME':
        return MatchStatus.halfTime;
      case 'FINISHED':
        return MatchStatus.finished;
      case 'POSTPONED':
        return MatchStatus.postponed;
      case 'CANCELLED':
        return MatchStatus.cancelled;
      case 'SUSPENDED':
        return MatchStatus.suspended;
      default:
        return MatchStatus.unknown;
    }
  }

  bool get isLive => this == MatchStatus.live || this == MatchStatus.halfTime;
}

class TeamRef {
  const TeamRef({required this.id, required this.name, this.logo});

  final int id;
  final String name;
  final String? logo;

  factory TeamRef.fromJson(Map<String, dynamic> j) =>
      TeamRef(id: toInt(j['id']), name: (j['name'] ?? '') as String, logo: j['logo'] as String?);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'logo': logo};
}

class MatchSummary {
  const MatchSummary({
    required this.id,
    required this.leagueId,
    required this.leagueName,
    this.leagueLogo,
    this.leagueCountry,
    this.round,
    required this.kickoff,
    required this.status,
    this.minute,
    required this.home,
    required this.away,
    this.homeGoals,
    this.awayGoals,
    this.venue,
    this.referee,
    this.hasStream = false,
  });

  final int id;
  final int leagueId;
  final String leagueName;
  final String? leagueLogo;
  final String? leagueCountry;
  final String? round;

  /// Already converted to the device's local timezone.
  final DateTime kickoff;
  final MatchStatus status;
  final int? minute;
  final TeamRef home;
  final TeamRef away;
  final int? homeGoals;
  final int? awayGoals;
  final String? venue;
  final String? referee;
  final bool hasStream;

  bool get hasScore => homeGoals != null && awayGoals != null;

  factory MatchSummary.fromJson(Map<String, dynamic> j) {
    final score = j['score'] is Map ? asMap(j['score']) : const <String, dynamic>{};
    return MatchSummary(
      id: toInt(j['id']),
      leagueId: toInt(j['leagueId']),
      leagueName: (j['leagueName'] ?? '') as String,
      leagueLogo: j['leagueLogo'] as String?,
      leagueCountry: j['leagueCountry'] as String?,
      round: j['round'] as String?,
      kickoff: DateTime.parse(j['kickoff'] as String).toLocal(),
      status: MatchStatus.parse(j['status'] as String?),
      minute: (j['minute'] as num?)?.toInt(),
      home: TeamRef.fromJson(asMap(j['home'])),
      away: TeamRef.fromJson(asMap(j['away'])),
      homeGoals: (score['home'] as num?)?.toInt(),
      awayGoals: (score['away'] as num?)?.toInt(),
      venue: j['venue'] as String?,
      referee: j['referee'] as String?,
      hasStream: (j['hasStream'] as bool?) ?? false,
    );
  }

  MatchSummary copyWith({MatchStatus? status, int? minute, int? homeGoals, int? awayGoals, bool? hasStream}) =>
      MatchSummary(
        id: id,
        leagueId: leagueId,
        leagueName: leagueName,
        leagueLogo: leagueLogo,
        leagueCountry: leagueCountry,
        round: round,
        kickoff: kickoff,
        status: status ?? this.status,
        minute: minute ?? this.minute,
        home: home,
        away: away,
        homeGoals: homeGoals ?? this.homeGoals,
        awayGoals: awayGoals ?? this.awayGoals,
        venue: venue,
        referee: referee,
        hasStream: hasStream ?? this.hasStream,
      );
}

/// kind: goal | own_goal | penalty | missed_penalty | yellow_card | red_card | second_yellow | substitution | var
/// [player] is the main actor (for a substitution: the player going off); [related] is the assist
/// (for a substitution: the player coming on).
class MatchEvent {
  const MatchEvent({
    required this.minute,
    this.extra,
    required this.teamId,
    required this.type,
    required this.kind,
    this.player,
    this.related,
  });

  final int minute;
  final int? extra;
  final int teamId;
  final String type;
  final String kind;
  final String? player;
  final String? related;

  String get clock => (extra != null && extra! > 0) ? "$minute+$extra'" : "$minute'";

  factory MatchEvent.fromJson(Map<String, dynamic> j) => MatchEvent(
        minute: toInt(j['minute']),
        extra: (j['extra'] as num?)?.toInt(),
        teamId: toInt(j['teamId']),
        type: (j['type'] ?? 'OTHER') as String,
        kind: (j['kind'] ?? 'other') as String,
        player: j['player'] as String?,
        related: j['related'] as String?,
      );
}

class LineupPlayer {
  const LineupPlayer({this.id, required this.name, this.number, this.pos, this.grid});

  final int? id;
  final String name;
  final int? number;
  final String? pos;

  /// "row:column" as delivered by the provider (row 1 = goalkeeper).
  final String? grid;

  int? get gridRow => _gridPart(0);
  int? get gridCol => _gridPart(1);

  int? _gridPart(int i) {
    final parts = grid?.split(':');
    if (parts == null || parts.length != 2) return null;
    return int.tryParse(parts[i]);
  }

  String get shortName {
    final bits = name.trim().split(RegExp(r'\s+'));
    return bits.isEmpty ? name : bits.last;
  }

  factory LineupPlayer.fromJson(Map<String, dynamic> j) => LineupPlayer(
        id: (j['id'] as num?)?.toInt(),
        name: (j['name'] ?? '') as String,
        number: (j['number'] as num?)?.toInt(),
        pos: j['pos'] as String?,
        grid: j['grid'] as String?,
      );
}

class TeamLineup {
  const TeamLineup({required this.team, this.formation, this.coach, required this.startXI, required this.subs});

  final TeamRef team;
  final String? formation;
  final String? coach;
  final List<LineupPlayer> startXI;
  final List<LineupPlayer> subs;

  bool get hasGrid => startXI.isNotEmpty && startXI.where((p) => p.gridRow != null).length >= startXI.length - 1;

  factory TeamLineup.fromJson(Map<String, dynamic> j) => TeamLineup(
        team: TeamRef.fromJson(asMap(j['team'])),
        formation: j['formation'] as String?,
        coach: j['coach'] as String?,
        startXI: parseList(j['startXI'], LineupPlayer.fromJson),
        subs: parseList(j['subs'], LineupPlayer.fromJson),
      );
}

class StatRow {
  const StatRow({required this.label, required this.home, required this.away});

  final String label;
  final String home;
  final String away;

  double get homeValue => _num(home);
  double get awayValue => _num(away);

  static double _num(String s) => double.tryParse(s.replaceAll('%', '').trim()) ?? 0;

  factory StatRow.fromJson(Map<String, dynamic> j) => StatRow(
        label: (j['label'] ?? '') as String,
        home: '${j['home'] ?? 0}',
        away: '${j['away'] ?? 0}',
      );
}

class StreamLink {
  const StreamLink({required this.id, required this.title, required this.url, required this.type, this.quality, this.language});

  final int id;
  final String title;
  final String url;

  /// HLS (native player) or WEBVIEW (embedded page).
  final String type;
  final String? quality;
  final String? language;

  bool get isHls => type == 'HLS';

  factory StreamLink.fromJson(Map<String, dynamic> j) => StreamLink(
        id: toInt(j['id']),
        title: (j['title'] ?? '') as String,
        url: (j['url'] ?? '') as String,
        type: (j['type'] ?? 'HLS') as String,
        quality: j['quality'] as String?,
        language: j['language'] as String?,
      );
}

class MatchDetails {
  const MatchDetails({
    required this.match,
    required this.events,
    required this.lineups,
    required this.stats,
    required this.streams,
  });

  final MatchSummary match;
  final List<MatchEvent> events;
  final List<TeamLineup> lineups;
  final List<StatRow> stats;
  final List<StreamLink> streams;

  factory MatchDetails.fromJson(Map<String, dynamic> j) => MatchDetails(
        match: MatchSummary.fromJson(j),
        events: parseList(j['events'], MatchEvent.fromJson),
        lineups: parseList(j['lineups'], TeamLineup.fromJson),
        stats: parseList(j['statistics'], StatRow.fromJson),
        streams: parseList(j['streams'], StreamLink.fromJson),
      );
}
