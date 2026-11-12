'use strict';
const crypto = require('crypto');
const { FootballProvider } = require('./base');
const { UpstreamError } = require('../lib/errors');
const N = require('./sportscore.normalize');
const { utcDate } = require('../utils/time');

const PAGE_CAP = 100; // the day-fixtures endpoint returned exactly 100 rows in the captured sample
const MAX_PAGES = 10;
const MEM_TTL_MS = 45000; // SportScore caches 60 s at the edge; one shared list per UTC day per process

/**
 * SportScore (https://sportscore.com/developers/) adapter. Free tier: no key, ~10,000 requests / 24 h / IP,
 * "Powered by SportScore" link required wherever the data is shown (the mobile app shows it on every screen).
 *
 * One source for everything: the day list (/api/v1/fixtures/) feeds schedules AND the live engine
 * (/api/widget/matches/ is NOT used: the sample showed it returns the day's earliest matches, not live ones).
 */
class SportScoreProvider extends FootballProvider {
  constructor({ baseUrl = 'https://sportscore.com', redis, logger, budget = null, leagues = 'default', timeoutMs = 60000, fetchImpl = null }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.redis = redis;
    this.logger = logger;
    this.budget = budget;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.leaguesSetting = leagues;
    this.filter = N.buildFilter(leagues);
    this.paging = null; // null = not discovered yet | 'limit' | 'page' | 'offset' | 'none'
    this.pagingLoaded = false;
    this.days = new Map(); // date -> { at, list }
    this.inflight = new Map();
    this.index = new Map(); // fixtureId -> { slug, fx }
    this.persistedAt = new Map(); // date -> ms (throttles Redis writes)
  }

  get name() {
    return 'sportscore';
  }

  // ───────── hooks used by FootballService ─────────
  filterTag() {
    return `ss${crypto.createHash('md5').update(String(this.leaguesSetting)).digest('hex').slice(0, 6)}`;
  }

  filterFixtures(list) {
    return this.filter(list);
  }

  featuredLeagues() {
    return N.LEAGUES.map((l) => ({ id: l.id, name: l.name, country: l.country, logo: `https://media.api-sports.io/football/leagues/${l.id}.png` }));
  }

  // ───────── HTTP ─────────
  _isBudget(err) {
    return /budget/i.test(err?.message || '');
  }

  async _get(path, params = {}) {
    if (this.budget) await this.budget.take(); // hard daily cap: throws UpstreamError when used up
    const url = `${this.baseUrl}${path}?${new URLSearchParams(params)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'GoalPulse/1.0 (Powered by SportScore)' }, signal: ctrl.signal });
      this._track();
      if (!res.ok) throw new UpstreamError(`SportScore HTTP ${res.status} on ${path}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new UpstreamError(`SportScore returned non-JSON on ${path}`);
      }
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`SportScore request failed on ${path}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  _track() {
    const calls = `quota:${this.name}:calls:${utcDate()}`;
    this.redis.incr(calls).then(() => this.redis.expire(calls, 172800)).catch(() => {});
  }

  async getQuota() {
    if (this.budget && this.budget.limit) return { remaining: await this.budget.remaining(), limit: this.budget.limit };
    return null;
  }

  // ───────── paging discovery (the day endpoint returned 100 rows = very likely capped) ─────────
  async _loadPaging() {
    if (this.pagingLoaded) return;
    this.pagingLoaded = true;
    try {
      const v = await this.redis.get('ss:paging');
      if (v) this.paging = v;
    } catch { /* ignore */ }
  }

  _setPaging(kind) {
    this.paging = kind;
    this.logger.info({ paging: kind }, 'SportScore day-list paging strategy');
    this.redis.set('ss:paging', kind, 'EX', kind === 'none' ? 6 * 3600 : 7 * 86400).catch(() => {});
    if (kind === 'none') this.logger.warn('SportScore day list looks capped at 100 rows and no paging parameter worked: evening matches may be missing');
  }

  _rows(body) {
    return Array.isArray(body?.matches) ? body.matches : [];
  }

  _rowKey(r) {
    const u = String(r?.url || '');
    return u || `${r?.home}|${r?.away}|${r?.time}`;
  }

  async _collect(kind, params, firstRows) {
    const acc = [...firstRows];
    const seen = new Set(acc.map((r) => this._rowKey(r)));
    let ok = false;
    for (let i = 2; i <= MAX_PAGES; i += 1) {
      const rows = this._rows(await this._get('/api/v1/fixtures/', kind === 'page' ? { ...params, page: i } : { ...params, offset: (i - 1) * PAGE_CAP }));
      const fresh = rows.filter((r) => !seen.has(this._rowKey(r)));
      if (!fresh.length) break;
      ok = true;
      for (const r of fresh) { seen.add(this._rowKey(r)); acc.push(r); }
      if (rows.length < PAGE_CAP) break;
    }
    return { acc, ok };
  }

  async _fetchDayRows(date) {
    await this._loadPaging();
    const params = { sport: 'football', date };
    const path = '/api/v1/fixtures/';
    if (this.paging === 'limit') return this._rows(await this._get(path, { ...params, limit: 500 }));

    const firstRows = this._rows(await this._get(path, params));
    if (firstRows.length < PAGE_CAP || this.paging === 'none') return firstRows;
    if (this.paging === 'page' || this.paging === 'offset') return (await this._collect(this.paging, params, firstRows)).acc;

    // Unknown strategy: try the plausible parameters once, keep whichever returns new rows.
    try {
      const rows = this._rows(await this._get(path, { ...params, limit: 500 }));
      if (rows.length > firstRows.length) { this._setPaging('limit'); return rows; }
    } catch (err) { if (this._isBudget(err)) throw err; }
    for (const kind of ['page', 'offset']) {
      try {
        const { acc, ok } = await this._collect(kind, params, firstRows);
        if (ok) { this._setPaging(kind); return acc; }
      } catch (err) { if (this._isBudget(err)) throw err; }
    }
    this._setPaging('none');
    return firstRows;
  }

  // ───────── day lists (shared by schedules, live engine, by-id lookups) ─────────
  async _dayList(date) {
    const hit = this.days.get(date);
    if (hit && Date.now() - hit.at < MEM_TTL_MS) return hit.list;
    if (this.inflight.has(date)) return this.inflight.get(date);
    const job = (async () => {
      const rows = await this._fetchDayRows(date);
      const byId = new Map();
      for (const raw of rows) {
        const n = N.normalizeMatch(raw);
        if (n) byId.set(n.fixture.id, n);
      }
      const items = [...byId.values()].sort((a, b) => Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff) || a.fixture.id - b.fixture.id);
      const list = items.map((x) => x.fixture);
      this.days.set(date, { at: Date.now(), list });
      if (this.days.size > 6) this.days.delete(this.days.keys().next().value);
      this._remember(date, items);
      return list;
    })().finally(() => this.inflight.delete(date));
    this.inflight.set(date, job);
    return job;
  }

  _remember(date, items) {
    for (const x of items) this.index.set(x.fixture.id, { slug: x.slug, fx: x.fixture });
    if (this.index.size > 6000) for (const k of [...this.index.keys()].slice(0, 2000)) this.index.delete(k);
    if (Date.now() - (this.persistedAt.get(date) || 0) < 10 * 60000) return; // Redis copy only every 10 min per day
    this.persistedAt.set(date, Date.now());
    try {
      const p = this.redis.pipeline();
      for (const x of items) p.set(`ss:fx:${x.fixture.id}`, JSON.stringify({ s: x.slug, f: x.fixture }), 'EX', 3 * 86400);
      p.exec().catch(() => {});
    } catch { /* ignore */ }
  }

  async _lookup(id) {
    const hit = this.index.get(id);
    if (hit) return hit;
    try {
      const raw = await this.redis.get(`ss:fx:${id}`);
      if (raw) {
        const v = JSON.parse(raw);
        return { slug: v.s, fx: v.f };
      }
    } catch { /* ignore */ }
    return null;
  }

  // ───────── FootballProvider contract ─────────
  async getFixturesByDate(dateUtc) {
    return this._dayList(dateUtc);
  }

  async getLiveFixtures() {
    const now = Date.now();
    const dates = [utcDate(now)];
    if (new Date(now).getUTCHours() < 4) dates.unshift(utcDate(now - 86400000)); // matches that kicked off before midnight UTC
    const lists = await Promise.all(dates.map((d) => this._dayList(d)));
    return lists.flat().filter((f) => f.status === 'LIVE' || f.status === 'HALF_TIME').map((f) => ({ ...f, events: [] }));
  }

  async getFixturesByIds(ids) {
    const out = [];
    for (const id of ids) {
      const hit = await this._lookup(id);
      if (hit) out.push({ ...hit.fx, events: [] });
    }
    return out;
  }

  async getFixtureDetails(id) {
    const hit = await this._lookup(id);
    if (!hit) return null;
    let extra = { venue: null, referee: null, events: [], lineups: [], statistics: [] };
    try {
      const body = await this._get('/api/widget/match/', { sport: 'football', slug: hit.slug });
      extra = N.parseMatchDetail(body, hit.fx);
    } catch (err) {
      if (this._isBudget(err)) throw err;
      this.logger.warn({ err: err.message, id }, 'SportScore match detail unavailable, returning the basic fixture');
    }
    return { ...hit.fx, venue: extra.venue, referee: extra.referee, events: extra.events, lineups: extra.lineups, statistics: extra.statistics };
  }

  async _leagueRows(leagueId, path, params, parse) {
    const league = N.LEAGUES.find((l) => l.id === leagueId);
    if (!league) throw new UpstreamError(`Competition ${leagueId} is not supported by the SportScore provider`);
    const negKey = `ss:noslug:${path}:${leagueId}`;
    if (await this.redis.get(negKey).catch(() => null)) throw new UpstreamError(`SportScore has no ${path} data for ${league.name} (retrying later)`);
    const known = await this.redis.get(`ss:slug:${leagueId}`).catch(() => null);
    const slugs = known ? [known, ...league.slugs.filter((s) => s !== known)] : league.slugs;
    for (const slug of slugs) {
      try {
        const result = parse(await this._get(path, { sport: 'football', slug, ...params }), league);
        const has = Array.isArray(result) ? result.length : result.groups?.length;
        if (has) {
          this.redis.set(`ss:slug:${leagueId}`, slug, 'EX', 30 * 86400).catch(() => {});
          return result;
        }
      } catch (err) {
        if (this._isBudget(err)) throw err;
      }
    }
    this.redis.set(negKey, '1', 'EX', 600).catch(() => {});
    throw new UpstreamError(`SportScore returned no usable ${path} data for ${league.name}`);
  }

  async getStandings(leagueId) {
    return this._leagueRows(leagueId, '/api/widget/standings/', {}, (b, l) => N.parseStandings(b, l));
  }

  async getTopScorers(leagueId) {
    return this._leagueRows(leagueId, '/api/widget/topscorers/', { limit: 20, stat: 'goals' }, (b) => N.parseTopPlayers(b, 'goals'));
  }

  async getTopAssists(leagueId) {
    return this._leagueRows(leagueId, '/api/widget/topscorers/', { limit: 20, stat: 'assists' }, (b) => N.parseTopPlayers(b, 'assists'));
  }

  async getCurrentSeason() {
    return null;
  }
}

module.exports = { SportScoreProvider };
