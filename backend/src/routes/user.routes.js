'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { asyncHandler, HttpError } = require('../lib/errors');
const { parse, parseId } = require('../middleware/validate');
const { requireUser, signUserToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const DUMMY_HASH = bcrypt.hashSync('goalpulse-dummy-user-password', 10); // equalises login timing
const credsSchema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });
const byEmail = (req) => String(req.body?.email || '').toLowerCase().slice(0, 200) || 'none';

const deviceSchema = z.object({
  deviceId: z.string().min(8).max(128),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']).default('ANDROID'),
  fcmToken: z.string().max(4096).nullish(),
  locale: z.string().max(32).nullish(),
  tzOffsetMin: z.number().int().min(-840).max(840).nullish(),
  appVersion: z.string().max(32).nullish(),
});
const profileSchema = deviceSchema.omit({ deviceId: true, platform: true });
const teamSchema = z.object({ name: z.string().min(1).max(120), logo: z.string().max(500).nullish() });
const matchSchema = z.object({
  homeName: z.string().max(120).nullish(),
  awayName: z.string().max(120).nullish(),
  kickoffAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date').nullish(),
});

/**
 * Anonymous, device-based accounts (no sign-up friction, like most score apps).
 * Favourites are stored here so they survive reinstalls; push fan-out itself uses FCM topics.
 */
module.exports = ({ prisma, redis }) => {
  const r = express.Router();

  r.post('/auth/device', rateLimit({ redis, max: 30, prefix: 'rl:auth' }), asyncHandler(async (req, res) => {
    const b = parse(deviceSchema, req.body);
    const user = await prisma.user.upsert({
      where: { deviceId: b.deviceId },
      create: {
        deviceId: b.deviceId, platform: b.platform, fcmToken: b.fcmToken ?? null, locale: b.locale ?? null,
        tzOffsetMin: b.tzOffsetMin ?? null, appVersion: b.appVersion ?? null,
      },
      update: {
        platform: b.platform, fcmToken: b.fcmToken ?? undefined, locale: b.locale ?? undefined,
        tzOffsetMin: b.tzOffsetMin ?? undefined, appVersion: b.appVersion ?? undefined, lastSeenAt: new Date(),
      },
    });
    res.json({ token: signUserToken(user), user: { id: user.id } });
  }));

  // Optional account on top of the anonymous device user: keeps favourites across devices.
  r.post('/auth/register', requireUser, rateLimit({ redis, max: 10, prefix: 'rl:register' }), asyncHandler(async (req, res) => {
    const b = parse(credsSchema, req.body);
    const me = await prisma.user.findUnique({ where: { id: req.auth.id }, select: { email: true } });
    if (!me) throw new HttpError(401, 'Session expired');
    if (me.email) throw new HttpError(409, 'This device already has an account');
    const email = b.email.toLowerCase();
    const user = await prisma.user.update({ where: { id: req.auth.id }, data: { email, passwordHash: await bcrypt.hash(b.password, 12) } }); // taken email -> 409
    res.json({ token: signUserToken(user), user: { id: user.id, email } });
  }));

  r.post('/auth/login', rateLimit({ redis, max: 10, prefix: 'rl:ulogin' }),
    rateLimit({ redis, max: 8, windowSec: 900, prefix: 'rl:ulogin-acct', keyFn: byEmail }), asyncHandler(async (req, res) => {
      const b = parse(credsSchema, req.body);
      const user = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
      const ok = await bcrypt.compare(b.password, user && user.passwordHash ? user.passwordHash : DUMMY_HASH);
      if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
      res.json({ token: signUserToken(user), user: { id: user.id, email: user.email } });
    }));

  // A token of a deleted account must stop working immediately.
  const mustExist = asyncHandler(async (req, _res, next) => {
    if (!(await prisma.user.findUnique({ where: { id: req.auth.id }, select: { id: true } }))) throw new HttpError(401, 'Session expired');
    next();
  });
  r.use('/me', requireUser, mustExist);

  r.get('/me', asyncHandler(async (req, res) => {
    res.json(await prisma.user.findUnique({ where: { id: req.auth.id }, select: { id: true, email: true, createdAt: true } }));
  }));

  // Account deletion (required by the stores): removes the user and, by cascade, favourites and saved matches.
  r.delete('/me', asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.auth.id } });
    res.status(204).end();
  }));

  r.put('/me', asyncHandler(async (req, res) => {
    const b = parse(profileSchema, req.body);
    await prisma.user.update({
      where: { id: req.auth.id },
      data: { fcmToken: b.fcmToken ?? undefined, locale: b.locale ?? undefined, tzOffsetMin: b.tzOffsetMin ?? undefined, appVersion: b.appVersion ?? undefined },
    });
    res.status(204).end();
  }));

  r.get('/me/favorites', asyncHandler(async (req, res) => {
    const [teams, matches] = await Promise.all([
      prisma.favoriteTeam.findMany({ where: { userId: req.auth.id }, orderBy: { createdAt: 'asc' } }),
      prisma.savedMatch.findMany({ where: { userId: req.auth.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ teams, matches });
  }));

  r.put('/me/favorites/teams/:teamId', asyncHandler(async (req, res) => {
    const teamId = parseId(req.params.teamId, 'teamId');
    const b = parse(teamSchema, req.body);
    const userId = req.auth.id;
    const row = await prisma.favoriteTeam.upsert({
      where: { userId_teamId: { userId, teamId } },
      create: { userId, teamId, name: b.name, logo: b.logo ?? null },
      update: { name: b.name, logo: b.logo ?? null },
    });
    res.json(row);
  }));

  r.delete('/me/favorites/teams/:teamId', asyncHandler(async (req, res) => {
    await prisma.favoriteTeam.deleteMany({ where: { userId: req.auth.id, teamId: parseId(req.params.teamId, 'teamId') } });
    res.status(204).end();
  }));

  r.put('/me/favorites/matches/:fixtureId', asyncHandler(async (req, res) => {
    const fixtureId = parseId(req.params.fixtureId, 'fixtureId');
    const b = parse(matchSchema, req.body);
    const userId = req.auth.id;
    const kickoffAt = b.kickoffAt ? new Date(b.kickoffAt) : null;
    const row = await prisma.savedMatch.upsert({
      where: { userId_fixtureId: { userId, fixtureId } },
      create: { userId, fixtureId, homeName: b.homeName ?? null, awayName: b.awayName ?? null, kickoffAt },
      update: { homeName: b.homeName ?? null, awayName: b.awayName ?? null, kickoffAt },
    });
    res.json(row);
  }));

  r.delete('/me/favorites/matches/:fixtureId', asyncHandler(async (req, res) => {
    await prisma.savedMatch.deleteMany({ where: { userId: req.auth.id, fixtureId: parseId(req.params.fixtureId, 'fixtureId') } });
    res.status(204).end();
  }));

  return r;
};
