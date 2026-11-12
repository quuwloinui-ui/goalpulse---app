'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');
const buildRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

/** `app` may be created earlier: Socket.IO must attach to a server that already has the Express listener. */
function createApp(c, app = express()) {
  const { env, logger } = c;

  app.set('trust proxy', env.TRUST_PROXY); // Render / Railway / ALB terminate TLS in front of us
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': env.isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins === '*' ? true : env.corsOrigins }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    const checks = { db: false, redis: false };
    try { await c.prisma.$queryRaw`SELECT 1`; checks.db = true; } catch { /* reported below */ }
    try { checks.redis = (await c.redis.ping()) === 'PONG'; } catch { /* reported below */ }
    const ok = checks.db && checks.redis;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', ...checks, provider: c.provider.name, uptimeSec: Math.round(process.uptime()) });
  });

  app.get('/', (_req, res) => res.redirect('/admin/'));
  app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html')));
  app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), { maxAge: '5m' }));
  app.use('/api/v1', buildRoutes(c));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
