'use strict';
global.fetch = require('cross-fetch');
const http = require('http');
const express = require('express');
const env = require('./config/env');
const logger = require('./lib/logger');
const prisma = require('./lib/prisma');
const redis = require('./lib/redis');
const { createCache } = require('./lib/cache');
const { createProvider } = require('./providers');
const { FootballService } = require('./services/football.service');
const { createStreamsService } = require('./services/streams.service');
const { createConfigService } = require('./services/config.service');
const { PushService } = require('./services/push.service');
const { LiveUpdater } = require('./services/liveUpdater');
const { bootstrap } = require('./services/bootstrap');
const { createGateway } = require('./sockets/gateway');
const { createApp } = require('./app');

async function main() {
  await prisma.$connect();
  await bootstrap({ prisma, env, logger });

  // Order matters: the Express listener must be on the server *before* Socket.IO attaches,
  // otherwise Express would also answer /socket.io/ requests.
  const app = express();
  const server = http.createServer(app);
  const gateway = createGateway(server, { redis, env, logger });

  const cache = createCache(redis, logger);
  const provider = createProvider({ env, redis, logger });
  const football = new FootballService({ provider, cache, redis, env, logger });
  const configService = createConfigService({ prisma, cache });
  const streams = createStreamsService({ prisma, cache, configService });
  const push = new PushService({ env, logger });
  if (env.isProd && env.CORS_ORIGINS === '*') logger.warn('CORS_ORIGINS is "*": restrict it to your web origins in production');
  logger.info({ leagues: football.leagueFilter ? football.leagueFilter.size : 'all' }, 'league filter active');

  const container = { env, logger, prisma, redis, cache, provider, football, configService, streams, push, gateway };
  createApp(container, app);

  const updater = env.RUN_WORKER ? new LiveUpdater(container) : null;
  updater?.start();

  server.listen(env.PORT, () => logger.info({ port: env.PORT, provider: provider.name, worker: env.RUN_WORKER }, 'GoalPulse API listening'));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), 10000).unref();
    updater?.stop();
    await gateway.close(); // also closes the HTTP server
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
