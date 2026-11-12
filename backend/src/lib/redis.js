'use strict';
const Redis = require('ioredis');
const env = require('../config/env');
const logger = require('./logger');

// rediss:// URLs (managed Redis with TLS) are handled automatically by ioredis.
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });
redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));

module.exports = redis;
