'use strict';
require('dotenv').config();
const { z } = require('zod');
const { assessJwtSecret, assessAdminPassword } = require('./secrets');

const bool = (def) => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    CORS_ORIGINS: z.string().default('*'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('30d'),
    ADMIN_JWT_EXPIRES_IN: z.string().default('12h'),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    FOOTBALL_PROVIDER: z.enum(['sportscore', 'apifootball', 'mock']).default('sportscore'),
    SPORTSCORE_BASE_URL: z.string().default('https://sportscore.com'),
    SPORTSCORE_LEAGUES: z.string().default('default'), // default | all | comma-separated competition-name fragments
    API_FOOTBALL_KEY: z.string().optional(),
    API_FOOTBALL_BASE_URL: z.string().default('https://v3.football.api-sports.io'),
    LIVE_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(60000),
    TODAY_FIXTURES_TTL_SEC: z.coerce.number().int().min(30).default(300),
    DAILY_QUOTA_RESERVE: z.coerce.number().int().min(0).default(50),
    DAILY_REQUEST_BUDGET: z.coerce.number().int().min(0).default(0), // hard cap of provider calls per UTC day (0 = off)
    REMINDER_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
    RUN_WORKER: bool('true'),
    RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).default(120),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    LEAGUE_IDS: z.string().default('default'),
    SOCKET_MAX_CONN_PER_IP: z.coerce.number().int().min(1).default(100),
    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production') {
      const jwtProblem = assessJwtSecret(v.JWT_SECRET);
      if (jwtProblem) ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: jwtProblem });
      const pwProblem = v.ADMIN_PASSWORD ? assessAdminPassword(v.ADMIN_PASSWORD) : null;
      if (pwProblem) ctx.addIssue({ code: 'custom', path: ['ADMIN_PASSWORD'], message: pwProblem });
    }
    if (v.FOOTBALL_PROVIDER === 'apifootball' && !v.API_FOOTBALL_KEY) {
      ctx.addIssue({ code: 'custom', path: ['API_FOOTBALL_KEY'], message: 'required when FOOTBALL_PROVIDER=apifootball' });
    }
  });

// Treat empty strings (e.g. "API_FOOTBALL_KEY=") as "not set".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(raw);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

const e = parsed.data;
module.exports = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  corsOrigins: e.CORS_ORIGINS === '*' ? '*' : e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
