'use strict';
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createThrottle, createConnectionLimiter } = require('./limits');

const MAX_MATCH_ROOMS = 10;

/**
 * Socket.IO gateway.
 *   client -> server : live:subscribe | live:unsubscribe | match:subscribe {id} | match:unsubscribe {id}
 *   server -> client : live:update  { matches:[{id,status,statusShort,minute,score}] }   (room "live")
 *                      match:update { id,status,minute,score,events:[...],refresh? }      (room "match:{id}")
 * Hardening: per-IP connection cap, per-socket event throttle (disconnect on abuse), tiny payload limit.
 * The Redis adapter makes broadcasts work across multiple API instances.
 */
function createGateway(httpServer, { redis, env, logger }) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins === '*' ? true : env.corsOrigins, methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e4,
  });
  io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));

  const limiter = createConnectionLimiter(env.SOCKET_MAX_CONN_PER_IP);
  // Behind trusted proxies the real client is the Nth entry from the right of X-Forwarded-For.
  const clientIp = (socket) => {
    const xff = socket.handshake.headers['x-forwarded-for'];
    if (env.isProd && env.TRUST_PROXY > 0 && xff) {
      const parts = String(xff).split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length) return parts[Math.max(0, parts.length - env.TRUST_PROXY)];
    }
    return socket.handshake.address || 'unknown';
  };

  io.use((socket, next) => {
    const ip = clientIp(socket);
    if (!limiter.acquire(ip)) return next(new Error('too_many_connections'));
    socket.data.ip = ip;
    return next();
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => limiter.release(socket.data.ip));

    const allow = createThrottle();
    let strikes = 0;
    socket.use((_packet, next) => {
      if (allow()) return next();
      strikes += 1;
      if (strikes >= 5) socket.disconnect(true); // flooding: drop the client
      return undefined; // over the limit: ignore the event
    });

    const rooms = new Set();
    socket.on('live:subscribe', () => socket.join('live'));
    socket.on('live:unsubscribe', () => socket.leave('live'));
    socket.on('match:subscribe', (payload) => {
      const id = Number(payload?.id);
      if (!Number.isInteger(id) || id <= 0) return;
      if (!rooms.has(id) && rooms.size >= MAX_MATCH_ROOMS) return;
      rooms.add(id);
      socket.join(`match:${id}`);
    });
    socket.on('match:unsubscribe', (payload) => {
      const id = Number(payload?.id);
      if (rooms.delete(id)) socket.leave(`match:${id}`);
    });
  });
  logger.info('Socket.IO gateway ready');

  return {
    io,
    emitLive: (matches) => {
      if (matches.length) io.to('live').emit('live:update', { matches });
    },
    emitMatch: (id, payload) => io.to(`match:${id}`).emit('match:update', { id, ...payload }),
    clientCount: () => io.engine.clientsCount,
    close: () => new Promise((resolve) => io.close(() => resolve())),
  };
}

module.exports = { createGateway };
