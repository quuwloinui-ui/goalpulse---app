'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveUpdater } = require('../src/services/liveUpdater');
const { FootballService } = require('../src/services/football.service');
const { createCache } = require('../src/lib/cache');
const { FakeRedis, silent } = require('./helpers');

const base = {
  id: 1, leagueId: 39, leagueName: 'Premier League', leagueCountry: 'England', round: 'R10',
  kickoff: new Date(Date.now() - 120000).toISOString(),
  home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' },
};
const live = (over) => ({ ...base, status: 'LIVE', statusShort: '1H', minute: 1, extra: null, score: { home: 0, away: 0 }, events: [], ...over });
const goal = { minute: 23, type: 'GOAL', kind: 'goal', teamId: 42, player: 'Saka', related: 'Odegaard' };

function setup(liveSequence, finals) {
  const redis = new FakeRedis();
  const calls = { live: 0, byIds: 0 };
  const provider = {
    name: 'fake',
    getQuota: async () => null,
    getFixturesByDate: async () => [{ ...base, status: 'LIVE', score: { home: 0, away: 0 } }],
    getLiveFixtures: async () => liveSequence[Math.min(calls.live++, liveSequence.length - 1)],
    getFixturesByIds: async () => { calls.byIds += 1; return finals; },
  };
  const env = { LIVE_POLL_INTERVAL_MS: 30000, DAILY_QUOTA_RESERVE: 50, TODAY_FIXTURES_TTL_SEC: 300 };
  const cache = createCache(redis, silent);
  const football = new FootballService({ provider, cache, redis, env, logger: silent });
  const out = { pushes: [], lives: [], matches: [] };
  const gateway = { emitLive: (m) => out.lives.push(m), emitMatch: (id, p) => out.matches.push([id, p]) };
  const push = { notifyFixture: async (kind, f, extra) => out.pushes.push({ kind, id: f.id, extra }) };
  const updater = new LiveUpdater({ env, redis, cache, provider, football, gateway, push, logger: silent });
  return { updater, football, redis, calls, ...out };
}

test('full match lifecycle: kick-off -> goal -> half-time -> full-time, each pushed exactly once', async () => {
  const finalFx = { ...base, status: 'FINISHED', statusShort: 'FT', minute: 90, extra: null, score: { home: 1, away: 0 }, events: [goal] };
  const s = setup(
    [
      [live({ minute: 1 })],
      [live({ minute: 23, score: { home: 1, away: 0 }, events: [goal] })],
      [live({ minute: 23, score: { home: 1, away: 0 }, events: [goal] })], // identical poll: nothing new
      [live({ status: 'HALF_TIME', statusShort: 'HT', minute: 45, score: { home: 1, away: 0 }, events: [goal] })],
      [], // match vanished from the live feed
    ],
    [finalFx],
  );

  await s.updater.tick(); // 1: kick-off
  await s.updater.tick(); // 2: goal
  await s.updater.tick(); // 3: duplicate poll
  await s.updater.tick(); // 4: half-time
  await s.updater.tick(); // 5: finished

  assert.deepEqual(s.pushes.map((p) => p.kind), ['KICKOFF', 'GOAL', 'HALF_TIME', 'FULL_TIME']);
  assert.equal(s.pushes[1].extra.scorer, 'Saka');
  assert.equal(s.pushes[1].extra.side, 'home');
  assert.equal(s.calls.byIds, 1, 'final state fetched in a single batched call');

  const goalMatchUpdate = s.matches.find(([, p]) => p.events && p.events.length === 1);
  assert.ok(goalMatchUpdate, 'match room received the goal event');
  assert.equal(goalMatchUpdate[1].score.home, 1);
  assert.ok(s.lives.length >= 4, 'home list received batched updates');
  assert.deepEqual(await s.redis.hgetall('live:snapshot'), {}, 'snapshot cleared after full-time');
});

test('REST fixtures are overlaid with the real-time state written by the worker', async () => {
  const s = setup([[live({ minute: 30, score: { home: 2, away: 1 } })]], []);
  await s.updater.tick();
  const [merged] = await s.football.overlay([{ id: 1, status: 'NOT_STARTED', minute: null, score: { home: null, away: null } }]);
  assert.equal(merged.status, 'LIVE');
  assert.equal(merged.minute, 30);
  assert.deepEqual(merged.score, { home: 2, away: 1 });
});

test('only one instance (the elected leader) polls the provider', async () => {
  const s = setup([[live()]], []);
  const rival = new LiveUpdater({ ...s.updater, env: s.updater.env, logger: silent });
  await s.updater.tick(); // becomes leader
  const before = s.calls.live;
  await rival.tick(); // second instance must stand down
  assert.equal(s.calls.live, before);
});

test('idle periods (no live or imminent matches) cost zero provider calls', async () => {
  const s = setup([[live()]], []);
  s.updater.provider.getFixturesByDate = async () => [{ ...base, status: 'NOT_STARTED', kickoff: new Date(Date.now() + 5 * 3600e3).toISOString() }];
  await s.updater.tick();
  assert.equal(s.calls.live, 0);
});
