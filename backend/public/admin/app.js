'use strict';
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  const store = {
    get token() { return localStorage.getItem('gp.admin.token'); },
    set token(v) { if (v) localStorage.setItem('gp.admin.token', v); else localStorage.removeItem('gp.admin.token'); },
    get role() { return localStorage.getItem('gp.admin.role'); },
    set role(v) { if (v) localStorage.setItem('gp.admin.role', v); else localStorage.removeItem('gp.admin.role'); },
  };
  const state = { view: 'overview', matches: [], picked: null, streams: [], editing: null };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && path !== '/admin/login') { signOut(); throw new Error('Session expired, please sign in again.'); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.details) && data.details.length ? data.details.map((d) => `${d.path}: ${d.message}`).join('; ') : '';
      throw new Error(detail || data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function toast(message, kind = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${kind === 'error' ? 'error' : ''}`;
    el.textContent = message;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
  }

  // ── shell ─────────────────────────────────────────────────────
  // Editors manage content; super admins also send push, flip features and manage the team.
  const navItems = () => {
    const sup = store.role === 'SUPER';
    return [
      ['overview', 'Overview'],
      ['streams', 'Stream links'],
      ...(sup ? [['push', 'Notifications']] : []),
      ['banners', 'Banners and ads'],
      ['news', 'News'],
      ...(sup ? [['features', 'Feature toggles'], ['team', 'Team']] : []),
      ['account', 'My account'],
    ];
  };

  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    go(state.view);
  }

  function signOut() {
    store.token = null;
    store.role = null;
    $('#app').hidden = true;
    $('#login').hidden = false;
  }

  function go(view) {
    if (!navItems().some(([id]) => id === view)) view = 'overview';
    state.view = view;
    $('#nav').innerHTML = navItems().map(([id, label]) => `<button type="button" data-action="nav" data-view="${id}" ${id === view ? 'aria-current="page"' : ''}>${label}</button>`).join('');
    $('#view').innerHTML = '<p class="muted">Loading…</p>';
    views[view]().catch((err) => { $('#view').innerHTML = `<p class="error">${esc(err.message)}</p>`; });
  }

  const head = (title, sub) => `<header class="page-head"><h1>${title}</h1><p class="muted">${sub}</p></header>`;

  // ── overview ──────────────────────────────────────────────────
  async function overview() {
    const s = await api('/admin/stats');
    const quota = s.quota?.remaining != null
      ? `${s.quota.remaining.toLocaleString()} left${s.quota.limit ? ` of ${s.quota.limit.toLocaleString()}` : ''} today`
      : 'not reported by provider';
    $('#view').innerHTML = `${head('Overview', 'What the platform is doing right now.')}
      <section class="scoreboard">
        ${[['Matches live', s.liveNow], ['Devices registered', s.users], ['Active stream links', s.activeStreams], ['Provider calls today', s.apiCallsToday]]
          .map(([label, n]) => `<div><b>${Number(n).toLocaleString()}</b><span>${label}</span></div>`).join('')}
      </section>
      <section class="panel"><h2>System</h2>
        <dl class="facts">
          <dt>Data provider</dt><dd>${esc(s.provider)} ${s.provider === 'mock' ? '<span class="chip warn">simulated matches</span>' : ''}</dd>
          <dt>Provider quota</dt><dd>${esc(quota)}</dd>
          <dt>Push (FCM)</dt><dd>${s.pushEnabled ? 'Connected' : 'Dry-run: no Firebase credentials configured'}</dd>
          <dt>Socket clients</dt><dd>${s.socketClients} connected to this instance</dd>
          <dt>Active banners</dt><dd>${s.activeBanners}</dd>
          <dt>Notifications sent</dt><dd>${s.notificationsSent}</dd>
        </dl>
      </section>`;
  }

  // ── stream links ──────────────────────────────────────────────
  async function streams() {
    state.picked = null; state.editing = null;
    $('#view').innerHTML = `${head('Stream links', 'Pick a match, attach one or more sources. Open match screens refresh the moment you save.')}
      <div class="split">
        <section class="panel"><h2>1. Pick a match</h2>
          <div class="row"><input type="date" id="mDate" value="${todayStr()}" aria-label="Match date"><input type="search" id="mFilter" placeholder="Filter by team or league" aria-label="Filter matches"></div>
          <ul class="matchlist" id="matchList"><li class="muted pad">Loading matches…</li></ul>
        </section>
        <section class="panel"><h2 id="formTitle">2. Add the source</h2>
          <form id="streamForm" class="form" data-submit="stream" autocomplete="off">
            <div class="picked" id="picked">No match selected. Choose one on the left or type a fixture ID.</div>
            <label>Fixture ID <input name="fixtureId" type="number" min="1" required></label>
            <label>Title <input name="title" required maxlength="100" placeholder="Main feed (HD)"></label>
            <label>Stream URL <input name="url" type="url" required placeholder="https://…"></label>
            <div class="row">
              <label>Player <select name="type"><option value="HLS">HLS (.m3u8)</option><option value="WEBVIEW">WebView embed</option></select></label>
              <label>Quality <input name="quality" maxlength="20" placeholder="720p"></label>
              <label>Language <input name="language" maxlength="20" placeholder="English"></label>
            </div>
            <div class="row">
              <label>Priority (low first) <input name="priority" type="number" min="0" max="999" value="100"></label>
              <label>Hide after <input name="expiresAt" type="datetime-local"></label>
            </div>
            <label class="check"><input type="checkbox" name="isActive" checked> Visible in the app</label>
            <div class="row end"><button type="button" class="btn" data-action="stream-cancel" id="cancelEdit" hidden>Cancel edit</button><button class="btn primary">Save link</button></div>
          </form>
        </section>
      </div>
      <section class="panel"><h2>All links</h2><div class="scroll"><table class="table" id="streamTable"></table></div></section>`;
    await Promise.all([loadMatches(), loadStreams()]);
  }

  async function loadMatches() {
    const [y, m, d] = ($('#mDate').value || todayStr()).split('-').map(Number);
    const from = new Date(y, m - 1, d).toISOString();
    const to = new Date(y, m - 1, d + 1).toISOString();
    try { state.matches = (await api(`/matches?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).matches; }
    catch (err) { state.matches = []; toast(err.message, 'error'); }
    renderMatches();
  }

  function renderMatches() {
    const q = ($('#mFilter')?.value || '').trim().toLowerCase();
    const list = state.matches.filter((m) => !q || `${m.home.name} ${m.away.name} ${m.leagueName}`.toLowerCase().includes(q));
    $('#matchList').innerHTML = list.length
      ? list.map((m) => `<li><button type="button" data-action="pick-match" data-id="${m.id}" aria-pressed="${state.picked?.id === m.id}">
          <time>${fmtTime(m.kickoff)}</time>
          <span>${esc(m.home.name)} – ${esc(m.away.name)}<small>${esc(m.leagueName)}</small></span>
          <span>${m.status === 'LIVE' || m.status === 'HALF_TIME' ? '<span class="chip live">Live</span>' : m.hasStream ? '<span class="chip">Has link</span>' : ''}</span>
        </button></li>`).join('')
      : '<li class="muted pad">No matches for this day.</li>';
  }

  async function loadStreams() {
    state.streams = (await api('/admin/streams')).streams;
    $('#streamTable').innerHTML = `<thead><tr><th>Match</th><th>Title</th><th>Player</th><th>Priority</th><th>Visible</th><th>Hides</th><th></th></tr></thead><tbody>
      ${state.streams.map((s) => `<tr>
        <td>${esc(s.matchLabel || `#${s.fixtureId}`)}<div class="url">${esc(s.url)}</div></td>
        <td>${esc(s.title)}${s.quality ? ` <span class="chip">${esc(s.quality)}</span>` : ''}</td>
        <td>${s.type === 'HLS' ? 'HLS' : 'WebView'}</td><td>${s.priority}</td>
        <td><label class="switch"><input type="checkbox" data-change="stream-active" data-id="${s.id}" ${s.isActive ? 'checked' : ''} aria-label="Visible"><i></i></label></td>
        <td>${s.expiresAt ? fmtDateTime(s.expiresAt) : '–'}</td>
        <td class="actions"><button class="btn small" type="button" data-action="stream-edit" data-id="${s.id}">Edit</button> <button class="btn small danger" type="button" data-action="stream-delete" data-id="${s.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No links yet.</td></tr>'}</tbody>`;
  }

  function setPicked(m) {
    state.picked = m;
    const box = $('#picked');
    box.classList.toggle('on', !!m);
    box.textContent = m ? `${m.home.name} vs ${m.away.name} · ${m.leagueName} · fixture #${m.id}` : 'No match selected. Choose one on the left or type a fixture ID.';
    if (m) $('#streamForm').elements.fixtureId.value = m.id;
    renderMatches();
  }

  function resetStreamForm() {
    state.editing = null;
    const f = $('#streamForm');
    f.reset();
    $('#formTitle').textContent = '2. Add the source';
    $('#cancelEdit').hidden = true;
    setPicked(null);
  }

  // ── notifications ─────────────────────────────────────────────
  async function push() {
    $('#view').innerHTML = `${head('Notifications', 'Send a push message. Devices subscribe to topics: all, team_{id}, match_{id}.')}
      <div class="split">
        <section class="panel"><h2>New message</h2>
          <form id="pushForm" class="form" data-submit="push">
            <label>Title <input name="title" required maxlength="100"></label>
            <label>Message <input name="body" required maxlength="300"></label>
            <div class="row">
              <label>Send to <select name="target" data-change="push-target"><option value="all">All devices</option><option value="topic">One topic</option></select></label>
              <label id="topicBox" hidden>Topic <input name="topic" placeholder="team_42 or match_1234" pattern="[a-zA-Z0-9_.~%-]+"></label>
            </div>
            <div class="row">
              <label>Open match on tap (fixture ID) <input name="fixtureId" type="number" min="1" placeholder="optional"></label>
              <label>Image URL <input name="imageUrl" type="url" placeholder="optional"></label>
            </div>
            <div class="row end"><button class="btn primary">Send notification</button></div>
          </form>
        </section>
        <section class="panel"><h2>Recent</h2><div class="scroll"><table class="table" id="pushTable"></table></div></section>
      </div>`;
    await loadPush();
  }

  async function loadPush() {
    const { notifications } = await api('/admin/notifications');
    $('#pushTable').innerHTML = `<thead><tr><th>When</th><th>Message</th><th>To</th><th>Result</th></tr></thead><tbody>
      ${notifications.map((n) => `<tr><td>${fmtDateTime(n.createdAt)}</td><td><b>${esc(n.title)}</b><div class="url">${esc(n.body)}</div></td><td>${esc(n.target)}</td>
        <td><span class="chip ${n.status === 'FAILED' ? 'red' : n.status === 'DRY_RUN' ? 'warn' : ''}" title="${esc(n.error || '')}">${esc(n.status.replace('_', '-').toLowerCase())}</span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing sent yet.</td></tr>'}</tbody>`;
  }

  // ── banners ───────────────────────────────────────────────────
  async function banners() {
    $('#view').innerHTML = `${head('Banners and ads', 'Shown in the app according to placement, priority and schedule. Turn the “ads” feature off to hide them all.')}
      <div class="split">
        <section class="panel"><h2>New banner</h2>
          <form id="bannerForm" class="form" data-submit="banner">
            <label>Title <input name="title" required maxlength="120"></label>
            <label>Image URL <input name="imageUrl" type="url" required placeholder="https://…/banner.jpg (960×240 works well)"></label>
            <label>Link when tapped <input name="targetUrl" type="url" placeholder="optional"></label>
            <div class="row">
              <label>Placement <select name="placement"><option value="HOME_TOP">Home, top</option><option value="HOME_INLINE">Home, inline</option><option value="MATCH_BOTTOM">Match screen, bottom</option></select></label>
              <label>Priority <input name="priority" type="number" min="0" max="999" value="100"></label>
            </div>
            <div class="row"><label>Starts <input name="startsAt" type="datetime-local"></label><label>Ends <input name="endsAt" type="datetime-local"></label></div>
            <label class="check"><input type="checkbox" name="isActive" checked> Active</label>
            <div class="row end"><button class="btn primary">Add banner</button></div>
          </form>
        </section>
        <section class="panel"><h2>Banners</h2><div class="scroll"><table class="table" id="bannerTable"></table></div></section>
      </div>`;
    await loadBanners();
  }

  async function loadBanners() {
    const { banners: rows } = await api('/admin/banners');
    $('#bannerTable').innerHTML = `<thead><tr><th>Preview</th><th>Placement</th><th>Active</th><th></th></tr></thead><tbody>
      ${rows.map((b) => `<tr><td><img src="${esc(b.imageUrl)}" alt=""><div>${esc(b.title)}</div></td><td>${esc(b.placement.replace('_', ' ').toLowerCase())}<div class="url">priority ${b.priority}</div></td>
        <td><label class="switch"><input type="checkbox" data-change="banner-active" data-id="${b.id}" ${b.isActive ? 'checked' : ''} aria-label="Active"><i></i></label></td>
        <td class="actions"><button class="btn small danger" type="button" data-action="banner-delete" data-id="${b.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No banners yet.</td></tr>'}</tbody>`;
  }

  // ── feature toggles ───────────────────────────────────────────
  async function features() {
    const { features: rows } = await api('/admin/features');
    $('#view').innerHTML = `${head('Feature toggles', 'Flip a feature for every installed app, no release needed. The app picks changes up within a couple of minutes.')}
      <section class="panel">
        ${rows.map((f) => `<div class="feature"><div><b>${esc(f.key)}</b><span class="muted">${esc(f.description || '')}</span></div>
          <label class="switch"><input type="checkbox" data-change="feature" data-key="${esc(f.key)}" ${f.enabled ? 'checked' : ''} aria-label="${esc(f.key)}"><i></i></label></div>`).join('')}
      </section>
      <section class="panel"><h2>Add a custom flag</h2>
        <form class="form" data-submit="feature"><div class="row"><label>Key <input name="key" required pattern="[a-z][a-zA-Z0-9_]{1,40}" placeholder="newsTab"></label><label>Description <input name="description" maxlength="200"></label></div>
        <div class="row end"><button class="btn primary">Add flag</button></div></form>
      </section>`;
  }

  // ── team and account ──────────────────────────────────────────
  async function team() {
    const { admins } = await api('/admin/admins');
    $('#view').innerHTML = `${head('Team', 'Super admins can do everything. Editors manage stream links and banners only.')}
      <div class="split">
        <section class="panel"><h2>Add a team member</h2>
          <form class="form" data-submit="admin" autocomplete="off">
            <label>Email <input name="email" type="email" required></label>
            <label>Password (12+ characters) <input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
            <label>Role <select name="role"><option value="EDITOR">Editor</option><option value="SUPER">Super admin</option></select></label>
            <div class="row end"><button class="btn primary">Add member</button></div>
          </form></section>
        <section class="panel"><h2>Members</h2><div class="scroll"><table class="table"><thead><tr><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
          ${admins.map((m) => `<tr><td>${esc(m.email)}</td><td>${m.role === 'SUPER' ? 'Super admin' : 'Editor'}</td><td class="actions"><button class="btn small danger" type="button" data-action="admin-delete" data-id="${esc(m.id)}">Remove</button></td></tr>`).join('')}
        </tbody></table></div></section>
      </div>`;
  }

  async function account() {
    $('#view').innerHTML = `${head('My account', 'Changing your password signs you out everywhere.')}
      <section class="panel" style="max-width:480px"><h2>Change password</h2>
        <form class="form" data-submit="password" autocomplete="off">
          <label>Current password <input name="current" type="password" required autocomplete="current-password"></label>
          <label>New password (12+ characters) <input name="next" type="password" required minlength="12" autocomplete="new-password"></label>
          <div class="row end"><button class="btn primary">Change password</button></div>
        </form></section>`;
  }

  // ── news ──────────────────────────────────────────────────────
  async function news() {
    const { articles } = await api('/admin/news');
    $('#view').innerHTML = `${head('News', 'Articles shown in the app’s News tab. Turn the “news” feature off to hide the tab.')}
      <div class="split">
        <section class="panel"><h2>New article</h2>
          <form class="form" data-submit="news" autocomplete="off">
            <label>Title <input name="title" required maxlength="200"></label>
            <label>Summary <input name="summary" maxlength="500" placeholder="One or two lines"></label>
            <label>Image URL (https) <input name="imageUrl" type="url" placeholder="optional"></label>
            <label>Source link (https) <input name="sourceUrl" type="url" placeholder="optional"></label>
            <label>Article text <textarea name="body" rows="6" maxlength="20000"></textarea></label>
            <div class="row end"><button class="btn primary">Publish</button></div>
          </form></section>
        <section class="panel"><h2>Published</h2><div class="scroll"><table class="table"><thead><tr><th>Title</th><th>Date</th><th></th></tr></thead><tbody>
          ${articles.map((n) => `<tr><td>${esc(n.title)}</td><td>${fmtDateTime(n.publishedAt)}</td><td class="actions"><button class="btn small danger" type="button" data-action="news-delete" data-id="${n.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No articles yet.</td></tr>'}
        </tbody></table></div></section>
      </div>`;
  }

  const views = { overview, streams, push, banners, news, features, team, account };

  // ── event wiring (delegated; no inline handlers, CSP-safe) ────
  const actions = {
    nav: (el) => go(el.dataset.view),
    'pick-match': (el) => setPicked(state.matches.find((m) => m.id === Number(el.dataset.id)) || null),
    'stream-cancel': () => resetStreamForm(),
    'stream-edit': (el) => {
      const s = state.streams.find((x) => x.id === Number(el.dataset.id));
      if (!s) return;
      state.editing = s;
      const f = $('#streamForm').elements;
      f.fixtureId.value = s.fixtureId; f.title.value = s.title; f.url.value = s.url; f.type.value = s.type;
      f.quality.value = s.quality || ''; f.language.value = s.language || ''; f.priority.value = s.priority;
      f.expiresAt.value = toLocalInput(s.expiresAt); f.isActive.checked = s.isActive;
      $('#formTitle').textContent = `Editing #${s.id}`;
      $('#cancelEdit').hidden = false;
      $('#picked').textContent = s.matchLabel || `Fixture #${s.fixtureId}`;
      $('#streamForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    'stream-delete': async (el) => {
      if (!confirm('Delete this stream link?')) return;
      await api(`/admin/streams/${el.dataset.id}`, { method: 'DELETE' });
      toast('Link deleted'); await loadStreams();
    },
    'news-delete': async (el) => {
      if (!confirm('Delete this article?')) return;
      await api(`/admin/news/${el.dataset.id}`, { method: 'DELETE' });
      toast('Article deleted'); await news();
    },
    'admin-delete': async (el) => {
      if (!confirm('Remove this team member?')) return;
      await api(`/admin/admins/${el.dataset.id}`, { method: 'DELETE' });
      toast('Member removed'); await team();
    },
    'banner-delete': async (el) => {
      if (!confirm('Delete this banner?')) return;
      await api(`/admin/banners/${el.dataset.id}`, { method: 'DELETE' });
      toast('Banner deleted'); await loadBanners();
    },
  };

  const changes = {
    'stream-active': async (el) => { await api(`/admin/streams/${el.dataset.id}`, { method: 'PUT', body: { isActive: el.checked } }); toast(el.checked ? 'Link is visible' : 'Link hidden'); },
    'banner-active': async (el) => { await api(`/admin/banners/${el.dataset.id}`, { method: 'PUT', body: { isActive: el.checked } }); toast(el.checked ? 'Banner enabled' : 'Banner disabled'); },
    feature: async (el) => { await api(`/admin/features/${el.dataset.key}`, { method: 'PUT', body: { enabled: el.checked } }); toast(`${el.dataset.key} ${el.checked ? 'enabled' : 'disabled'}`); },
    'push-target': (el) => { $('#topicBox').hidden = el.value !== 'topic'; },
  };

  const submits = {
    stream: async (form) => {
      const fd = new FormData(form);
      const body = {
        fixtureId: Number(fd.get('fixtureId')),
        title: String(fd.get('title')).trim(),
        url: String(fd.get('url')).trim(),
        type: fd.get('type'),
        quality: fd.get('quality') || null,
        language: fd.get('language') || null,
        priority: Number(fd.get('priority') || 100),
        isActive: fd.get('isActive') === 'on',
        expiresAt: fd.get('expiresAt') ? new Date(fd.get('expiresAt')).toISOString() : null,
      };
      if (state.picked) body.matchLabel = `${state.picked.home.name} vs ${state.picked.away.name}`;
      if (state.editing) await api(`/admin/streams/${state.editing.id}`, { method: 'PUT', body });
      else await api('/admin/streams', { method: 'POST', body });
      toast(state.editing ? 'Link updated' : 'Link added');
      resetStreamForm(); await loadStreams();
    },
    push: async (form) => {
      const fd = new FormData(form);
      const body = { title: fd.get('title').trim(), body: fd.get('body').trim(), target: fd.get('target') };
      if (body.target === 'topic') body.topic = String(fd.get('topic')).trim();
      if (fd.get('fixtureId')) body.fixtureId = Number(fd.get('fixtureId'));
      if (fd.get('imageUrl')) body.imageUrl = String(fd.get('imageUrl')).trim();
      const log = await api('/admin/notifications', { method: 'POST', body });
      toast(log.status === 'DRY_RUN' ? 'Dry run: Firebase is not configured, message only logged' : 'Notification sent');
      form.reset(); $('#topicBox').hidden = true; await loadPush();
    },
    banner: async (form) => {
      const fd = new FormData(form);
      const body = {
        title: fd.get('title').trim(), imageUrl: fd.get('imageUrl').trim(), placement: fd.get('placement'),
        priority: Number(fd.get('priority') || 100), isActive: fd.get('isActive') === 'on',
        targetUrl: fd.get('targetUrl') ? fd.get('targetUrl').trim() : null,
        startsAt: fd.get('startsAt') ? new Date(fd.get('startsAt')).toISOString() : null,
        endsAt: fd.get('endsAt') ? new Date(fd.get('endsAt')).toISOString() : null,
      };
      await api('/admin/banners', { method: 'POST', body });
      toast('Banner added'); form.reset(); await loadBanners();
    },
    news: async (form) => {
      const fd = new FormData(form);
      const body = { title: String(fd.get('title')).trim() };
      for (const k of ['summary', 'imageUrl', 'sourceUrl', 'body']) if (String(fd.get(k) || '').trim()) body[k] = String(fd.get(k)).trim();
      await api('/admin/news', { method: 'POST', body });
      toast('Article published'); await news();
    },
    admin: async (form) => {
      const fd = new FormData(form);
      await api('/admin/admins', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password'), role: fd.get('role') } });
      toast('Member added'); await team();
    },
    password: async (form) => {
      const fd = new FormData(form);
      await api('/admin/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } });
      toast('Password changed, please sign in again'); signOut();
    },
    feature: async (form) => {
      const fd = new FormData(form);
      await api(`/admin/features/${fd.get('key')}`, { method: 'PUT', body: { enabled: false, description: fd.get('description') || undefined } });
      toast('Flag added (disabled)'); await features();
    },
  };

  const guarded = (fn) => async (...args) => { try { await fn(...args); } catch (err) { toast(err.message, 'error'); } };

  document.addEventListener('click', guarded(async (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) await actions[el.dataset.action](el);
  }));
  document.addEventListener('change', guarded(async (e) => {
    const el = e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) await changes[el.dataset.change](el);
    if (e.target.id === 'mDate') await loadMatches();
  }));
  document.addEventListener('input', (e) => { if (e.target.id === 'mFilter') renderMatches(); });
  document.addEventListener('submit', guarded(async (e) => {
    const form = e.target.closest('form[data-submit]');
    if (!form) return;
    e.preventDefault();
    await submits[form.dataset.submit](form);
  }));

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    try {
      const fd = new FormData(e.target);
      const out = await api('/admin/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      store.token = out.token;
      store.role = out.role;
      showApp();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  $('#logout').addEventListener('click', signOut);

  if (store.token) showApp(); else $('#login').hidden = false;
})();
