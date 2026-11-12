'use strict';
// Minimal in-memory stand-in for the ioredis commands used by cache.js / liveUpdater.js / football.service.js
class FakeRedis {
  constructor() { this.m = new Map(); this.h = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async set(k, v, ...args) {
    if (args.includes('NX') && this.m.has(k)) return null;
    this.m.set(k, v);
    return 'OK';
  }
  async del(...ks) { ks.forEach((k) => this.m.delete(k)); return ks.length; }
  async pexpire() { return 1; }
  async incr(k) { const n = Number(this.m.get(k) || 0) + 1; this.m.set(k, String(n)); return n; }
  async expire() { return 1; }
  async mget(keys) { return keys.map((k) => (this.m.has(k) ? this.m.get(k) : null)); }
  async hgetall(k) { return Object.fromEntries(this.h.get(k) || []); }
  async hset(k, f, v) { if (!this.h.has(k)) this.h.set(k, new Map()); this.h.get(k).set(f, v); return 1; }
  async hdel(k, f) { this.h.get(k)?.delete(f); return 1; }
  pipeline() {
    const ops = [];
    const p = {
      set: (...a) => { ops.push(() => this.set(...a)); return p; },
      hset: (...a) => { ops.push(() => this.hset(...a)); return p; },
      hdel: (...a) => { ops.push(() => this.hdel(...a)); return p; },
      exec: async () => { for (const op of ops) await op(); return []; },
    };
    return p;
  }
}
const silent = { warn() {}, info() {}, error() {}, debug() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { FakeRedis, silent, sleep };
