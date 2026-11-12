'use strict';
/**
 * Pure change detection between two polls of the live feed.
 * `before` is the stored snapshot ({s,m,h,a,ec}) or undefined for a fixture we have not seen.
 */
function snapshotOf(f) {
  return {
    s: f.status,
    m: f.minute ?? null,
    h: f.score?.home ?? 0,
    a: f.score?.away ?? 0,
    ec: Array.isArray(f.events) ? f.events.length : 0,
  };
}

function diffLive(before, f) {
  const cur = snapshotOf(f);
  const out = {
    cur,
    isNew: !before,
    changed: false, // anything visible changed (incl. minute) -> list update
    significant: false, // status / score / events changed -> match-room update + cache bust
    kickoff: false,
    halfTime: false,
    fullTime: false,
    goal: null,
    redCards: [],
    newEvents: [],
  };

  if (!before) {
    out.changed = true;
    out.significant = true;
    out.kickoff = f.status === 'LIVE' && (f.minute ?? 0) <= 3;
    return out;
  }

  const scoreChanged = before.h !== cur.h || before.a !== cur.a;
  out.significant = before.s !== cur.s || scoreChanged || before.ec !== cur.ec;
  out.changed = out.significant || before.m !== cur.m;
  out.halfTime = before.s !== 'HALF_TIME' && cur.s === 'HALF_TIME';
  out.fullTime = before.s !== 'FINISHED' && cur.s === 'FINISHED';

  if (cur.h > before.h || cur.a > before.a) {
    out.goal = { side: cur.h - before.h >= cur.a - before.a ? 'home' : 'away' };
  }
  if (Array.isArray(f.events) && cur.ec > before.ec) {
    out.newEvents = f.events.slice(before.ec);
    out.redCards = out.newEvents.filter((e) => e.kind === 'red_card' || e.kind === 'second_yellow');
  }
  return out;
}

/** Scorer name for the latest goal - only when the event feed is in sync with the score. */
function scorerName(f) {
  const goals = (f.events || []).filter((e) => e.type === 'GOAL' && e.kind !== 'missed_penalty');
  const total = (f.score?.home ?? 0) + (f.score?.away ?? 0);
  if (!goals.length || goals.length !== total) return null;
  return goals[goals.length - 1].player || null;
}

module.exports = { snapshotOf, diffLive, scorerName };
