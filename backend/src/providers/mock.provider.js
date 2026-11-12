'use strict';
const { FootballProvider } = require('./base');
const { utcDate, fallbackSeason } = require('../utils/time');

/**
 * Deterministic, time-driven simulation so the whole stack (REST, sockets, push dry-run,
 * mobile UI) can be exercised without an API key. Every UTC day has 16 fixtures kicking off
 * every 90 minutes, so there is always something live. Fixture id = YYYYMMDD*100 + slot.
 */
const SLOTS = 16;
const SLOT_MIN = 90;
const media = (type, id) => `https://media.api-sports.io/football/${type}/${id}.png`;

const LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England', teams: [[33, 'Manchester United'], [40, 'Liverpool'], [42, 'Arsenal'], [49, 'Chelsea'], [50, 'Manchester City'], [47, 'Tottenham']] },
  { id: 140, name: 'La Liga', country: 'Spain', teams: [[541, 'Real Madrid'], [529, 'Barcelona'], [530, 'Atletico Madrid'], [536, 'Sevilla'], [532, 'Valencia'], [533, 'Villarreal']] },
  { id: 135, name: 'Serie A', country: 'Italy', teams: [[496, 'Juventus'], [489, 'AC Milan'], [505, 'Inter'], [492, 'Napoli'], [497, 'AS Roma'], [487, 'Lazio']] },
  { id: 78, name: 'Bundesliga', country: 'Germany', teams: [[157, 'Bayern Munich'], [165, 'Borussia Dortmund'], [168, 'Bayer Leverkusen'], [173, 'RB Leipzig'], [169, 'Eintracht Frankfurt'], [172, 'VfB Stuttgart']] },
  { id: 2, name: 'UEFA Champions League', country: 'Europe', teams: [[541, 'Real Madrid'], [157, 'Bayern Munich'], [50, 'Manchester City'], [85, 'Paris Saint Germain'], [505, 'Inter'], [529, 'Barcelona']] },
];
const SURNAMES = ['Silva', 'Rossi', 'Fernandez', 'Muller', 'Dubois', 'Okafor', 'Haddad', 'Novak', 'Lindqvist', 'Costa', 'Mensah', 'Tanaka', 'Petrov', 'Alvarez', 'Keita', 'Moretti'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const person = (r) => `${String.fromCharCode(65 + Math.floor(r() * 26))}. ${SURNAMES[Math.floor(r() * SURNAMES.length)]}`;
const asTeam = ([id, name]) => ({ id, name, logo: media('teams', id) });
const season = () => fallbackSeason();

function parseId(id) {
  const dayNum = Math.floor(id / 100);
  const slot = id % 100;
  const s = String(dayNum);
  if (s.length !== 8 || slot >= SLOTS) return null;
  const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? null : { dayNum, slot, t };
}

function plan(id) {
  const p = parseId(id);
  if (!p) return null;
  const r = rng(id);
  const league = LEAGUES[(p.dayNum + p.slot) % LEAGUES.length];
  const i = Math.floor(r() * league.teams.length);
  let j = Math.floor(r() * (league.teams.length - 1));
  if (j >= i) j += 1;
  const goals = [];
  const n = Math.floor(r() * 5);
  for (let k = 0; k < n; k++) {
    goals.push({ minute: 1 + Math.floor(r() * 89), side: r() < 0.55 ? 'home' : 'away', scorer: person(r), assist: person(r) });
  }
  goals.sort((a, b) => a.minute - b.minute);
  const cards = [0, 1].map(() => ({ minute: 10 + Math.floor(r() * 75), side: r() < 0.5 ? 'home' : 'away', player: person(r), red: r() < 0.12 }));
  const subs = [0, 1, 2].map(() => ({ minute: 55 + Math.floor(r() * 30), side: r() < 0.5 ? 'home' : 'away', out: person(r), in: person(r) }));
  return { id, league, kickoff: p.t + p.slot * SLOT_MIN * 60000, home: league.teams[i], away: league.teams[j], goals, cards, subs };
}

/** gm = game minute used to evaluate score/events (-1 before kick-off). */
function clock(kickoff, now) {
  const m = (now - kickoff) / 60000;
  if (m < 0) return { status: 'NOT_STARTED', short: 'NS', minute: null, gm: -1 };
  if (m < 45) { const mm = Math.max(1, Math.ceil(m)); return { status: 'LIVE', short: '1H', minute: mm, gm: mm }; }
  if (m < 60) return { status: 'HALF_TIME', short: 'HT', minute: 45, gm: 45 };
  if (m < 105) { const mm = Math.min(90, 45 + Math.ceil(m - 60)); return { status: 'LIVE', short: '2H', minute: mm, gm: mm }; }
  return { status: 'FINISHED', short: 'FT', minute: 90, gm: 90 };
}

function toFixture(p, now) {
  const c = clock(p.kickoff, now);
  const started = c.gm >= 0;
  const scored = p.goals.filter((g) => g.minute <= c.gm);
  const h = scored.filter((g) => g.side === 'home').length;
  return {
    id: p.id,
    leagueId: p.league.id,
    leagueName: p.league.name,
    leagueLogo: media('leagues', p.league.id),
    leagueCountry: p.league.country,
    round: 'Regular Season - 10',
    season: season(),
    kickoff: new Date(p.kickoff).toISOString(),
    status: c.status,
    statusShort: c.short,
    minute: c.minute,
    extra: null,
    home: asTeam(p.home),
    away: asTeam(p.away),
    score: { home: started ? h : null, away: started ? scored.length - h : null },
    venue: `${p.home[1]} Stadium`,
    city: null,
    referee: 'M. Oliver',
  };
}

function eventsFor(p, gm) {
  const side = (s) => (s === 'home' ? p.home : p.away)[0];
  const ev = [];
  for (const g of p.goals) if (g.minute <= gm) ev.push({ minute: g.minute, extra: null, teamId: side(g.side), type: 'GOAL', kind: 'goal', detail: 'Normal Goal', player: g.scorer, related: g.assist, comments: null });
  for (const c of p.cards) if (c.minute <= gm) ev.push({ minute: c.minute, extra: null, teamId: side(c.side), type: 'CARD', kind: c.red ? 'red_card' : 'yellow_card', detail: c.red ? 'Red Card' : 'Yellow Card', player: c.player, related: null, comments: null });
  for (const s of p.subs) if (s.minute <= gm) ev.push({ minute: s.minute, extra: null, teamId: side(s.side), type: 'SUBST', kind: 'substitution', detail: 'Substitution', player: s.out, related: s.in, comments: null });
  return ev.sort((a, b) => a.minute - b.minute);
}

function lineupFor(teamTuple, seed) {
  const r = rng(seed);
  const slots = [['G', '1:1'], ['D', '2:1'], ['D', '2:2'], ['D', '2:3'], ['D', '2:4'], ['M', '3:1'], ['M', '3:2'], ['M', '3:3'], ['F', '4:1'], ['F', '4:2'], ['F', '4:3']];
  return {
    team: asTeam(teamTuple),
    formation: '4-3-3',
    coach: person(r),
    startXI: slots.map(([pos, grid], i) => ({ id: seed * 100 + i, name: person(r), number: i + 1, pos, grid })),
    subs: Array.from({ length: 7 }, (_, i) => ({ id: seed * 100 + 20 + i, name: person(r), number: 12 + i, pos: i === 0 ? 'G' : 'M', grid: null })),
  };
}

function statsFor(p, gm) {
  const r = rng(p.id + 7);
  const share = Math.max(gm, 0) / 90;
  const n = (max) => Math.round(r() * max * share);
  const pair = (label, h, a, sfx = '') => ({ label, home: `${h}${sfx}`, away: `${a}${sfx}` });
  const possession = 40 + Math.floor(r() * 21);
  return [
    pair('Ball Possession', possession, 100 - possession, '%'),
    pair('Total Shots', n(18), n(18)),
    pair('Shots on Goal', n(8), n(8)),
    pair('Corner Kicks', n(9), n(9)),
    pair('Fouls', n(16), n(16)),
    pair('Offsides', n(5), n(5)),
    pair('Yellow Cards', n(3), n(3)),
  ];
}

const leagueOf = (id) => LEAGUES.find((l) => l.id === id) || LEAGUES[0];

class MockProvider extends FootballProvider {
  get name() {
    return 'mock';
  }

  async getFixturesByDate(dateUtc) {
    const dayNum = Number(String(dateUtc).replace(/-/g, ''));
    const now = Date.now();
    return Array.from({ length: SLOTS }, (_, slot) => toFixture(plan(dayNum * 100 + slot), now)).filter(Boolean);
  }

  async getFixturesByIds(ids) {
    const now = Date.now();
    return ids
      .map((id) => plan(id))
      .filter(Boolean)
      .map((p) => ({ ...toFixture(p, now), events: eventsFor(p, clock(p.kickoff, now).gm) }));
  }

  async getLiveFixtures() {
    const now = Date.now();
    const out = [];
    for (const date of [utcDate(now - 86400000), utcDate(now)]) {
      const dayNum = Number(date.replace(/-/g, ''));
      for (let slot = 0; slot < SLOTS; slot++) {
        const p = plan(dayNum * 100 + slot);
        const f = toFixture(p, now);
        if (f.status === 'LIVE' || f.status === 'HALF_TIME') out.push({ ...f, events: eventsFor(p, clock(p.kickoff, now).gm) });
      }
    }
    return out;
  }

  async getFixtureDetails(id) {
    const p = plan(id);
    if (!p) return null;
    const now = Date.now();
    const c = clock(p.kickoff, now);
    return {
      ...toFixture(p, now),
      events: eventsFor(p, c.gm),
      lineups: p.kickoff - now < 3600000 ? [lineupFor(p.home, id * 2), lineupFor(p.away, id * 2 + 1)] : [],
      statistics: c.gm >= 0 ? statsFor(p, c.gm) : [],
    };
  }

  async getStandings(leagueId) {
    const league = leagueOf(leagueId);
    const r = rng(league.id * 31);
    const rows = league.teams.map((t) => {
      const played = 10;
      const win = Math.floor(r() * 8);
      const draw = Math.floor(r() * (played - win));
      const lose = played - win - draw;
      const goalsFor = win * 2 + draw + Math.floor(r() * 6);
      const goalsAgainst = lose * 2 + draw + Math.floor(r() * 4);
      return { rank: 0, team: asTeam(t), played, win, draw, lose, goalsFor, goalsAgainst, goalDiff: goalsFor - goalsAgainst, points: win * 3 + draw, form: 'WDLWW', description: null };
    });
    rows.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff);
    rows.forEach((row, i) => { row.rank = i + 1; });
    rows[0].description = 'Promotion - Champions League (Group Stage)';
    rows[rows.length - 1].description = 'Relegation - Championship';
    return { league: { id: league.id, name: league.name, logo: media('leagues', league.id), season: season() }, groups: [{ name: league.name, rows }] };
  }

  _top(leagueId, key) {
    const league = leagueOf(leagueId);
    const r = rng(league.id * 17 + (key === 'goals' ? 1 : 2));
    const list = Array.from({ length: 10 }, (_, i) => ({
      rank: 0,
      player: { id: league.id * 1000 + i, name: person(r), photo: null },
      team: asTeam(league.teams[i % league.teams.length]),
      goals: 3 + Math.floor(r() * 10),
      assists: 1 + Math.floor(r() * 8),
      played: 10,
    }));
    list.sort((a, b) => b[key] - a[key]);
    list.forEach((x, i) => { x.rank = i + 1; });
    return list;
  }

  async getTopScorers(leagueId) {
    return this._top(leagueId, 'goals');
  }

  async getTopAssists(leagueId) {
    return this._top(leagueId, 'assists');
  }

  async getCurrentSeason() {
    return season();
  }
}

module.exports = { MockProvider, plan, clock };
