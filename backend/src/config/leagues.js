'use strict';
// Curated list shown on the Standings screen. IDs are API-Football league ids.
const logo = (id) => `https://media.api-sports.io/football/leagues/${id}.png`;

const FEATURED_LEAGUES = [
  { id: 2, name: 'UEFA Champions League', country: 'Europe' },
  { id: 3, name: 'UEFA Europa League', country: 'Europe' },
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 307, name: 'Saudi Pro League', country: 'Saudi Arabia' },
  { id: 233, name: 'Egyptian Premier League', country: 'Egypt' },
  { id: 253, name: 'Major League Soccer', country: 'USA' },
].map((l) => ({ ...l, logo: logo(l.id) }));

// Competitions shown in the schedule and followed by the live engine. Everything else the provider
// returns (hundreds of minor leagues) is dropped to keep payloads, polling and push volume small.
// Override with LEAGUE_IDS=39,140,2 or LEAGUE_IDS=all.
const DEFAULT_LEAGUE_IDS = [1, 2, 3, 4, 5, 6, 9, 12, 13, 15, 17, 39, 40, 45, 48, 61, 66, 78, 81, 88, 94, 135, 137, 140, 143, 203, 233, 253, 307, 848];

/** @returns {Set<number>|null} null means "no filter" (every competition). */
function parseLeagueFilter(value) {
  const v = String(value || 'default').trim().toLowerCase();
  if (v === 'all') return null;
  if (v !== 'default') {
    const ids = v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length) return new Set(ids);
  }
  return new Set(DEFAULT_LEAGUE_IDS);
}

module.exports = { FEATURED_LEAGUES, DEFAULT_LEAGUE_IDS, parseLeagueFilter };
