'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/providers/apiFootball.normalize');

const item = {
  fixture: { id: 99, referee: 'M. Oliver', date: '2026-10-22T19:00:00+00:00', venue: { name: 'Emirates', city: 'London' }, status: { short: '2H', elapsed: 67, extra: null } },
  league: { id: 39, name: 'Premier League', country: 'England', logo: 'l.png', season: 2026, round: 'Regular Season - 10' },
  teams: { home: { id: 42, name: 'Arsenal', logo: 'a.png' }, away: { id: 49, name: 'Chelsea', logo: 'c.png' } },
  goals: { home: 2, away: 1 },
  events: [
    { time: { elapsed: 12, extra: null }, team: { id: 42 }, player: { name: 'Saka' }, assist: { name: 'Odegaard' }, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 45, extra: 2 }, team: { id: 49 }, player: { name: 'Palmer' }, assist: { name: null }, type: 'Goal', detail: 'Penalty' },
    { time: { elapsed: 60, extra: null }, team: { id: 49 }, player: { name: 'James' }, assist: {}, type: 'Card', detail: 'Red Card' },
    { time: { elapsed: 62, extra: null }, team: { id: 42 }, player: { name: 'Out' }, assist: { name: 'In' }, type: 'subst', detail: 'Substitution 1' },
  ],
  lineups: [{ team: { id: 42, name: 'Arsenal' }, formation: '4-3-3', coach: { name: 'Coach' }, startXI: [{ player: { id: 1, name: 'GK', number: 1, pos: 'G', grid: '1:1' } }], substitutes: [{ player: { id: 2, name: 'Sub', number: 12, pos: 'M', grid: null } }] }],
  statistics: [
    { team: { id: 49 }, statistics: [{ type: 'Ball Possession', value: '45%' }, { type: 'Corner Kicks', value: null }] },
    { team: { id: 42 }, statistics: [{ type: 'Ball Possession', value: '55%' }, { type: 'Corner Kicks', value: 6 }] },
  ],
};

test('status codes map to normalised statuses', () => {
  assert.equal(N.mapStatus('NS'), 'NOT_STARTED');
  assert.equal(N.mapStatus('2H'), 'LIVE');
  assert.equal(N.mapStatus('HT'), 'HALF_TIME');
  assert.equal(N.mapStatus('PEN'), 'FINISHED');
  assert.equal(N.mapStatus('PST'), 'POSTPONED');
  assert.equal(N.mapStatus('???'), 'UNKNOWN');
});

test('normalizeFixture produces the shared contract', () => {
  const f = N.normalizeFixture(item);
  assert.equal(f.id, 99);
  assert.equal(f.kickoff, '2026-10-22T19:00:00.000Z');
  assert.equal(f.status, 'LIVE');
  assert.equal(f.minute, 67);
  assert.deepEqual(f.score, { home: 2, away: 1 });
  assert.equal(f.home.name, 'Arsenal');
  assert.equal(f.venue, 'Emirates');
});

test('events are classified (goal / penalty / red card / substitution)', () => {
  const ev = N.normalizeEvents(item.events);
  assert.deepEqual(ev.map((e) => e.kind), ['goal', 'penalty', 'red_card', 'substitution']);
  assert.equal(ev[1].extra, 2);
  assert.equal(ev[3].player, 'Out');
  assert.equal(ev[3].related, 'In');
});

test('statistics are paired home/away by team id regardless of order', () => {
  const rows = N.normalizeDetails(item).statistics;
  assert.deepEqual(rows[0], { label: 'Ball Possession', home: '55%', away: '45%' });
  assert.deepEqual(rows[1], { label: 'Corner Kicks', home: '6', away: '0' });
});

test('lineups keep grid coordinates for the pitch view', () => {
  const [l] = N.normalizeLineups(item.lineups);
  assert.equal(l.formation, '4-3-3');
  assert.equal(l.startXI[0].grid, '1:1');
  assert.equal(l.subs.length, 1);
});

test('standings and top players normalise', () => {
  const st = N.normalizeStandings([{ league: { id: 39, name: 'PL', season: 2026, standings: [[{ rank: 1, team: { id: 42, name: 'Arsenal' }, points: 25, goalsDiff: 12, group: 'PL', all: { played: 10, win: 8, draw: 1, lose: 1, goals: { for: 20, against: 8 } } }]] } }]);
  assert.equal(st.groups[0].rows[0].goalsFor, 20);
  const top = N.normalizeTopPlayers([{ player: { id: 1, name: 'H. Kane' }, statistics: [{ team: { id: 157, name: 'Bayern' }, goals: { total: 9, assists: 2 }, games: { appearences: 10 } }] }]);
  assert.deepEqual([top[0].rank, top[0].goals, top[0].assists, top[0].played], [1, 9, 2, 10]);
});
