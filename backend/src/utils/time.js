'use strict';
const DAY = 86400000;

const utcDate = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/** UTC calendar dates (YYYY-MM-DD) touched by the half-open range [fromMs, toMs). */
function utcDatesBetween(fromMs, toMs) {
  const start = new Date(fromMs);
  let d = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const out = [];
  while (d < toMs) {
    out.push(utcDate(d));
    d += DAY;
  }
  return out;
}

/** Season year heuristic for European calendars (used only if the provider cannot tell us). */
function fallbackSeason(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

module.exports = { DAY, utcDate, utcDatesBetween, fallbackSeason };
