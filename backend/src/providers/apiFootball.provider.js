'use strict';
const { FootballProvider } = require('./base');
const { UpstreamError } = require('../lib/errors');
const N = require('./apiFootball.normalize');
const { utcDate } = require('../utils/time');

/** API-Football (API-Sports) v3 adapter. Docs: https://www.api-football.com/documentation-v3 */
class ApiFootballProvider extends FootballProvider {
  constructor({ apiKey, baseUrl, redis, logger, budget = null, timeoutMs = 10000 }) {
    super();
    this.budget = budget;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.redis = redis;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
  }

  get name() {
    return 'apifootball';
  }

  async _get(path, params = {}) {
    if (this.budget) await this.budget.take(); // hard daily cap: throws UpstreamError when exhausted
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      this._trackQuota(res.headers);
      if (!res.ok) throw new UpstreamError(`API-Football HTTP ${res.status} on ${path}`);
      const body = await res.json();
      const errors = body.errors;
      const hasErrors = Array.isArray(errors) ? errors.length > 0 : !!errors && Object.keys(errors).length > 0;
      if (hasErrors) throw new UpstreamError(`API-Football error on ${path}: ${JSON.stringify(errors)}`);
      return body.response || [];
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`API-Football request failed on ${path}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Counts calls per UTC day and remembers the provider's own "remaining" header. */
  _trackQuota(headers) {
    const calls = `quota:${this.name}:calls:${utcDate()}`;
    this.redis.incr(calls).then(() => this.redis.expire(calls, 172800)).catch(() => {});
    const remaining = headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null) {
      const payload = {
        remaining: Number(remaining),
        limit: Number(headers.get('x-ratelimit-requests-limit')) || null,
        at: Date.now(),
      };
      this.redis.set(`quota:${this.name}:remaining`, JSON.stringify(payload), 'EX', 86400).catch(() => {});
    }
  }

  async getQuota() {
    let quota = null;
    try {
      const raw = await this.redis.get(`quota:${this.name}:remaining`);
      quota = raw ? JSON.parse(raw) : null;
    } catch {
      /* ignore */
    }
    if (this.budget && this.budget.limit) {
      const left = await this.budget.remaining();
      quota = { ...(quota || {}), remaining: quota?.remaining != null ? Math.min(quota.remaining, left) : left, limit: quota?.limit ?? this.budget.limit };
    }
    return quota;
  }

  async getFixturesByDate(dateUtc) {
    const rows = await this._get('/fixtures', { date: dateUtc, timezone: 'UTC' });
    return rows.map(N.normalizeFixture);
  }

  async getFixturesByIds(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 20) {
      // API-Football accepts up to 20 ids per call, dash separated.
      const rows = await this._get('/fixtures', { ids: ids.slice(i, i + 20).join('-') });
      out.push(...rows.map((r) => ({ ...N.normalizeFixture(r), events: N.normalizeEvents(r.events) })));
    }
    return out;
  }

  async getLiveFixtures() {
    const rows = await this._get('/fixtures', { live: 'all' });
    return rows.map((r) => ({ ...N.normalizeFixture(r), events: N.normalizeEvents(r.events) }));
  }

  async getFixtureDetails(id) {
    const rows = await this._get('/fixtures', { id });
    return rows.length ? N.normalizeDetails(rows[0]) : null;
  }

  async getStandings(leagueId, season) {
    return N.normalizeStandings(await this._get('/standings', { league: leagueId, season }));
  }

  async getTopScorers(leagueId, season) {
    return N.normalizeTopPlayers(await this._get('/players/topscorers', { league: leagueId, season }));
  }

  async getTopAssists(leagueId, season) {
    return N.normalizeTopPlayers(await this._get('/players/topassists', { league: leagueId, season }));
  }

  async getCurrentSeason(leagueId) {
    const rows = await this._get('/leagues', { id: leagueId, current: 'true' });
    const seasons = rows[0]?.seasons || [];
    return (seasons.find((s) => s.current) || seasons[0])?.year ?? null;
  }
}

module.exports = { ApiFootballProvider };
