'use strict';
const crypto = require('crypto');
const { FEATURED_LEAGUES, parseLeagueFilter } = require('../config/leagues');
const { utcDate, utcDatesBetween, fallbackSeason } = require('../utils/time');
const { stripEvents } = require('../utils/fixtures');

/**
 * Read model for football data. Everything goes through the Redis cache so the number of
 * upstream (rate-limited) provider calls is independent of the number of app users.
 */
class FootballService {
  constructor({ provider, cache, redis, env, logger }) {
    this.provider = provider;
    this.cache = cache;
    this.redis = redis;
    this.env = env;
    this.logger = logger;
    this.leagueFilter = parseLeagueFilter(env.LEAGUE_IDS); // null = every competition
    this.tag = typeof provider.filterTag === 'function' ? provider.filterTag() : this.leagueFilter
      ? crypto.createHash('md5').update([...this.leagueFilter].sort((a, b) => a - b).join(',')).digest('hex').slice(0, 8)
      : 'all';
  }

  /** Drops minor competitions: smaller payloads, fewer socket updates, no push noise. */
  filterLeagues(list) {
    if (typeof this.provider.filterFixtures === 'function') return this.provider.filterFixtures(list); // name-based (SportScore)
    return this.leagueFilter ? list.filter((f) => this.leagueFilter.has(f.leagueId)) : list;
  }

  /** The provider's live feed, restricted to the configured competitions (events included). */
  async fetchLive() {
    return this.filterLeagues(await this.provider.getLiveFixtures());
  }

  leagues() {
    return typeof this.provider.featuredLeagues === 'function' ? this.provider.featuredLeagues() : FEATURED_LEAGUES;
  }

  /** Merge real-time state written by the live updater (fx:state:{id}) onto cached fixtures. */
  async overlay(list) {
    if (!list.length) return list;
    let vals;
    try {
      vals = await this.redis.mget(list.map((f) => `fx:state:${f.id}`));
    } catch {
      return list;
    }
    return list.map((f, i) => {
      if (!vals[i]) return f;
      try {
        return { ...f, ...JSON.parse(vals[i]) };
      } catch {
        return f;
      }
    });
  }

  /** Fixtures for one UTC calendar day. Cached by UTC date so every timezone shares the same entry. */
  fixturesForDate(date) {
    const now = Date.now();
    let ttl = 30 * 60;
    if (date === utcDate(now)) ttl = this.env.TODAY_FIXTURES_TTL_SEC;
    else if (date < utcDate(now - 86400000)) ttl = 6 * 3600;
    return this.cache.wrap(`fx:date:${date}:${this.tag}`, ttl, async () => this.filterLeagues(await this.provider.getFixturesByDate(date)));
  }

  /** Fixtures whose kick-off is inside [fromMs, toMs) - lets clients ask for their *local* day. */
  async fixturesInRange(fromMs, toMs) {
    const dates = utcDatesBetween(fromMs, toMs);
    const lists = await Promise.all(dates.map((d) => this.fixturesForDate(d)));
    const seen = new Set();
    const out = [];
    for (const f of lists.flat()) {
      const t = Date.parse(f.kickoff);
      if (t >= fromMs && t < toMs && !seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
    out.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id);
    return this.overlay(out);
  }

  /** In-play fixtures (kept fresh by the LiveUpdater; falls back to a direct fetch). */
  liveFixtures() {
    return this.cache.wrap('live:list', 30, async () => (await this.fetchLive()).map(stripEvents));
  }

  async fixturesByIds(ids) {
    const sorted = [...new Set(ids)].sort((a, b) => a - b).slice(0, 20);
    if (!sorted.length) return [];
    const list = await this.cache.wrap(`fx:ids:${sorted.join('-')}`, 45, async () =>
      (await this.provider.getFixturesByIds(sorted)).map(stripEvents),
    );
    return this.overlay(list);
  }

  async fixtureDetails(id) {
    const ttl = (d) => {
      if (!d) return 30;
      if (d.status === 'FINISHED') return 3600;
      if (d.status === 'NOT_STARTED') return Date.parse(d.kickoff) - Date.now() < 90 * 60000 ? 60 : 600;
      return 20;
    };
    const details = await this.cache.wrap(`fx:detail:${id}`, ttl, () => this.provider.getFixtureDetails(id));
    if (!details) return null;
    const [merged] = await this.overlay([details]);
    return merged;
  }

  invalidateDetails(id) {
    return this.cache.del(`fx:detail:${id}`);
  }

  currentSeason(leagueId) {
    return this.cache.wrap(`season:${leagueId}`, 86400, async () => (await this.provider.getCurrentSeason(leagueId)) ?? fallbackSeason());
  }

  async standings(leagueId, season) {
    const s = season || (await this.currentSeason(leagueId));
    const data = await this.cache.wrap(`standings:${leagueId}:${s}`, 3600, () => this.provider.getStandings(leagueId, s));
    return { season: s, ...data };
  }

  async topScorers(leagueId, season) {
    const s = season || (await this.currentSeason(leagueId));
    const players = await this.cache.wrap(`scorers:${leagueId}:${s}`, 6 * 3600, () => this.provider.getTopScorers(leagueId, s));
    return { season: s, players };
  }

  async topAssists(leagueId, season) {
    const s = season || (await this.currentSeason(leagueId));
    const players = await this.cache.wrap(`assists:${leagueId}:${s}`, 6 * 3600, () => this.provider.getTopAssists(leagueId, s));
    return { season: s, players };
  }
}

module.exports = { FootballService };
