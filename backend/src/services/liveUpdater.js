'use strict';
const crypto = require('crypto');
const { diffLive, scorerName } = require('../utils/liveDiff');
const { utcDate } = require('../utils/time');
const { stripEvents, TERMINAL } = require('../utils/fixtures');

const SNAP_KEY = 'live:snapshot'; // hash: fixtureId -> last seen {s,m,h,a,ec}
const LEADER_KEY = 'live:leader';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stateOf = (f) => ({ status: f.status, statusShort: f.statusShort, minute: f.minute, extra: f.extra, score: f.score });
const updateOf = (f) => ({ id: f.id, status: f.status, statusShort: f.statusShort, minute: f.minute, score: f.score });

/**
 * The real-time engine. Exactly ONE instance (the Redis-elected leader) polls the provider's
 * "live" endpoint - one upstream call per cycle no matter how many users are online - then:
 *   diff -> Socket.IO (rooms `live` and `match:{id}`) -> FCM topics -> Redis overlay for REST.
 * Polling is adaptive: it only runs while something is live or about to kick off.
 */
class LiveUpdater {
  constructor({ env, redis, cache, provider, football, gateway, push, logger }) {
    Object.assign(this, { env, redis, cache, provider, football, gateway, push, logger });
    this.id = crypto.randomUUID();
    this.running = false;
    this.failures = 0; // consecutive provider failures
    this.backoffUntil = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger.info({ intervalMs: this.env.LIVE_POLL_INTERVAL_MS }, 'live updater started');
    this.loop();
  }

  stop() {
    this.running = false;
  }

  async loop() {
    while (this.running) {
      const t0 = Date.now();
      try {
        await this.tick();
      } catch (err) {
        this.logger.error({ err: err.message }, 'live tick failed');
      }
      await sleep(Math.max(1000, this.env.LIVE_POLL_INTERVAL_MS - (Date.now() - t0)));
    }
  }

  /** Simple Redis leader election so scaling the API horizontally never multiplies upstream calls. */
  async isLeader() {
    const ttl = this.env.LIVE_POLL_INTERVAL_MS * 2 + 5000;
    const holder = await this.redis.get(LEADER_KEY);
    if (holder === this.id && (await this.redis.pexpire(LEADER_KEY, ttl)) === 1) return true;
    if (holder && holder !== this.id) return false;
    return (await this.redis.set(LEADER_KEY, this.id, 'PX', ttl, 'NX')) === 'OK';
  }

  async loadSnapshot() {
    const raw = await this.redis.hgetall(SNAP_KEY);
    const map = new Map();
    for (const [k, v] of Object.entries(raw)) {
      try {
        map.set(Number(k), JSON.parse(v));
      } catch {
        /* ignore corrupt entry */
      }
    }
    return map;
  }

  /** True if today's/yesterday's schedule says a match is in play or kicks off within 10 minutes. */
  async scheduleSuggestsLive() {
    const now = Date.now();
    const lists = await Promise.all([
      this.football.fixturesForDate(utcDate(now - 86400000)),
      this.football.fixturesForDate(utcDate(now)),
    ]);
    return lists.flat().some((f) => {
      const t = Date.parse(f.kickoff);
      if (f.status === 'LIVE' || f.status === 'HALF_TIME') return now - t < 4 * 3600e3;
      return f.status === 'NOT_STARTED' && t - now < 10 * 60e3 && now - t < 3 * 3600e3;
    });
  }

  async tick() {
    if (!(await this.isLeader())) return;
    await this.sendReminders().catch((err) => this.logger.warn({ err: err.message }, 'reminder check failed'));
    if (Date.now() < this.backoffUntil) return; // provider is failing: wait before hammering it
    const prev = await this.loadSnapshot();

    if (prev.size === 0 && !(await this.scheduleSuggestsLive())) {
      await this.cache.set('live:list', [], 60); // idle: nothing to poll, keep API calls at zero
      return;
    }
    const quota = await this.provider.getQuota();
    if (quota && quota.remaining != null && quota.remaining < this.env.DAILY_QUOTA_RESERVE) {
      this.logger.warn({ quota }, 'provider quota is low - live polling paused');
      return;
    }

    let live;
    try {
      live = await this.football.fetchLive();
      this.failures = 0;
    } catch (err) {
      this.failures += 1;
      const wait = Math.min(300000, this.env.LIVE_POLL_INTERVAL_MS * 2 ** this.failures); // exponential, max 5 min
      this.backoffUntil = Date.now() + wait;
      this.logger.warn({ err: err.message, failures: this.failures, retryInMs: wait }, 'live poll failed, backing off');
      return;
    }
    await this.cache.set('live:list', live.map(stripEvents), 90);

    const ctx = {
      pipe: this.redis.pipeline(),
      updates: [],
      tasks: [],
      stateTtl: Math.max(90, Math.ceil((this.env.LIVE_POLL_INTERVAL_MS * 3) / 1000)),
    };
    const seen = new Set();
    for (const f of live) {
      seen.add(f.id);
      this.process(prev.get(f.id), f, ctx);
    }
    const gone = [...prev.keys()].filter((id) => !seen.has(id));
    if (gone.length) await this.finalize(gone, prev, ctx);

    await ctx.pipe.exec();
    this.gateway.emitLive(ctx.updates);
    await Promise.allSettled(ctx.tasks);
  }

  /**
   * "Starting soon" reminders. Devices subscribe to remind_match_{id} / remind_team_{id} when the user follows
   * a match or team and keeps reminders on. Uses only the cached schedule, so it costs no provider calls.
   */
  async sendReminders() {
    const lead = (this.env.REMINDER_MINUTES || 15) * 60000;
    const now = Date.now();
    const dates = [utcDate(now)];
    if (utcDate(now + lead) !== dates[0]) dates.push(utcDate(now + lead)); // kick-off just after UTC midnight
    const lists = await Promise.all(dates.map((d) => this.football.fixturesForDate(d)));
    for (const f of lists.flat()) {
      if (f.status !== 'NOT_STARTED') continue;
      const until = Date.parse(f.kickoff) - now;
      if (until < 2 * 60000 || until > lead) continue; // outside the useful window
      await this.notify('REMINDER', f, `${f.id}`, { minutes: Math.round(until / 60000) });
    }
  }

  /** Persist one fixture's new state, emit sockets and queue pushes. Returns the diff. */
  process(before, f, ctx) {
    const diff = diffLive(before, f);
    const terminal = TERMINAL.has(f.status);
    // While live the overlay expires quickly (self-heals if the worker dies); finals are kept for 6 h.
    ctx.pipe.set(`fx:state:${f.id}`, JSON.stringify(stateOf(f)), 'EX', terminal ? 6 * 3600 : ctx.stateTtl);
    if (terminal) ctx.pipe.hdel(SNAP_KEY, String(f.id));
    else ctx.pipe.hset(SNAP_KEY, String(f.id), JSON.stringify(diff.cur));

    if (diff.changed) ctx.updates.push(updateOf(f));
    if (diff.significant) {
      ctx.tasks.push(this.football.invalidateDetails(f.id));
      this.gateway.emitMatch(f.id, { ...updateOf(f), events: diff.newEvents });
    }
    if (diff.kickoff) ctx.tasks.push(this.notify('KICKOFF', f, `${f.id}`));
    if (diff.goal) ctx.tasks.push(this.notify('GOAL', f, `${f.id}:${diff.cur.h}-${diff.cur.a}`, { scorer: scorerName(f), side: diff.goal.side }));
    for (const e of diff.redCards) ctx.tasks.push(this.notify('RED_CARD', f, `${f.id}:${e.minute}:${e.player}`, { event: e }));
    if (diff.halfTime) ctx.tasks.push(this.notify('HALF_TIME', f, `${f.id}`));
    if (diff.fullTime) ctx.tasks.push(this.notify('FULL_TIME', f, `${f.id}`));
    return diff;
  }

  /** Fixtures that vanished from the live feed: fetch their final state in one batched call. */
  async finalize(goneIds, prev, ctx) {
    let finals = [];
    try {
      finals = await this.provider.getFixturesByIds(goneIds);
    } catch (err) {
      this.logger.warn({ err: err.message }, 'could not fetch final state of finished matches');
    }
    const byId = new Map(finals.map((f) => [f.id, f]));
    for (const id of goneIds) {
      const before = prev.get(id);
      const f = byId.get(id);
      if (f && TERMINAL.has(f.status)) {
        this.process(before, f, ctx);
        continue;
      }
      // Not finished (feed glitch, extra-time break...): keep tracking for 3 cycles, then give up.
      const misses = (before.x || 0) + 1;
      if (misses >= 3) {
        ctx.pipe.hdel(SNAP_KEY, String(id));
      } else if (f) {
        const diff = this.process(before, f, ctx);
        ctx.pipe.hset(SNAP_KEY, String(id), JSON.stringify({ ...diff.cur, x: misses }));
      } else {
        ctx.pipe.hset(SNAP_KEY, String(id), JSON.stringify({ ...before, x: misses }));
      }
    }
  }

  /** Sends each distinct event once (Redis NX key), even if the worker restarts mid-match. */
  async notify(kind, f, suffix, extra = {}) {
    try {
      const first = await this.redis.set(`push:dedupe:${kind}:${suffix}`, '1', 'EX', 6 * 3600, 'NX');
      if (first !== 'OK') return;
      await this.push.notifyFixture(kind, f, extra);
    } catch (err) {
      this.logger.warn({ err: err.message, kind, fixture: f.id }, 'push notification failed');
    }
  }
}

module.exports = { LiveUpdater };
