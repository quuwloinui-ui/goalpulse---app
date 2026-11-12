'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { HttpError } = require('../lib/errors');

const USER_AUD = 'goalpulse-app';
const ADMIN_AUD = 'goalpulse-admin';

const signUserToken = (user) =>
  jwt.sign({ typ: 'user' }, env.JWT_SECRET, { subject: user.id, audience: USER_AUD, expiresIn: env.JWT_EXPIRES_IN });

// `ver` must match Admin.tokenVersion, so a password change revokes every older token.
const signAdminToken = (admin) =>
  jwt.sign({ typ: 'admin', email: admin.email, role: admin.role, ver: admin.tokenVersion ?? 0 }, env.JWT_SECRET, {
    subject: admin.id,
    audience: ADMIN_AUD,
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
  });

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

/** Verified device id (user-token subject) or null. Never throws. */
function userIdFromRequest(req) {
  const token = bearer(req);
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET, { audience: USER_AUD, algorithms: ['HS256'] }).sub || null;
  } catch {
    return null;
  }
}

/** True when the request carries a *device* token (even an expired/invalid one). */
function hasUserToken(req) {
  const token = bearer(req);
  const decoded = token ? jwt.decode(token) : null;
  return Boolean(decoded && decoded.aud === USER_AUD);
}

function guard(audience) {
  return (req, _res, next) => {
    const token = bearer(req);
    if (!token) return next(new HttpError(401, 'Authentication required'));
    try {
      const p = jwt.verify(token, env.JWT_SECRET, { audience, algorithms: ['HS256'] });
      req.auth = { id: p.sub, email: p.email, role: p.role, ver: p.ver };
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}

module.exports = { signUserToken, signAdminToken, userIdFromRequest, hasUserToken, requireUser: guard(USER_AUD), requireAdmin: guard(ADMIN_AUD) };
