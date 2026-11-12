'use strict';
/** Fixed-window limiter backed by Redis (shared across instances). Fails open if Redis is down. */
function rateLimit({ redis, max = 120, windowSec = 60, prefix = 'rl', keyFn = (req) => req.ip }) {
  return async (req, res, next) => {
    try {
      const bucket = Math.floor(Date.now() / (windowSec * 1000));
      const key = `${prefix}:${keyFn(req)}:${bucket}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec + 1);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - n)));
      if (n > max) {
        res.set('Retry-After', String(windowSec));
        return res.status(429).json({ error: 'Too many requests, slow down.' });
      }
    } catch {
      /* fail open */
    }
    return next();
  };
}

module.exports = { rateLimit };
