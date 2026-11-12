'use strict';
const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { userIdFromRequest, hasUserToken } = require('../middleware/auth');
const { HttpError } = require('../lib/errors');

module.exports = function buildRoutes(c) {
  const r = express.Router();
  // The verified device id is attached once and reused. Rate limits are per device instead of
  // per IP, so many users behind one carrier-grade NAT address are not throttled together.
  r.use((req, _res, next) => {
    req.userId = userIdFromRequest(req);
    if (!req.userId && hasUserToken(req) && !req.path.startsWith('/auth/')) return next(new HttpError(401, 'Session expired')); // app re-registers and retries
    return next();
  });
  r.use(rateLimit({
    redis: c.redis,
    max: c.env.RATE_LIMIT_PER_MIN,
    keyFn: (req) => (req.userId ? `u:${req.userId}` : `ip:${req.ip}`),
  }));
  r.use(require('./matches.routes')(c));
  r.use(require('./leagues.routes')(c));
  r.use(require('./user.routes')(c));
  r.use(require('./content.routes')(c));
  r.use('/admin', require('./admin.routes')(c));
  return r;
};
