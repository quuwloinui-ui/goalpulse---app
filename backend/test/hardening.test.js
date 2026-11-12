'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assessJwtSecret, assessAdminPassword } = require('../src/config/secrets');
const { parseLeagueFilter, DEFAULT_LEAGUE_IDS } = require('../src/config/leagues');
const { createThrottle, createConnectionLimiter } = require('../src/sockets/limits');
const { requireRole } = require('../src/middleware/roles');
const { FootballService } = require('../src/services/football.service');
const { LiveUpdater } = require('../src/services/liveUpdater');
const { createCache } = require('../src/lib/cache');
const { utcDate } = require('../src/utils/time');
const { FakeRedis, silent, sleep } = require('./helpers');

test('production secrets: sample and short values are rejected, random ones pass', () => {
  assert.ok(assessJwtSecret('replace-with-a-long-random-string'));
  assert.ok(assessJwtSecret('a'.repeat(31)));
  assert.ok(assessJwtSecret('my-super-secret-value-that-is-long-enough-123'));
  assert.equal(assessJwtSecret(crypto.randomBytes(32).toString('hex')), null);
  assert.ok(assessAdminPassword('ChangeMe-Now-123'));
  assert.ok(assessAdminPassword('short1!'));
  assert.equal(assessAdminPassword('x9$Kq2!vLm8#Rt'), null);
});

test('league filter: default list, all, custom ids, garbage falls back to default', () => {
  assert.equal(parseLeagueFilter('default').size, DEFAULT_LEAGUE_IDS.length);
  assert.equal(parseLeagueFilter(undefined).has(39), true);
  assert.equal(parseLeagueFilter('all'), null);
  assert.deepEqual([...parseLeagueFilter('39, 140 ,x')].sort(), [140, 39]);
  assert.equal(parseLeagueFilter('nonsense').size, DEFAULT_LEAGUE_IDS.length);
});

test('football service drops minor leagues and re-keys its cache when the filter changes', async () => {
  const fx = (id, leagueId) => ({ id, leagueId, status: 'NOT_STARTED', kickoff: new Date().toISOString(), home: { id: 1 }, away: { id: 2 } });
  const provider = { getFixturesByDate: async () => [fx(1, 39), fx(2, 99999)], getLiveFixtures: async () => [fx(1, 39), fx(2, 99999)] };
  const mk = (LEAGUE_IDS) => new FootballService({
    provider, cache: createCache(new FakeRedis(), silent), redis: new FakeRedis(),
    env: { TODAY_FIXTURES_TTL_SEC: 300, LEAGUE_IDS }, logger: silent,
  });
  const strict = mk('default');
  const open = mk('all');
  assert.deepEqual((await strict.fixturesForDate(utcDate())).map((f) => f.id), [1]);
  assert.deepEqual((await open.fixturesForDate(utcDate())).map((f) => f.id), [1, 2]);
  assert.deepEqual((await strict.fetchLive()).map((f) => f.id), [1]);
  assert.notEqual(strict.tag, open.tag);
});

test('socket throttle allows a burst, then refills; connection limiter caps and releases', () => {
  let t = 0;
  const allow = createThrottle({ capacity: 3, perSecond: 1, now: () => t });
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
  t += 1000;
  assert.equal(allow(), true);
  assert.equal(allow(), false);

  const lim = createConnectionLimiter(2);
  assert.deepEqual([lim.acquire('ip'), lim.acquire('ip'), lim.acquire('ip')], [true, true, false]);
  lim.release('ip');
  assert.equal(lim.acquire('ip'), true);
  lim.release('ip'); lim.release('ip');
  assert.equal(lim.size(), 0);
});

test('requireRole lets the right role through and answers 403 otherwise', () => {
  let err;
  requireRole('SUPER')({ auth: { role: 'EDITOR' } }, {}, (e) => { err = e; });
  assert.equal(err.status, 403);
  err = undefined;
  requireRole('SUPER', 'EDITOR')({ auth: { role: 'EDITOR' } }, {}, (e) => { err = e; });
  assert.equal(err, undefined);
  requireRole('SUPER')({}, {}, (e) => { err = e; });
  assert.equal(err.status, 403);
});

test('live updater backs off exponentially while the provider fails, then recovers', async () => {
  const redis = new FakeRedis();
  const cache = createCache(redis, silent);
  let liveCalls = 0;
  const provider = {
    getQuota: async () => null,
    getFixturesByDate: async () => [{ id: 1, leagueId: 39, status: 'LIVE', kickoff: new Date(Date.now() - 120000).toISOString() }],
    getLiveFixtures: async () => { liveCalls += 1; if (liveCalls <= 2) throw new Error('upstream down'); return []; },
    getFixturesByIds: async () => [],
  };
  const env = { LIVE_POLL_INTERVAL_MS: 5, DAILY_QUOTA_RESERVE: 0, TODAY_FIXTURES_TTL_SEC: 300 };
  const football = new FootballService({ provider, cache, redis, env, logger: silent });
  const u = new LiveUpdater({ env, redis, cache, provider, football, gateway: { emitLive() {}, emitMatch() {} }, push: {}, logger: silent });

  await u.tick(); // call 1 fails -> wait 10 ms
  assert.equal(liveCalls, 1);
  assert.equal(u.failures, 1);
  await u.tick(); // still backing off: provider untouched
  assert.equal(liveCalls, 1);
  await sleep(30);
  await u.tick(); // call 2 fails -> wait 20 ms
  assert.equal(liveCalls, 2);
  assert.equal(u.failures, 2);
  await sleep(50);
  await u.tick(); // call 3 succeeds
  assert.equal(liveCalls, 3);
  assert.equal(u.failures, 0);
});
