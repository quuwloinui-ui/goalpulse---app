'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MockProvider, plan, clock } = require('../src/providers/mock.provider');
const { utcDate, utcDatesBetween, fallbackSeason } = require('../src/utils/time');
const { composeFixtureMessage, fixtureCondition } = require('../src/services/pushMessages');

test('utcDatesBetween covers both UTC dates for a local day that straddles midnight', () => {
  const from = Date.parse('2026-10-21T21:00:00Z'); // local midnight in UTC+3
  const to = Date.parse('2026-10-22T21:00:00Z');
  assert.deepEqual(utcDatesBetween(from, to), ['2026-10-21', '2026-10-22']);
  assert.deepEqual(utcDatesBetween(Date.parse('2026-10-22T00:00:00Z'), Date.parse('2026-10-23T00:00:00Z')), ['2026-10-22']);
});

test('fallbackSeason follows the European calendar', () => {
  assert.equal(fallbackSeason(new Date('2026-10-22T00:00:00Z')), 2026);
  assert.equal(fallbackSeason(new Date('2027-02-01T00:00:00Z')), 2026);
});

test('mock provider is deterministic and always has a live match', async () => {
  const p = new MockProvider();
  const a = await p.getFixturesByDate(utcDate());
  const b = await p.getFixturesByDate(utcDate());
  assert.equal(a.length, 16);
  assert.deepEqual(a.map((f) => [f.id, f.home.id, f.away.id]), b.map((f) => [f.id, f.home.id, f.away.id]));
  assert.ok((await p.getLiveFixtures()).length >= 1);
});

test('mock clock walks through the match phases', () => {
  const k = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(clock(k, k - 60000).status, 'NOT_STARTED');
  assert.equal(clock(k, k + 10 * 60000).status, 'LIVE');
  assert.equal(clock(k, k + 50 * 60000).status, 'HALF_TIME');
  assert.equal(clock(k, k + 80 * 60000).minute, 65);
  assert.equal(clock(k, k + 120 * 60000).status, 'FINISHED');
});

test('mock details expose events and reject malformed ids', async () => {
  const p = plan(2026102207);
  assert.ok(p && p.goals.length >= 0);
  const prov = new MockProvider();
  const details = await prov.getFixtureDetails(2026102207);
  assert.ok(Array.isArray(details.events));
  assert.equal(await prov.getFixtureDetails(5), null);
});

test('push messages and FCM condition', () => {
  const f = { id: 7, leagueName: 'PL', minute: 23, home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' }, score: { home: 1, away: 0 } };
  const m = composeFixtureMessage('GOAL', f, { scorer: 'Saka' });
  assert.equal(m.title, '⚽ GOAL! Arsenal 1-0 Chelsea');
  assert.equal(m.body, "Saka · 23'");
  assert.equal(fixtureCondition(f), "'match_7' in topics || 'team_42' in topics || 'team_49' in topics");
});
