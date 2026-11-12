import 'json.dart';
import 'match.dart';

class LeagueInfo {
  const LeagueInfo({required this.id, required this.name, this.country, this.logo});

  final int id;
  final String name;
  final String? country;
  final String? logo;

  factory LeagueInfo.fromJson(Map<String, dynamic> j) => LeagueInfo(
        id: toInt(j['id']),
        name: (j['name'] ?? '') as String,
        country: j['country'] as String?,
        logo: j['logo'] as String?,
      );
}

class StandingRow {
  const StandingRow({
    required this.rank,
    required this.team,
    required this.played,
    required this.goalDiff,
    required this.points,
    this.description,
  });

  final int rank;
  final TeamRef team;
  final int played;
  final int goalDiff;
  final int points;
  final String? description;

  factory StandingRow.fromJson(Map<String, dynamic> j) => StandingRow(
        rank: toInt(j['rank']),
        team: TeamRef.fromJson(asMap(j['team'])),
        played: toInt(j['played']),
        goalDiff: toInt(j['goalDiff']),
        points: toInt(j['points']),
        description: j['description'] as String?,
      );
}

class StandingGroup {
  const StandingGroup({required this.name, required this.rows});

  final String name;
  final List<StandingRow> rows;

  factory StandingGroup.fromJson(Map<String, dynamic> j) => StandingGroup(
        name: (j['name'] ?? '') as String,
        rows: parseList(j['rows'], StandingRow.fromJson),
      );
}

class PlayerStat {
  const PlayerStat({
    required this.rank,
    required this.name,
    this.photo,
    required this.team,
    required this.goals,
    required this.assists,
    required this.played,
  });

  final int rank;
  final String name;
  final String? photo;
  final TeamRef team;
  final int goals;
  final int assists;
  final int played;

  factory PlayerStat.fromJson(Map<String, dynamic> j) {
    final player = asMap(j['player']);
    return PlayerStat(
      rank: toInt(j['rank']),
      name: (player['name'] ?? '') as String,
      photo: player['photo'] as String?,
      team: TeamRef.fromJson(asMap(j['team'])),
      goals: toInt(j['goals']),
      assists: toInt(j['assists']),
      played: toInt(j['played']),
    );
  }
}
