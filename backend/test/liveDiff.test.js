'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshotOf, diffLive, scorerName } = require('../src/utils/liveDiff');

const fx = (over = {}) => ({
  id: 1, status: 'LIVE', minute: 10, score: { home: 0, away: 0 }, events: [], ...over,
});
const goalEv = (player, minute = 10) => ({ type: 'GOAL', kind: 'goal', player, minute });

test('first sighting early in the match is a kick-off', () => {
  const d = diffLive(undefined, fx({ minute: 1 }));
  assert.equal(d.isNew, true);
  assert.equal(d.kickoff, true);
});

test('first sighting mid-match (e.g. after a restart) does not trigger kick-off', () => {
  assert.equal(diffLive(undefined, fx({ minute: 57 })).kickoff, false);
});

test('minute-only change updates the list but is not "significant"', () => {
  const before = snapshotOf(fx({ minute: 10 }));
  const d = diffLive(before, fx({ minute: 11 }));
  assert.equal(d.changed, true);
  assert.equal(d.significant, false);
  assert.equal(d.goal, null);
});

test('score increase is a goal for the right side', () => {
  const before = snapshotOf(fx());
  assert.equal(diffLive(before, fx({ score: { home: 1, away: 0 } })).goal.side, 'home');
  assert.equal(diffLive(before, fx({ score: { home: 0, away: 1 } })).goal.side, 'away');
});

test('score decrease (VAR) is significant but not a goal', () => {
  const before = snapshotOf(fx({ score: { home: 1, away: 0 } }));
  const d = diffLive(before, fx({ score: { home: 0, away: 0 } }));
  assert.equal(d.goal, null);
  assert.equal(d.significant, true);
});

test('detects half-time and full-time transitions once', () => {
  const live = snapshotOf(fx());
  assert.equal(diffLive(live, fx({ status: 'HALF_TIME' })).halfTime, true);
  assert.equal(diffLive(live, fx({ status: 'FINISHED' })).fullTime, true);
  assert.equal(diffLive(snapshotOf(fx({ status: 'HALF_TIME' })), fx({ status: 'HALF_TIME' })).halfTime, false);
});

test('new events are sliced from the previous count and red cards are picked out', () => {
  const before = snapshotOf(fx({ events: [goalEv('A')] }));
  const red = { type: 'CARD', kind: 'red_card', player: 'B', minute: 30 };
  const d = diffLive(before, fx({ events: [goalEv('A'), red] }));
  assert.deepEqual(d.newEvents, [red]);
  assert.deepEqual(d.redCards, [red]);
});

test('scorerName only trusts the event feed when it matches the score', () => {
  assert.equal(scorerName(fx({ score: { home: 1, away: 0 }, events: [goalEv('Saka')] })), 'Saka');
  assert.equal(scorerName(fx({ score: { home: 2, away: 0 }, events: [goalEv('Saka')] })), null);
  assert.equal(scorerName(fx({ score: { home: 1, away: 0 }, events: [] })), null);
});
