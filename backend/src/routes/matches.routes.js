'use strict';
const express = require('express');
const { z } = require('zod');
const { asyncHandler, HttpError } = require('../lib/errors');
const { parse, parseId } = require('../middleware/validate');
const { utcDate, DAY } = require('../utils/time');

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid ISO date');
const rangeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // UTC day, handy for curl / admin panel
  from: isoDate.optional(), // preferred: the client's local-day boundaries as UTC instants
  to: isoDate.optional(),
});

function resolveRange(q) {
  let from;
  let to;
  if (q.from && q.to) {
    from = Date.parse(q.from);
    to = Date.parse(q.to);
  } else {
    from = Date.parse(`${q.date || utcDate()}T00:00:00Z`);
    to = from + DAY;
  }
  if (!(to > from) || to - from > 2 * DAY) throw new HttpError(400, 'Range must be between 0 and 48 hours');
  return { from, to };
}

module.exports = ({ football, streams }) => {
  const r = express.Router();

  // Schedule for a day. The app sends its local midnight-to-midnight as UTC instants, so
  // "Today" is correct in every timezone while the cache stays keyed by UTC date.
  r.get('/matches', asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(parse(rangeSchema, req.query));
    const matches = await streams.mark(await football.fixturesInRange(from, to));
    res.set('Cache-Control', 'public, max-age=15');
    res.json({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), count: matches.length, matches });
  }));

  r.get('/matches/live', asyncHandler(async (_req, res) => {
    const matches = await streams.mark(await football.overlay(await football.liveFixtures()));
    res.set('Cache-Control', 'public, max-age=10');
    res.json({ count: matches.length, matches });
  }));

  r.get('/matches/by-ids', asyncHandler(async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseId(s)).slice(0, 20);
    const matches = await streams.mark(await football.fixturesByIds(ids));
    res.json({ count: matches.length, matches });
  }));

  r.get('/matches/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [details, links] = await Promise.all([football.fixtureDetails(id), req.userId ? streams.forFixture(id) : Promise.resolve([])]);
    if (!details) throw new HttpError(404, 'Match not found');
    res.json({ ...details, streams: links, hasStream: links.length > 0 });
  }));

  return r;
};
