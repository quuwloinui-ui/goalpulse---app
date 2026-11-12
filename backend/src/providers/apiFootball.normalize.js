'use strict';
/** Pure functions: API-Football v3 payloads -> GoalPulse normalised shapes. */

const STATUS = {
  TBD: 'NOT_STARTED', NS: 'NOT_STARTED',
  '1H': 'LIVE', '2H': 'LIVE', ET: 'LIVE', BT: 'LIVE', P: 'LIVE', LIVE: 'LIVE',
  HT: 'HALF_TIME',
  FT: 'FINISHED', AET: 'FINISHED', PEN: 'FINISHED', AWD: 'FINISHED', WO: 'FINISHED',
  PST: 'POSTPONED',
  CANC: 'CANCELLED', ABD: 'CANCELLED',
  SUSP: 'SUSPENDED', INT: 'SUSPENDED',
};
const mapStatus = (short) => STATUS[short] || 'UNKNOWN';

const team = (t) => ({ id: t?.id ?? 0, name: t?.name ?? '', logo: t?.logo ?? null });

function normalizeFixture(item) {
  const f = item.fixture || {};
  const l = item.league || {};
  const t = item.teams || {};
  const g = item.goals || {};
  const short = f.status?.short;
  return {
    id: f.id,
    leagueId: l.id,
    leagueName: l.name,
    leagueLogo: l.logo ?? null,
    leagueCountry: l.country ?? null,
    round: l.round ?? null,
    season: l.season ?? null,
    kickoff: new Date(f.date).toISOString(),
    status: mapStatus(short),
    statusShort: short ?? null,
    minute: f.status?.elapsed ?? null,
    extra: f.status?.extra ?? null,
    home: team(t.home),
    away: team(t.away),
    score: { home: g.home ?? null, away: g.away ?? null },
    venue: f.venue?.name ?? null,
    city: f.venue?.city ?? null,
    referee: f.referee ?? null,
  };
}

function eventKind(type, detail = '') {
  const d = String(detail).toLowerCase();
  if (type === 'Goal') {
    if (d.includes('own')) return 'own_goal';
    if (d.includes('missed')) return 'missed_penalty';
    if (d.includes('penalty')) return 'penalty';
    return 'goal';
  }
  if (type === 'Card') {
    if (d.includes('second yellow')) return 'second_yellow';
    if (d.includes('red')) return 'red_card';
    return 'yellow_card';
  }
  if (type === 'subst') return 'substitution';
  if (type === 'Var') return 'var';
  return 'other';
}
const EVENT_TYPE = { Goal: 'GOAL', Card: 'CARD', subst: 'SUBST', Var: 'VAR' };

/** player = main actor (scorer / carded / player going OFF); related = assist / player coming ON. */
function normalizeEvents(events) {
  return (events || []).map((e) => ({
    minute: e.time?.elapsed ?? 0,
    extra: e.time?.extra ?? null,
    teamId: e.team?.id ?? null,
    type: EVENT_TYPE[e.type] || 'OTHER',
    kind: eventKind(e.type, e.detail),
    detail: e.detail ?? null,
    player: e.player?.name ?? null,
    related: e.assist?.name ?? null,
    comments: e.comments ?? null,
  }));
}

const player = (p) => ({ id: p?.id ?? null, name: p?.name ?? '', number: p?.number ?? null, pos: p?.pos ?? null, grid: p?.grid ?? null });

function normalizeLineups(lineups) {
  return (lineups || []).map((l) => ({
    team: team(l.team),
    formation: l.formation ?? null,
    coach: l.coach?.name ?? null,
    startXI: (l.startXI || []).map((x) => player(x.player)),
    subs: (l.substitutes || []).map((x) => player(x.player)),
  }));
}

function normalizeStatistics(stats, homeId) {
  if (!Array.isArray(stats) || stats.length < 2) return [];
  const home = stats.find((s) => s.team?.id === homeId) || stats[0];
  const away = stats.find((s) => s !== home) || stats[1];
  const fmt = (v) => (v === null || v === undefined ? '0' : String(v));
  return (home.statistics || []).map((row) => ({
    label: row.type,
    home: fmt(row.value),
    away: fmt((away.statistics || []).find((x) => x.type === row.type)?.value),
  }));
}

function normalizeDetails(item) {
  return {
    ...normalizeFixture(item),
    events: normalizeEvents(item.events),
    lineups: normalizeLineups(item.lineups),
    statistics: normalizeStatistics(item.statistics, item.teams?.home?.id),
  };
}

function normalizeStandings(response) {
  const league = response?.[0]?.league;
  if (!league) return { league: null, groups: [] };
  const groups = (league.standings || []).map((rows) => ({
    name: rows[0]?.group ?? '',
    rows: rows.map((r) => ({
      rank: r.rank,
      team: team(r.team),
      played: r.all?.played ?? 0,
      win: r.all?.win ?? 0,
      draw: r.all?.draw ?? 0,
      lose: r.all?.lose ?? 0,
      goalsFor: r.all?.goals?.for ?? 0,
      goalsAgainst: r.all?.goals?.against ?? 0,
      goalDiff: r.goalsDiff ?? 0,
      points: r.points ?? 0,
      form: r.form ?? '',
      description: r.description ?? null,
    })),
  }));
  return { league: { id: league.id, name: league.name, logo: league.logo ?? null, season: league.season }, groups };
}

function normalizeTopPlayers(response) {
  return (response || []).map((item, i) => {
    const s = item.statistics?.[0] || {};
    return {
      rank: i + 1,
      player: { id: item.player?.id ?? null, name: item.player?.name ?? '', photo: item.player?.photo ?? null },
      team: team(s.team),
      goals: s.goals?.total ?? 0,
      assists: s.goals?.assists ?? 0,
      played: s.games?.appearences ?? 0,
    };
  });
}

module.exports = {
  mapStatus, normalizeFixture, normalizeEvents, normalizeLineups, normalizeStatistics,
  normalizeDetails, normalizeStandings, normalizeTopPlayers, eventKind,
};
