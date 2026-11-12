'use strict';
/**
 * End-to-end smoke test against a RUNNING server (mock provider is fine).
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke.js http://localhost:4000 [--sockets]
 */
const base = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const withSockets = process.argv.includes('--sockets');
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD to the values the server was started with.');
  process.exit(2);
}

let n = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok ${++n} - ${msg}`);
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, data };
}

async function main() {
  ok((await (await fetch(`${base}/health`)).json()).status === 'ok', 'health: database and redis reachable');

  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
  const dayUrl = `/matches?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const day = await call(dayUrl);
  ok(day.status === 200 && day.data.count > 0, `schedule returns matches (${day.data && day.data.count})`);
  const match = day.data.matches[0];
  ok((await call('/matches/live')).status === 200, 'live endpoint answers');
  const open = await call(`/matches/${match.id}`);
  ok(open.status === 200 && Array.isArray(open.data.events), 'match details are public');
  ok((await call('/matches/abc')).status === 400, 'bad ids are rejected');

  // ── devices ──
  const reg = await call('/auth/device', { method: 'POST', body: { deviceId: `smoke-${Date.now()}-device`, platform: 'ANDROID' } });
  ok(reg.status === 200 && !!reg.data.token, 'anonymous device registration');
  const device = reg.data.token;
  const parts = device.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`; // corrupt the signature
  const tampered = parts.join('.');
  ok((await call('/matches/live', { token: tampered })).status === 401, 'a bad device token gets 401, so the app re-registers');
  ok((await call('/auth/device', { method: 'POST', token: tampered, body: { deviceId: `smoke-${Date.now()}-again`, platform: 'ANDROID' } })).status === 200, 'registration still works while holding a stale token');
  ok((await call(`/me/favorites/teams/${match.home.id}`, { method: 'PUT', token: device, body: { name: match.home.name, logo: match.home.logo } })).status === 200, 'follow a team');
  ok((await call(`/me/favorites/matches/${match.id}`, { method: 'PUT', token: device, body: { homeName: match.home.name, awayName: match.away.name, kickoffAt: match.kickoff } })).status === 200, 'follow a match');
  const fav = await call('/me/favorites', { token: device });
  ok(fav.data.teams.length === 1 && fav.data.matches.length === 1, 'favourites are stored');

  // ── admin: login, https-only, streams, access rules ──
  const login = await call('/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  ok(login.status === 200 && login.data.role === 'SUPER', 'admin login (super admin)');
  const admin = login.data.token;
  ok((await call('/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'definitely-wrong-1' } })).status === 401, 'wrong password is rejected');
  ok((await call('/admin/streams', { token: device })).status === 401, 'a device token cannot reach the admin API');
  ok((await call('/admin/streams', { method: 'POST', token: admin, body: { fixtureId: match.id, title: 'x', url: 'http://insecure.example/a.m3u8' } })).status === 400, 'http:// stream URLs are refused');
  const link = await call('/admin/streams', { method: 'POST', token: admin, body: { fixtureId: match.id, matchLabel: 'smoke', title: 'Smoke feed', url: 'https://example.com/live.m3u8', type: 'HLS', quality: '720p' } });
  ok(link.status === 201, 'stream link created');
  const seen = await call(`/matches/${match.id}`, { token: device });
  ok(seen.data.streams.length === 1 && seen.data.hasStream === true, 'a registered device receives the source');
  ok((await call(`/matches/${match.id}`)).data.streams.length === 0, 'an anonymous caller does not');
  ok((await call(dayUrl)).data.matches.find((m) => m.id === match.id).hasStream === true, 'the schedule flags the match as streamable');

  ok((await call('/admin/features/streams', { method: 'PUT', token: admin, body: { enabled: false } })).status === 200, 'feature flag switched off');
  ok((await call(`/matches/${match.id}`, { token: device })).data.streams.length === 0, 'the switch takes effect immediately');
  await call('/admin/features/streams', { method: 'PUT', token: admin, body: { enabled: true } });
  await call(`/admin/streams/${link.data.id}`, { method: 'DELETE', token: admin });

  const banner = await call('/admin/banners', { method: 'POST', token: admin, body: { title: 'Smoke banner', imageUrl: 'https://example.com/b.png', placement: 'HOME_TOP' } });
  ok(banner.status === 201 && (await call('/config')).data.banners.some((b) => b.title === 'Smoke banner'), 'banner shows up in the public config');
  await call(`/admin/banners/${banner.data.id}`, { method: 'DELETE', token: admin });

  const push = await call('/admin/notifications', { method: 'POST', token: admin, body: { title: 'Smoke', body: 'Hello', target: 'all' } });
  ok(push.status === 201 && ['DRY_RUN', 'SENT'].includes(push.data.status), `push notification (${push.data && push.data.status})`);

  // ── roles and password revocation ──
  const email = `editor-${Date.now()}@example.com`;
  const pass = 'Editor-Pass-98765';
  const made = await call('/admin/admins', { method: 'POST', token: admin, body: { email, password: pass, role: 'EDITOR' } });
  ok(made.status === 201, 'editor account created');
  const ed = await call('/admin/login', { method: 'POST', body: { email, password: pass } });
  ok(ed.status === 200 && ed.data.role === 'EDITOR', 'editor login');
  const et = ed.data.token;
  ok((await call('/admin/features/streams', { method: 'PUT', token: et, body: { enabled: false } })).status === 403, 'editors cannot change feature flags');
  ok((await call('/admin/notifications', { method: 'POST', token: et, body: { title: 'x', body: 'y' } })).status === 403, 'editors cannot send push');
  ok((await call('/admin/admins', { token: et })).status === 403, 'editors cannot manage the team');
  ok((await call('/admin/streams', { token: et })).status === 200, 'editors can manage stream links');
  ok((await call('/admin/password', { method: 'POST', token: et, body: { current: pass, next: 'Editor-Pass-NEW-54321' } })).status === 204, 'password changed');
  ok((await call('/admin/streams', { token: et })).status === 401, 'old tokens stop working after a password change');
  ok((await call(`/admin/admins/${made.data.id}`, { method: 'DELETE', token: admin })).status === 204, 'editor removed');

  // ── accounts (a fresh device, so the earlier checks are unaffected) ──
  const d2 = await call('/auth/device', { method: 'POST', body: { deviceId: `smoke-${Date.now()}-account`, platform: 'ANDROID' } });
  const mail = `smoke-${Date.now()}@example.com`;
  const upgraded = await call('/auth/register', { method: 'POST', token: d2.data.token, body: { email: mail, password: 'Smoke-Pass-123' } });
  ok(upgraded.status === 200 && upgraded.data.user.email === mail, 'a device becomes an account');
  ok((await call('/auth/login', { method: 'POST', body: { email: mail, password: 'wrong-password-1' } })).status === 401, 'wrong account password is rejected');
  const signedIn = await call('/auth/login', { method: 'POST', body: { email: mail, password: 'Smoke-Pass-123' } });
  ok(signedIn.status === 200 && !!signedIn.data.token, 'account login');
  ok((await call('/me', { token: signedIn.data.token })).data.email === mail, 'GET /me returns the account');
  ok((await call('/me', { method: 'DELETE', token: signedIn.data.token })).status === 204, 'account deleted');
  ok((await call('/me/favorites', { token: signedIn.data.token })).status === 401, 'a deleted account is locked out');

  const art = await call('/admin/news', { method: 'POST', token: admin, body: { title: 'Smoke article', summary: 'Hello' } });
  ok(art.status === 201 && (await call('/news')).data.articles.some((n) => n.title === 'Smoke article'), 'news article appears in the public feed');
  await call(`/admin/news/${art.data.id}`, { method: 'DELETE', token: admin });

  if (withSockets) {
    const { io } = require('socket.io-client'); // eslint-disable-line global-require
    const update = await new Promise((resolve, reject) => {
      const s = io(base, { transports: ['websocket'] });
      const timer = setTimeout(() => { s.close(); reject(new Error('FAILED: no live:update within 100 s')); }, 100000);
      s.on('connect', () => { s.emit('live:subscribe'); s.emit('match:subscribe', { id: match.id }); });
      s.on('live:update', (p) => { clearTimeout(timer); s.close(); resolve(p); });
    });
    ok(Array.isArray(update.matches) && update.matches.length > 0, 'socket: live:update received');
  }
  console.log(`\nAll ${n} checks passed.`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
