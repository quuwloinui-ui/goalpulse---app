'use strict';
const { HttpError } = require('../lib/errors');

const notFound = (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found' }); // Prisma: not found
  if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' }); // Prisma: unique constraint
  if (err.code === 'P2003') return res.status(401).json({ error: 'Session expired' }); // Prisma: FK (deleted user)
  if (err.name === 'UpstreamError') {
    req.log?.warn({ err: err.message }, 'upstream error');
    return res.status(502).json({ error: 'Football data provider is unavailable, try again shortly.' });
  }
  req.log?.error({ err }, 'unhandled error');
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
