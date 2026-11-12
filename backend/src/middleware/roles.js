'use strict';
const { HttpError } = require('../lib/errors');

/** Use after requireAdmin: only the listed roles may continue. */
const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.auth && req.auth.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));

module.exports = { requireRole };
