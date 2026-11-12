'use strict';
/**
 * Redis cache-aside helper with:
 *  - freshness + stale window  (serve stale data when the upstream API fails)
 *  - in-process request coalescing (one upstream call per key per instance)
 *  - short distributed lock       (one upstream call per key across instances)
 * Values are stored as {d: data, e: freshUntilEpochMs}.
 */
function createCache(redis, logger) {
  const inflight = new Map();

  async function readEntry(key) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn({ err: err.message, key }, 'cache read failed');
      return null;
    }
  }

  async function writeEntry(key, data, ttlSec, staleSec) {
    try {
      await redis.set(key, JSON.stringify({ d: data, e: Date.now() + ttlSec * 1000 }), 'EX', Math.ceil(ttlSec + staleSec));
    } catch (err) {
      logger.warn({ err: err.message, key }, 'cache write failed');
    }
  }

  /** ttl may be a number (seconds) or a function(data) -> seconds. */
  async function wrap(key, ttl, fetcher, opts = {}) {
    const entry = await readEntry(key);
    if (entry && entry.e > Date.now()) return entry.d;
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      const lockKey = `lock:${key}`;
      let locked = false;
      try {
        locked = (await redis.set(lockKey, '1', 'PX', 10000, 'NX')) === 'OK';
      } catch {
        locked = true; // redis hiccup: just fetch
      }
      if (!locked && entry) return entry.d; // another instance is refreshing -> serve stale
      try {
        const data = await fetcher();
        const ttlSec = typeof ttl === 'function' ? ttl(data) : ttl;
        const staleSec = opts.staleSec ?? Math.max(ttlSec * 10, 300);
        await writeEntry(key, data, ttlSec, staleSec);
        return data;
      } catch (err) {
        if (entry) {
          logger.warn({ err: err.message, key }, 'upstream failed, serving stale cache');
          return entry.d;
        }
        throw err;
      } finally {
        if (locked) redis.del(lockKey).catch(() => {});
      }
    })();

    inflight.set(key, job);
    try {
      return await job;
    } finally {
      inflight.delete(key);
    }
  }

  /** Returns fresh cached data or null (never calls upstream). */
  async function get(key) {
    const entry = await readEntry(key);
    return entry && entry.e > Date.now() ? entry.d : null;
  }

  const set = (key, data, ttlSec, staleSec = 0) => writeEntry(key, data, ttlSec, staleSec);
  const del = (...keys) => redis.del(...keys).catch(() => 0);

  return { wrap, get, set, del };
}

module.exports = { createCache };
