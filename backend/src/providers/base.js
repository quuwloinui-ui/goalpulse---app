'use strict';
/**
 * Contract every football data provider implements.
 * Providers return NORMALISED data only (see README "Data contract"), so nothing outside
 * src/providers ever sees a vendor-specific shape. To add SportMonks (or any other vendor):
 *   1. create sportmonks.provider.js extending FootballProvider and map the vendor payloads,
 *   2. register it in providers/index.js,
 *   3. set FOOTBALL_PROVIDER=sportmonks.
 */
const nie = (m) => {
  throw new Error(`${m}() not implemented`);
};

class FootballProvider {
  get name() {
    return nie('name');
  }
  /** @param {string} dateUtc YYYY-MM-DD (UTC). @returns {Promise<Fixture[]>} */
  async getFixturesByDate(dateUtc) {
    return nie('getFixturesByDate');
  }
  /** @param {number[]} ids @returns {Promise<Fixture[]>} (with `events`) */
  async getFixturesByIds(ids) {
    return nie('getFixturesByIds');
  }
  /** All in-play fixtures, each with `events`. */
  async getLiveFixtures() {
    return nie('getLiveFixtures');
  }
  /** Fixture + events + lineups + statistics, or null. */
  async getFixtureDetails(id) {
    return nie('getFixtureDetails');
  }
  /** @returns {Promise<{league, groups}>} */
  async getStandings(leagueId, season) {
    return nie('getStandings');
  }
  /** @returns {Promise<PlayerStat[]>} */
  async getTopScorers(leagueId, season) {
    return nie('getTopScorers');
  }
  async getTopAssists(leagueId, season) {
    return nie('getTopAssists');
  }
  /** @returns {Promise<number|null>} */
  async getCurrentSeason(leagueId) {
    return null;
  }
  /** Optional: remaining API quota ({remaining, limit}) or null. */
  async getQuota() {
    return null;
  }
}

module.exports = { FootballProvider };
