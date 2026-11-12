'use strict';

/** Token bucket for one socket: `capacity` events, refilled at `perSecond`. Returns true if the event may pass. */
function createThrottle({ capacity = 20, perSecond = 2, now = () => Date.now() } = {}) {
  let tokens = capacity;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/** Caps concurrent connections per key (client IP). */
function createConnectionLimiter(max) {
  const counts = new Map();
  return {
    acquire(key) {
      const n = (counts.get(key) || 0) + 1;
      if (n > max) return false;
      counts.set(key, n);
      return true;
    },
    release(key) {
      const n = (counts.get(key) || 0) - 1;
      if (n <= 0) counts.delete(key);
      else counts.set(key, n);
    },
    size: () => counts.size,
  };
}

module.exports = { createThrottle, createConnectionLimiter };
