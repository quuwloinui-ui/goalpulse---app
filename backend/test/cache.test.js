'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../src/lib/cache');
const { FakeRedis, silent, sleep } = require('./helpers');

test('wrap() hits upstream once while the entry is fresh', async () => {
  const cache = createCache(new FakeRedis(), silent);
  let calls = 0;
  const fetcher = async () => { calls += 1; return { n: calls }; };
  assert.deepEqual(await cache.wrap('k', 60, fetcher), { n: 1 });
  assert.deepEqual(await cache.wrap('k', 60, fetcher), { n: 1 });
  assert.equal(calls, 1);
});

test('wrap() coalesces concurrent requests into one upstream call', async () => {
  const cache = createCache(new FakeRedis(), silent);
  let calls = 0;
  const fetcher = async () => { calls += 1; await sleep(30); return 'x'; };
  const out = await Promise.all([cache.wrap('k', 60, fetcher), cache.wrap('k', 60, fetcher), cache.wrap('k', 60, fetcher)]);
  assert.deepEqual(out, ['x', 'x', 'x']);
  assert.equal(calls, 1);
});

test('wrap() serves stale data when the upstream fails', async () => {
  const cache = createCache(new FakeRedis(), silent);
  await cache.wrap('k', 0.03, async () => 'fresh');
  await sleep(60);
  const out = await cache.wrap('k', 0.03, async () => { throw new Error('quota exceeded'); });
  assert.equal(out, 'fresh');
});

test('wrap() rethrows when there is nothing stale to serve', async () => {
  const cache = createCache(new FakeRedis(), silent);
  await assert.rejects(() => cache.wrap('k', 60, async () => { throw new Error('boom'); }), /boom/);
});

test('wrap() accepts a ttl function evaluated on the fetched data', async () => {
  const cache = createCache(new FakeRedis(), silent);
  await cache.wrap('k', (d) => (d.done ? 3600 : 0.01), async () => ({ done: true }));
  await sleep(30);
  let calls = 0;
  await cache.wrap('k', 60, async () => { calls += 1; return {}; });
  assert.equal(calls, 0);
});

test('get() returns only fresh data; del() removes it', async () => {
  const cache = createCache(new FakeRedis(), silent);
  await cache.set('k', [1, 2], 60);
  assert.deepEqual(await cache.get('k'), [1, 2]);
  await cache.del('k');
  assert.equal(await cache.get('k'), null);
});
