'use strict';
const express = require('express');
const { asyncHandler } = require('../lib/errors');

module.exports = ({ configService, prisma }) => {
  const r = express.Router();

  // Remote config: feature toggles + active banners (managed from the admin panel).
  r.get('/config', asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await configService.publicConfig());
  }));

  r.get('/news', asyncHandler(async (req, res) => {
    if (!(await configService.isEnabled('news'))) return res.json({ articles: [] });
    const take = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const articles = await prisma.newsArticle.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take,
      select: { id: true, title: true, summary: true, body: true, imageUrl: true, sourceUrl: true, publishedAt: true },
    });
    return res.json({ articles });
  }));

  return r;
};
