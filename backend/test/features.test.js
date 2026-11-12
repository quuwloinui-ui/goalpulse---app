'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBudget } = require('../src/lib/budget');
const { composeFixtureMessage, fixtureCondition, reminderCondition, withLanguage } = require('../src/services/pushMessages');
const { LiveUpdater } = require('../src/services/liveUpdater');
const { FootballService } = require('../src/services/football.service');
const { createCache } = require('../src/lib/cache');
const { FakeRedis, silent } = require('./helpers');

const f = { id: 7, leagueName: 'Premier League', minute: 23, home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' }, score: { home: 1, away: 0 } };

test('request budget: counts calls, refuses beyond the cap, reports what is left', async () => {
  const b = createBudget({ redis: new FakeRedis(), name: 'x', limit: 3 });
  await b.take(); await b.take(); await b.take();
  await assert.rejects(() => b.take(), /budget of 3/);
  assert.equal(await b.remaining(), 0);
  const off = createBudget({ redis: new FakeRedis(), name: 'y', limit: 0 });
  await off.take();
  assert.equal(await off.remaining(), null);
});

test('push text exists in English and Arabic, reminders included', () => {
  assert.equal(composeFixtureMessage('GOAL', f, { scorer: 'Saka' }).title, '⚽ GOAL! Arsenal 1-0 Chelsea');
  const ar = composeFixtureMessage('GOAL', f, { scorer: 'Saka' }, 'ar');
  assert.equal(ar.title, '⚽ هدف! Arsenal 1-0 Chelsea');
  assert.equal(composeFixtureMessage('REMINDER', f, { minutes: 12 }).body, 'Arsenal vs Chelsea · in 12 min · Premier League');
  assert.equal(composeFixtureMessage('REMINDER', f, { minutes: 12 }, 'ar').body, 'Arsenal × Chelsea · بعد 12 دقيقة · Premier League');
  assert.equal(composeFixtureMessage('KICKOFF', f, {}, 'ar').title, '🟢 بدأت المباراة');
});

test('FCM conditions: event and reminder topics are separate, language is AND-ed in (max 5 topics)', () => {
  assert.equal(fixtureCondition(f), "'match_7' in topics || 'team_42' in topics || 'team_49' in topics");
  assert.equal(reminderCondition(f), "'remind_match_7' in topics || 'remind_team_42' in topics || 'remind_team_49' in topics");
  const c = withLanguage(fixtureCondition(f), 'ar');
  assert.equal(c, "('match_7' in topics || 'team_42' in topics || 'team_49' in topics) && 'lang_ar' in topics");
  assert.equal((c.match(/in topics/g) || []).length, 4);
});

function setup(kickoffInMs, status = 'NOT_STARTED') {
  const redis = new FakeRedis();
  const cache = createCache(redis, silent);
  const fx = { id: 9, leagueId: 39, leagueName: 'PL', status, kickoff: new Date(Date.now() + kickoffInMs).toISOString(), home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' }, score: { home: null, away: null } };
  const provider = { getQuota: async () => null, getFixturesByDate: async () => [fx], getLiveFixtures: async () => [], getFixturesByIds: async () => [] };
  const env = { LIVE_POLL_INTERVAL_MS: 60000, DAILY_QUOTA_RESERVE: 0, TODAY_FIXTURES_TTL_SEC: 300, REMINDER_MINUTES: 15 };
  const football = new FootballService({ provider, cache, redis, env, logger: silent });
  const pushes = [];
  const updater = new LiveUpdater({ env, redis, cache, provider, football, gateway: { emitLive() {}, emitMatch() {} }, push: { notifyFixture: async (kind, fixture, extra) => pushes.push({ kind, extra }) }, logger: silent });
  return { updater, pushes };
}

test('reminder is sent once, only inside the window', async () => {
  const soon = setup(10 * 60000);
  await soon.updater.tick();
  await soon.updater.tick();
  assert.equal(soon.pushes.length, 1);
  assert.equal(soon.pushes[0].kind, 'REMINDER');
  assert.ok([9, 10, 11].includes(soon.pushes[0].extra.minutes));

  const far = setup(60 * 60000);
  await far.updater.tick();
  assert.equal(far.pushes.length, 0);
  const tooLate = setup(60000);
  await tooLate.updater.tick();
  assert.equal(tooLate.pushes.length, 0);
  const started = setup(5 * 60000, 'LIVE');
  await started.updater.tick();
  assert.equal(started.pushes.filter((p) => p.kind === 'REMINDER').length, 0);
});
