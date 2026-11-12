'use strict';
const { UpstreamError } = require('./errors');
const { utcDate } = require('../utils/time');

/**
 * Hard cap on upstream requests per UTC day, shared by every instance through Redis.
 * limit 0 disables it. When the cap is hit, take() throws, the cache layer then serves stale data
 * and the live engine backs off, so the free quota is never exceeded.
 */
function createBudget({ redis, name, limit }) {
  const key = () => `budget:${name}:${utcDate()}`;
  return {
    limit,
    async take() {
      if (!limit) return;
      let used;
      try {
        used = await redis.incr(key());
        if (used === 1) await redis.expire(key(), 172800);
      } catch {
        return; // Redis hiccup: do not block the provider
      }
      if (used > limit) throw new UpstreamError(`${name}: daily request budget of ${limit} is used up`);
    },
    async used() {
      return Number((await redis.get(key()).catch(() => 0)) || 0);
    },
    async remaining() {
      return limit ? Math.max(0, limit - (await this.used())) : null;
    },
  };
}

module.exports = { createBudget };
