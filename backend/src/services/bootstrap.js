'use strict';
const bcrypt = require('bcryptjs');
const { FEATURE_DEFAULTS } = require('../config/features');

/** Idempotent start-up tasks: default feature flags + first admin account. */
async function bootstrap({ prisma, env, logger }) {
  for (const [key, enabled, description] of FEATURE_DEFAULTS) {
    await prisma.featureFlag.upsert({ where: { key }, update: {}, create: { key, enabled, description } });
  }
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const email = env.ADMIN_EMAIL.toLowerCase();
    if (!(await prisma.admin.findUnique({ where: { email } }))) {
      await prisma.admin.create({ data: { email, passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12), role: 'SUPER' } });
      logger.info({ email }, 'admin account created');
    }
  } else if ((await prisma.admin.count()) === 0) {
    logger.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart.');
  }
}

module.exports = { bootstrap };
