'use strict';
const env = require('../src/config/env');
const logger = require('../src/lib/logger');
const prisma = require('../src/lib/prisma');
const { bootstrap } = require('../src/services/bootstrap');

(async () => {
  await bootstrap({ prisma, env, logger });
  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.create({
      data: {
        title: 'Welcome to GoalPulse',
        imageUrl: 'https://placehold.co/960x240/0E3B2C/F5C400?text=GoalPulse',
        placement: 'HOME_TOP',
        isActive: false, // enable it from the admin panel
      },
    });
  }
  logger.info('seed complete');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
