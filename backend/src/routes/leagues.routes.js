'use strict';
const express = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../lib/errors');
const { parse, parseId } = require('../middleware/validate');

const seasonQuery = z.object({ season: z.coerce.number().int().min(2000).max(2100).optional() });

module.exports = ({ football }) => {
  const r = express.Router();
  const cached = (res) => res.set('Cache-Control', 'public, max-age=120');

  r.get('/leagues', (_req, res) => res.json({ leagues: football.leagues() }));

  r.get('/leagues/:id/standings', asyncHandler(async (req, res) => {
    const { season } = parse(seasonQuery, req.query);
    cached(res).json(await football.standings(parseId(req.params.id), season));
  }));

  r.get('/leagues/:id/top-scorers', asyncHandler(async (req, res) => {
    const { season } = parse(seasonQuery, req.query);
    cached(res).json(await football.topScorers(parseId(req.params.id), season));
  }));

  r.get('/leagues/:id/top-assists', asyncHandler(async (req, res) => {
    const { season } = parse(seasonQuery, req.query);
    cached(res).json(await football.topAssists(parseId(req.params.id), season));
  }));

  return r;
};
