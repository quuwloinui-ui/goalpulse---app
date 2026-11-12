'use strict';
const { ApiFootballProvider } = require('./apiFootball.provider');
const { SportScoreProvider } = require('./sportscore.provider');
const { MockProvider } = require('./mock.provider');
const { createBudget } = require('../lib/budget');

// Register new vendors here (e.g. sportmonks: (ctx) => new SportMonksProvider(...)).
const registry = {
  apifootball: ({ env, redis, logger }) =>
    new ApiFootballProvider({
      apiKey: env.API_FOOTBALL_KEY,
      baseUrl: env.API_FOOTBALL_BASE_URL,
      redis,
      logger,
      budget: createBudget({ redis, name: 'apifootball', limit: env.DAILY_REQUEST_BUDGET }),
    }),
  // Free tier: no key, ~10,000 requests / 24 h / IP. The default cap keeps a safety margin below that.
  sportscore: ({ env, redis, logger }) =>
    new SportScoreProvider({
      baseUrl: env.SPORTSCORE_BASE_URL,
      redis,
      logger,
      leagues: env.SPORTSCORE_LEAGUES,
      budget: createBudget({ redis, name: 'sportscore', limit: env.DAILY_REQUEST_BUDGET || 9000 }),
    }),
  mock: ({ logger }) => {
    logger.warn('Using the MOCK football provider. Set FOOTBALL_PROVIDER=apifootball for real data.');
    return new MockProvider();
  },
};

function createProvider(ctx) {
  const build = registry[ctx.env.FOOTBALL_PROVIDER];
  if (!build) throw new Error(`Unknown FOOTBALL_PROVIDER "${ctx.env.FOOTBALL_PROVIDER}"`);
  return build(ctx);
}

module.exports = { createProvider };
