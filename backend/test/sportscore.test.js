'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FakeRedis, silent } = require('./helpers');
const N = require('../src/providers/sportscore.normalize');
const { SportScoreProvider } = require('../src/providers/sportscore.provider');
const { createBudget } = require('../src/lib/budget');

// Rows copied from REAL SportScore responses (GET /api/v1/fixtures/?sport=football&date=2026-11-11 and /api/widget/matches/).
const REAL = {
  upcoming: { home: 'Liverpool URU', away: 'CA Juventud', home_logo: 'https://img.thesports.com/football/team/051be0a9b61dedb583315fb75eaa8308.png', away_logo: 'https://img.thesports.com/football/team/928b41b8c6f948cf8b1f515d4b301b80.png', home_score: null, away_score: null, status: 'upcoming', status_text: 'Not started', time: '2026-11-11T00:00:00+00:00', competition: 'Uruguay Cup', competition_logo: 'https://img.thesports.com/football/competition/f7deb41bb68e75bb7bf56d5220d77229.png', url: '/football/match/liverpool-uru-vs-ca-juventud/23xmvkhy3y48qg8/' },
  postponed: { home: 'Lyngby Reserve', away: 'HB Koge Reserve', home_logo: '', away_logo: '', home_score: null, away_score: null, status: 'upcoming', status_text: 'Postponed', time: '2026-11-11T10:00:00+00:00', competition: 'Danish Reserves League', competition_logo: '', url: '/football/match/hb-koge-reserve-vs-lyngby-reserve/8yomo4h1w4vnq0j/' },
  cancelled: { home: 'Libya U17', away: 'Algeria U17', home_logo: '', away_logo: '', home_score: null, away_score: null, status: 'upcoming', status_text: 'Cancelled', time: '2026-11-11T11:00:00+00:00', competition: 'CAF U17 Championship', competition_logo: '', url: '/football/match/algeria-u17-vs-libya-u17/965mkyh8l5jer1g/' },
  iraq: { home: 'Al-Sinaat Al-Kahrabaiya', away: 'Baladiyat Al-Mosul SC', home_logo: 'https://img.thesports.com/football/team/fff44c3358bd69fbec76e352ee43b71f.png', away_logo: '', home_score: null, away_score: null, status: 'upcoming', status_text: 'Not started', time: '2026-11-11T11:30:00+00:00', competition: 'Iraq Premier Division', competition_logo: '', url: '/football/match/al-sinaat-al-kahrabaiya-vs-baladiyat-al-mosul-sc/zp5rzgh3jozvq82/' },
  badLogo: { home: 'Latvia U17', away: 'Croatia U17', home_logo: 'https://img.thesports.com/football/team/0f2652d7965e8be349a9e462547f2b4c.png', away_logo: 'https://img.thesports.com/football/team/c83b30902e5c767ce01f31d63719c99d.crdownload', home_score: null, away_score: null, status: 'upcoming', status_text: 'Not started', time: '2026-11-11T10:00:00+00:00', competition: 'UEFA European U17 Football Championship', competition_logo: '', url: '/football/match/latvia-u17-vs-croatia-u17/2y8m4zh5dnngql0/' },
  finished: { home: 'Atletico Junior Barranquilla', away: 'Cucuta Deportivo', home_logo: '', away_logo: '', home_score: '2', away_score: '0', status: 'finished', status_text: 'Finished', time: '2026-11-10T00:00:00+00:00', competition: 'Categoría Primera A', competition_logo: '', url: '/football/match/atletico-junior-barranquilla-vs-cucuta-deportivo/zp5rzghg95n5q82/' },
};
const row = (i, extra = {}) => ({ ...REAL.upcoming, home: `Home ${i}`, away: `Away ${i}`, competition: 'English Premier League', time: `2026-11-11T${String(10 + (i % 12)).padStart(2, '0')}:00:00+00:00`, url: `/football/match/home-${i}-vs-away-${i}/id${i}/`, ...extra });
const json = (body, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) });

test('real rows normalise: scores, statuses, ids, broken logos', () => {
  const up = N.normalizeMatch(REAL.upcoming).fixture;
  assert.equal(up.status, 'NOT_STARTED');
  assert.deepEqual(up.score, { home: null, away: null });
  assert.equal(up.kickoff, '2026-11-11T00:00:00.000Z');
  assert.equal(N.normalizeMatch(REAL.postponed).fixture.status, 'POSTPONED');
  assert.equal(N.normalizeMatch(REAL.cancelled).fixture.status, 'CANCELLED');
  const fin = N.normalizeMatch(REAL.finished).fixture;
  assert.equal(fin.status, 'FINISHED');
  assert.deepEqual(fin.score, { home: 2, away: 0 }); // strings become numbers
  assert.equal(N.normalizeMatch(REAL.badLogo).fixture.away.logo, null); // .crdownload is dropped
  assert.equal(N.normalizeMatch(REAL.postponed).fixture.home.logo, null); // '' -> null
  for (const f of [up, fin]) {
    assert.ok(Number.isInteger(f.id) && f.id > 0 && f.id <= 2147483647);
    assert.ok(Number.isInteger(f.home.id) && f.home.id <= 2147483647);
  }
  assert.equal(N.normalizeMatch(REAL.upcoming).fixture.id, up.id); // stable
});

test('in-play wording variants map to LIVE / HALF_TIME; minute is parsed', () => {
  assert.equal(N.mapStatus('live', "34'"), 'LIVE');
  assert.equal(N.mapStatus('inplay', 'Live'), 'LIVE');
  assert.equal(N.mapStatus('upcoming', "67'"), 'LIVE');
  assert.equal(N.mapStatus('live', 'Half Time'), 'HALF_TIME');
  assert.equal(N.mapStatus('live', 'HT'), 'HALF_TIME');
  assert.equal(N.mapStatus('finished', 'Full Time'), 'FINISHED');
  assert.deepEqual(N.parseMinute("45+2'"), { minute: 45, extra: 2 });
  const live = N.normalizeMatch({ ...REAL.iraq, status: 'live', status_text: "58'", home_score: '1', away_score: '0' }).fixture;
  assert.equal(live.status, 'LIVE');
  assert.equal(live.minute, 58);
  // unknown wording + score + recent kick-off => treated as live
  const odd = N.normalizeMatch({ ...REAL.iraq, status: 'xyz', status_text: '', home_score: '0', away_score: '0', time: new Date(Date.now() - 30 * 60000).toISOString() }).fixture;
  assert.equal(odd.status, 'LIVE');
});

test('default filter: keeps the big leagues + Iraq, drops youth/women/reserve and unknown minor leagues', () => {
  const f = N.buildFilter('default');
  const list = [REAL.upcoming, REAL.postponed, REAL.cancelled, REAL.iraq, REAL.badLogo, REAL.finished, row(1), row(2, { competition: 'Spanish La Liga' }), row(3, { competition: 'UEFA Champions League' }), row(4, { competition: 'Saudi Professional League' }), row(5, { competition: 'Premier League', home: 'Arsenal Women' })]
    .map((r) => N.normalizeMatch(r).fixture);
  const names = f(list).map((x) => x.leagueName);
  assert.deepEqual(names.sort(), ['English Premier League', 'Iraq Premier Division', 'Saudi Professional League', 'Spanish La Liga', 'UEFA Champions League']);
  assert.equal(f(list).find((x) => x.leagueName === 'Iraq Premier Division').leagueId, 542);
  // nothing matches -> safety net shows something instead of an empty app
  const only = [REAL.upcoming, REAL.finished].map((r) => N.normalizeMatch(r).fixture);
  assert.equal(f(only).length, 2);
  assert.equal(N.buildFilter('all')(list).length, list.length);
  assert.equal(N.buildFilter('iraq')(list).length, 1);
});

test('provider: day list paging is discovered once (page=2), then reused', async () => {
  const calls = [];
  const all = Array.from({ length: 140 }, (_, i) => row(i));
  const fetchImpl = async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const page = Number(q.get('page') || 1);
    const rows = q.get('limit') ? all.slice(0, 100) : all.slice((page - 1) * 100, page * 100); // `limit` is ignored by this fake API
    return json({ sport: 'football', date: q.get('date'), count: rows.length, matches: rows });
  };
  const redis = new FakeRedis();
  const p = new SportScoreProvider({ redis, logger: silent, fetchImpl });
  const list = await p.getFixturesByDate('2026-11-11');
  assert.equal(list.length, 140);
  assert.equal(p.paging, 'page');
  assert.equal(await redis.get('ss:paging'), 'page');
  const before = calls.length;
  p.days.clear();
  assert.equal((await p.getFixturesByDate('2026-11-12')).length, 140);
  assert.equal(calls.length - before, 2); // page 1 + page 2 (page 3 is not needed: page 2 is short)
});

test('provider: when `limit` works it is used directly afterwards', async () => {
  const all = Array.from({ length: 230 }, (_, i) => row(i));
  const seen = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams;
    seen.push(url);
    return json({ matches: q.get('limit') ? all.slice(0, Number(q.get('limit'))) : all.slice(0, 100) });
  };
  const p = new SportScoreProvider({ redis: new FakeRedis(), logger: silent, fetchImpl });
  assert.equal((await p.getFixturesByDate('2026-11-11')).length, 230);
  assert.equal(p.paging, 'limit');
  const n = seen.length;
  p.days.clear();
  await p.getFixturesByDate('2026-11-13');
  assert.equal(seen.length - n, 1);
});

test('provider: live feed, final state lookup, details fallback', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const mk = (i, status, text, hs, as) => row(i, { status, status_text: text, home_score: hs, away_score: as, time: `${today}T00:30:00+00:00` });
  let phase = 1;
  const fetchImpl = async (url) => {
    if (url.includes('/api/widget/match/')) return json({}, 500);
    return json({ matches: phase === 1 ? [mk(1, 'live', "30'", '1', '0'), mk(2, 'upcoming', 'Not started', null, null)] : [mk(1, 'finished', 'Finished', '2', '0'), mk(2, 'upcoming', 'Not started', null, null)] });
  };
  const p = new SportScoreProvider({ redis: new FakeRedis(), logger: silent, fetchImpl });
  const live = await p.getLiveFixtures();
  assert.equal(live.length, 1);
  assert.equal(live[0].minute, 30);
  assert.deepEqual(live[0].events, []);
  phase = 2;
  p.days.clear();
  await p.getLiveFixtures();
  const finals = await p.getFixturesByIds([live[0].id]);
  assert.equal(finals[0].status, 'FINISHED');
  assert.deepEqual(finals[0].score, { home: 2, away: 0 });
  const d = await p.getFixtureDetails(live[0].id); // detail endpoint failing must not break the screen
  assert.equal(d.status, 'FINISHED');
  assert.deepEqual([d.events, d.lineups, d.statistics], [[], [], []]);
  assert.equal(await p.getFixtureDetails(999), null);
});

test('detail / standings / scorers parsers accept common shapes and never invent data', () => {
  const fx = N.normalizeMatch(REAL.iraq).fixture;
  const d = N.parseMatchDetail({ match: { venue: { name: 'Karbala Stadium' }, timeline: [{ minute: "12'", type: 'Goal', team: 'home', player: 'Ali' }, { minute: '55', type: 'Yellow Card', is_home: false, player: 'Omar' }], lineups: { home: { formation: '4-3-3', starters: [{ name: 'A', number: 1 }], subs: ['B'] }, away: { starters: [{ name: 'C' }] } }, statistics: [{ label: 'Shots', home: 5, away: 3 }] } }, fx);
  assert.equal(d.venue, 'Karbala Stadium');
  assert.deepEqual(d.events.map((e) => [e.minute, e.kind, e.teamId === fx.home.id]), [[12, 'goal', true], [55, 'yellow_card', false]]);
  assert.equal(d.lineups.length, 2);
  assert.equal(d.statistics[0].home, '5');
  assert.deepEqual(N.parseMatchDetail({ foo: 1 }, fx).events, []);

  const st = N.parseStandings({ standings: [{ position: 1, team: { name: 'Arsenal', logo: 'x.png' }, played: 10, won: 8, drawn: 1, lost: 1, goals_for: 20, goals_against: 5, points: 25 }, { position: 2, team: { name: 'Spurs' }, played: 10, won: 7, drawn: 1, lost: 2, goals_for: 15, goals_against: 9, points: 22 }] }, { id: 39, name: 'Premier League' });
  assert.equal(st.groups[0].rows[0].points, 25);
  assert.equal(st.groups[0].rows[1].goalDiff, 6);
  assert.deepEqual(N.parseStandings({ nope: true }, { id: 39, name: 'x' }).groups, []);
  const ts = N.parseTopPlayers({ scorers: [{ rank: 1, player: { name: 'Haaland' }, team: 'Man City', goals: 12 }] }, 'goals');
  assert.equal(ts[0].goals, 12);
});

test('daily budget stops upstream calls (stale cache takes over)', async () => {
  const redis = new FakeRedis();
  const budget = createBudget({ redis, name: 'sportscore', limit: 1 });
  let n = 0;
  const p = new SportScoreProvider({ redis, logger: silent, budget, fetchImpl: async () => { n += 1; return json({ matches: [] }); } });
  await p.getFixturesByDate('2026-11-11');
  await assert.rejects(() => p.getFixturesByDate('2026-11-12'), /budget/);
  assert.equal(n, 1);
  assert.deepEqual(await p.getQuota(), { remaining: 0, limit: 1 });
});

test('FootballService works end-to-end on top of the SportScore provider', async () => {
  const { FootballService } = require('../src/services/football.service');
  const { createCache } = require('../src/lib/cache');
  const redis = new FakeRedis();
  const fetchImpl = async () => json({ matches: [REAL.iraq, REAL.badLogo, row(1), row(2, { competition: 'Dutch Reserve League' })] });
  const provider = new SportScoreProvider({ redis, logger: silent, fetchImpl });
  const football = new FootballService({ provider, cache: createCache(redis, silent), redis, env: { LEAGUE_IDS: 'default', TODAY_FIXTURES_TTL_SEC: 300 }, logger: silent });
  const from = Date.parse('2026-11-11T00:00:00Z');
  const list = await football.fixturesInRange(from, from + 86400000);
  assert.deepEqual(list.map((f) => f.leagueName).sort(), ['English Premier League', 'Iraq Premier Division']);
  assert.ok(football.leagues().some((l) => l.id === 542 && /Iraq/.test(l.name)));
  assert.equal((await football.fixtureDetails(list[0].id)).id, list[0].id);
  assert.equal(await football.fixtureDetails(12345), null);
});

test('UEFA Nations League is a featured competition (id 5); youth/women versions stay hidden', () => {
  const f = N.buildFilter('default');
  const mk = (competition, home = 'Italy', away = 'France') => N.normalizeMatch({ ...REAL.upcoming, competition, home, away, url: `/football/match/${home}-${away}-${competition.length}/x/` }).fixture;
  const list = [mk('UEFA Nations League'), mk('UEFA Nations League A'), mk('UEFA Women\'s Nations League', 'Italy Women', 'France Women'), mk('UEFA Nations League', 'Italy U21', 'France U21'), mk('Uruguay Cup')];
  const out = f(list);
  assert.equal(out.length, 2);
  assert.ok(out.every((x) => x.leagueId === 5));
});
