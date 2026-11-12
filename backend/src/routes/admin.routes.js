'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { asyncHandler, HttpError } = require('../lib/errors');
const { parse, parseId } = require('../middleware/validate');
const { requireAdmin, signAdminToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { requireRole } = require('../middleware/roles');
const { utcDate } = require('../utils/time');

const DUMMY_HASH = bcrypt.hashSync('goalpulse-dummy-password', 10); // equalises login timing

const httpsUrl = z.string().url().max(2000).refine((u) => /^https:\/\//i.test(u), 'Must be an https:// URL');
const optDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
  .nullish()
  .transform((v) => (v ? new Date(v) : null));

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const streamSchema = z.object({
  fixtureId: z.coerce.number().int().positive(),
  matchLabel: z.string().max(160).nullish(),
  title: z.string().trim().min(1).max(100),
  url: httpsUrl,
  type: z.enum(['HLS', 'WEBVIEW']).default('HLS'),
  quality: z.string().max(20).nullish(),
  language: z.string().max(20).nullish(),
  priority: z.coerce.number().int().min(0).max(999).default(100),
  isActive: z.boolean().default(true),
  expiresAt: optDate,
});
const pushSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(300),
    target: z.enum(['all', 'topic']).default('all'),
    topic: z.string().regex(/^[a-zA-Z0-9_.~%-]{1,100}$/, 'Letters, digits and _ . ~ % - only').optional(),
    imageUrl: httpsUrl.optional(),
    fixtureId: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => v.target === 'all' || !!v.topic, { message: 'topic is required', path: ['topic'] });
const bannerSchema = z.object({
  title: z.string().trim().min(1).max(120),
  imageUrl: httpsUrl,
  targetUrl: httpsUrl.nullish(),
  placement: z.enum(['HOME_TOP', 'HOME_INLINE', 'MATCH_BOTTOM']).default('HOME_TOP'),
  priority: z.coerce.number().int().min(0).max(999).default(100),
  isActive: z.boolean().default(true),
  startsAt: optDate,
  endsAt: optDate,
});
const featureSchema = z.object({ enabled: z.boolean(), description: z.string().max(200).optional() });
const featureKey = z.string().regex(/^[a-z][a-zA-Z0-9_]{1,40}$/, 'Use a camelCase / snake_case key');
const newsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).nullish(),
  body: z.string().max(20000).nullish(),
  imageUrl: httpsUrl.nullish(),
  sourceUrl: httpsUrl.nullish(),
  isPublished: z.boolean().default(true),
});

const adminSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
  role: z.enum(['SUPER', 'EDITOR']).default('EDITOR'),
});
const passwordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(12).max(200) });

module.exports = ({ prisma, redis, provider, football, push, gateway, streams, configService }) => {
  const r = express.Router();

  r.post('/login', rateLimit({ redis, max: 10, prefix: 'rl:login' }),
    rateLimit({ redis, max: 8, windowSec: 900, prefix: 'rl:login-acct', keyFn: (req) => String(req.body?.email || '').toLowerCase().slice(0, 200) || 'none' }),
    asyncHandler(async (req, res) => {
    const b = parse(loginSchema, req.body);
    const admin = await prisma.admin.findUnique({ where: { email: b.email.toLowerCase() } });
    const ok = await bcrypt.compare(b.password, admin ? admin.passwordHash : DUMMY_HASH);
    if (!admin || !ok) throw new HttpError(401, 'Invalid email or password');
    res.json({ token: signAdminToken(admin), email: admin.email, role: admin.role });
  }));

  r.use(requireAdmin); // everything below needs an admin JWT
  // Re-check the account on every call: deleting an admin, changing a role or a password takes effect at once.
  r.use(asyncHandler(async (req, _res, next) => {
    const me = await prisma.admin.findUnique({ where: { id: req.auth.id }, select: { email: true, role: true, tokenVersion: true } });
    if (!me || me.tokenVersion !== req.auth.ver) throw new HttpError(401, 'Session expired, please sign in again');
    req.auth.email = me.email;
    req.auth.role = me.role;
    next();
  }));

  r.get('/stats', asyncHandler(async (_req, res) => {
    const [users, activeStreams, activeBanners, notificationsSent, live, calls, quota] = await Promise.all([
      prisma.user.count(),
      prisma.streamLink.count({ where: { isActive: true } }),
      prisma.banner.count({ where: { isActive: true } }),
      prisma.notificationLog.count(),
      football.liveFixtures().catch(() => []),
      redis.get(`quota:${provider.name}:calls:${utcDate()}`).catch(() => null),
      provider.getQuota(),
    ]);
    res.json({
      users, activeStreams, activeBanners, notificationsSent,
      liveNow: live.length,
      provider: provider.name,
      apiCallsToday: Number(calls || 0),
      quota,
      pushEnabled: push.enabled,
      socketClients: gateway.clientCount(),
    });
  }));

  // ── Stream links ───────────────────────────────────────────────
  r.get('/streams', asyncHandler(async (req, res) => {
    const fixtureId = req.query.fixtureId ? parseId(req.query.fixtureId, 'fixtureId') : undefined;
    res.json({ streams: await prisma.streamLink.findMany({ where: { fixtureId }, orderBy: { createdAt: 'desc' }, take: 300 }) });
  }));

  const afterStreamChange = async (fixtureId) => {
    await streams.invalidate();
    gateway.emitMatch(fixtureId, { refresh: true }); // open match screens re-fetch immediately
  };

  r.post('/streams', asyncHandler(async (req, res) => {
    const data = parse(streamSchema, req.body);
    const row = await prisma.streamLink.create({ data: { ...data, createdBy: req.auth.email } });
    await afterStreamChange(row.fixtureId);
    res.status(201).json(row);
  }));

  r.put('/streams/:id', asyncHandler(async (req, res) => {
    const data = parse(streamSchema.partial(), req.body);
    const row = await prisma.streamLink.update({ where: { id: parseId(req.params.id) }, data });
    await afterStreamChange(row.fixtureId);
    res.json(row);
  }));

  r.delete('/streams/:id', asyncHandler(async (req, res) => {
    const row = await prisma.streamLink.delete({ where: { id: parseId(req.params.id) } });
    await afterStreamChange(row.fixtureId);
    res.status(204).end();
  }));

  // ── Push notifications ─────────────────────────────────────────
  r.get('/notifications', asyncHandler(async (_req, res) => {
    res.json({ notifications: await prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) });
  }));

  r.post('/notifications', requireRole('SUPER'), asyncHandler(async (req, res) => {
    const b = parse(pushSchema, req.body);
    const topic = b.target === 'all' ? 'all' : b.topic;
    let status = 'SENT';
    let error = null;
    try {
      const out = await push.send({
        topic, title: b.title, body: b.body, imageUrl: b.imageUrl,
        data: { type: 'ADMIN', ...(b.fixtureId ? { fixtureId: b.fixtureId } : {}) },
      });
      if (out.dryRun) status = 'DRY_RUN';
    } catch (err) {
      status = 'FAILED';
      error = err.message;
    }
    const log = await prisma.notificationLog.create({ data: { title: b.title, body: b.body, target: topic, status, error, sentBy: req.auth.email } });
    res.status(status === 'FAILED' ? 502 : 201).json(log);
  }));

  // ── Feature flags ──────────────────────────────────────────────
  r.get('/features', asyncHandler(async (_req, res) => {
    res.json({ features: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) });
  }));

  r.put('/features/:key', requireRole('SUPER'), asyncHandler(async (req, res) => {
    const key = parse(featureKey, req.params.key);
    const b = parse(featureSchema, req.body);
    const row = await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: b.enabled, description: b.description ?? null },
      update: { enabled: b.enabled, ...(b.description !== undefined ? { description: b.description } : {}) },
    });
    await configService.invalidate();
    res.json(row);
  }));

  // ── Banners / ads ──────────────────────────────────────────────
  r.get('/banners', asyncHandler(async (_req, res) => {
    res.json({ banners: await prisma.banner.findMany({ orderBy: [{ priority: 'asc' }, { id: 'desc' }] }) });
  }));

  r.post('/banners', asyncHandler(async (req, res) => {
    const row = await prisma.banner.create({ data: parse(bannerSchema, req.body) });
    await configService.invalidate();
    res.status(201).json(row);
  }));

  r.put('/banners/:id', asyncHandler(async (req, res) => {
    const row = await prisma.banner.update({ where: { id: parseId(req.params.id) }, data: parse(bannerSchema.partial(), req.body) });
    await configService.invalidate();
    res.json(row);
  }));

  r.delete('/banners/:id', asyncHandler(async (req, res) => {
    await prisma.banner.delete({ where: { id: parseId(req.params.id) } });
    await configService.invalidate();
    res.status(204).end();
  }));

  // ── News ───────────────────────────────────────────────────────
  r.get('/news', asyncHandler(async (_req, res) => {
    res.json({ articles: await prisma.newsArticle.findMany({ orderBy: { publishedAt: 'desc' }, take: 100 }) });
  }));
  r.post('/news', asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.newsArticle.create({ data: parse(newsSchema, req.body) }));
  }));
  r.delete('/news/:id', asyncHandler(async (req, res) => {
    await prisma.newsArticle.delete({ where: { id: parseId(req.params.id) } });
    res.status(204).end();
  }));

  // ── Team (SUPER only) and own password ─────────────────────────
  const adminPublic = { id: true, email: true, role: true, createdAt: true };

  r.get('/admins', requireRole('SUPER'), asyncHandler(async (_req, res) => {
    res.json({ admins: await prisma.admin.findMany({ select: adminPublic, orderBy: { createdAt: 'asc' } }) });
  }));

  r.post('/admins', requireRole('SUPER'), asyncHandler(async (req, res) => {
    const b = parse(adminSchema, req.body);
    const row = await prisma.admin.create({
      data: { email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12), role: b.role },
      select: adminPublic,
    });
    res.status(201).json(row);
  }));

  r.delete('/admins/:id', requireRole('SUPER'), asyncHandler(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    if (id === req.auth.id) throw new HttpError(400, 'You cannot delete your own account');
    const target = await prisma.admin.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'Admin not found');
    if (target.role === 'SUPER' && (await prisma.admin.count({ where: { role: 'SUPER' } })) <= 1) {
      throw new HttpError(400, 'At least one super admin must remain');
    }
    await prisma.admin.delete({ where: { id } });
    res.status(204).end();
  }));

  r.post('/password', asyncHandler(async (req, res) => {
    const b = parse(passwordSchema, req.body);
    const me = await prisma.admin.findUnique({ where: { id: req.auth.id } });
    if (!me || !(await bcrypt.compare(b.current, me.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
    await prisma.admin.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(b.next, 12), tokenVersion: { increment: 1 } } });
    res.status(204).end(); // every existing token, including this one, is now invalid
  }));

  return r;
};
