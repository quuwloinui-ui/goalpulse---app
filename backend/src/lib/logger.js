'use strict';
const pino = require('pino');
const env = require('../config/env');

module.exports = pino({
  level: process.env.LOG_LEVEL || (env.isProd ? 'info' : 'debug'),
  // pino-http logs request headers: never write credentials to the logs.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
  transport: env.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
