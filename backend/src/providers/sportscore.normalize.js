'use strict';
/**
 * Pure functions: SportScore payloads -> GoalPulse normalised shapes.
 *
 * VERIFIED against real responses (captured 10-11 Nov 2026):
 *   GET /api/v1/fixtures/?sport=football&date=YYYY-MM-DD  and  GET /api/widget/matches/
 *   -> { sport, count, matches: [{ home, away, home_logo, away_logo, home_score, away_score, status,
 *        status_text, time, competition, competition_logo, url }] }
 *   Scores are strings or null, `time` is ISO-8601 UTC, `url` is /football/match/{slug}/{id}/ and
 *   `status` was seen as "upcoming" | "finished" (postponed/cancelled arrive as upcoming + status_text).
 * NOT YET VERIFIED (no sample): the in-play status string, /match/ detail, /standings/, /topscorers/.
 * Those parsers are deliberately tolerant: they accept several plausible shapes and return empty data
 * (never garbage) when nothing matches.
 */
const crypto = require('crypto');

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => clean(s).toLowerCase();

/** Stable positive 31-bit integer (fits Postgres INT4, which the Prisma schema uses for fixture/team ids). */
function hash31(s) {
  const n = crypto.createHash('sha1').update(String(s)).digest().readUInt32BE(0) & 0x7fffffff;
  return n || 1;
}

const cleanLogo = (u) => {
  const v = clean(u);
  if (!v || /\.crdownload($|\?)/i.test(v)) return null; // broken uploads seen in the real feed
  return v;
};

// ───────── competitions ─────────
// ids reuse the API-Football numbers so league logos (media.api-sports.io) and the app's featured list keep working.
const LEAGUES = [
  { id: 2, name: 'UEFA Champions League', country: 'Europe', test: /^(uefa )?champions league$/i, slugs: ['uefa-champions-league', 'champions-league'] },
  { id: 3, name: 'UEFA Europa League', country: 'Europe', test: /^(uefa )?europa league$/i, slugs: ['uefa-europa-league', 'europa-league'] },
  { id: 5, name: 'UEFA Nations League', country: 'Europe', test: /^(uefa )?nations league/i, slugs: ['uefa-nations-league', 'nations-league'] },
  { id: 39, name: 'Premier League', country: 'England', test: /^(english |england )?premier league$/i, slugs: ['premier-league', 'english-premier-league'] },
  { id: 140, name: 'La Liga', country: 'Spain', test: /^(spanish )?la ?liga$|^spanish primera division$/i, slugs: ['la-liga', 'laliga', 'spanish-la-liga'] },
  { id: 135, name: 'Serie A', country: 'Italy', test: /^(italian )?serie a$/i, slugs: ['serie-a', 'italian-serie-a'] },
  { id: 78, name: 'Bundesliga', country: 'Germany', test: /^(german )?bundesliga$/i, slugs: ['bundesliga', 'german-bundesliga'] },
  { id: 61, name: 'Ligue 1', country: 'France', test: /^(french )?ligue 1$/i, slugs: ['ligue-1', 'french-ligue-1'] },
  { id: 307, name: 'Saudi Pro League', country: 'Saudi Arabia', test: /^saudi (professional|pro)? ?league$|^saudi league$/i, slugs: ['saudi-pro-league', 'saudi-professional-league', 'saudi-league'] },
  { id: 542, name: 'Iraq Stars League', country: 'Iraq', test: /^iraq(i)? (stars league|premier (league|division)|league)$/i, slugs: ['iraq-premier-division', 'iraq-stars-league', 'iraqi-stars-league', 'iraqi-premier-league', 'iraq-premier-league'] },
  { id: 233, name: 'Egyptian Premier League', country: 'Egypt', test: /^egypt(ian)? premier league$/i, slugs: ['egyptian-premier-league', 'egypt-premier-league'] },
  { id: 253, name: 'Major League Soccer', country: 'USA', test: /^((us|usa) )?major league soccer$|^mls$/i, slugs: ['major-league-soccer', 'mls'] },
];

// Other competitions worth showing by default (their ids are hashed from the name).
const EXTRA = [
  /conference league/i, /^afc champions league/i, /^caf champions league/i, /^(english )?(fa cup|efl cup|league cup)$/i,
  /copa del rey/i, /coppa italia/i, /dfb.?pokal/i, /coupe de france/i, /super cup/i, /world cup/i, /^uefa euro/i, /european championship$/i,
  /concacaf nations league/i, /asian cup/i, /africa cup|afcon/i, /copa america/i, /gold cup/i, /arab cup/i, /gulf cup/i, /international friendly/i,
  /super lig/i, /eredivisie/i, /primeira liga/i, /scottish premiership/i, /^(mexico )?liga mx$/i, /brasileiro|brazil.*serie a/i,
  /argentin.*(primera|liga profesional)/i, /uae pro league|arabian gulf league|qatar stars/i, /botola/i, /ligue professionnelle 1/i,
];

const EXCLUDE = /\b(u-?\d{2}|under[- ]?\d{2}|women'?s?|womens|female|femenil|femenino|femminile|feminin|reserves?|youth|academy|futsal|beach)\b|\(w\)/i;

const leagueOf = (competition) => LEAGUES.find((l) => l.test.test(clean(competition))) || null;
const leagueIdFor = (competition) => leagueOf(competition)?.id ?? hash31(`l:${lower(competition)}`);
const isExcluded = (f) => EXCLUDE.test(`${f.leagueName} ${f.home.name} ${f.away.name}`);

/** setting: 'default' | 'all' | comma separated competition-name fragments. */
function buildFilter(setting) {
  const v = clean(setting || 'default').toLowerCase();
  if (v === 'all') return (list) => list;
  if (v !== 'default') {
    const words = v.split(',').map((s) => s.trim()).filter(Boolean);
    return (list) => list.filter((f) => words.some((w) => lower(f.leagueName).includes(w)));
  }
  const wanted = (f) => !!leagueOf(f.leagueName) || EXTRA.some((re) => re.test(f.leagueName));
  return (list) => {
    const out = list.filter((f) => !isExcluded(f) && wanted(f));
    // Safety net: never show an empty schedule only because competition names differ from our patterns.
    if (!out.length && list.length) return list.filter((f) => !isExcluded(f)).slice(0, 60);
    return out;
  };
}

// ───────── status ─────────
const STATUS_SHORT = { NOT_STARTED: 'NS', LIVE: 'LIVE', HALF_TIME: 'HT', FINISHED: 'FT', POSTPONED: 'PST', CANCELLED: 'CANC', SUSPENDED: 'SUSP', UNKNOWN: null };

function mapStatus(status, text) {
  const s = lower(status);
  const t = lower(text);
  const both = `${s} ${t}`;
  if (/postpon/.test(both)) return 'POSTPONED';
  if (/cancel|abandon/.test(both)) return 'CANCELLED';
  if (/suspend|interrupt/.test(both)) return 'SUSPENDED';
  if (s === 'finished' || /^(finished|ended|full.?time|ft|aet|after (extra|pen))/.test(t) || /finish|ended|complete/.test(s)) return 'FINISHED';
  if (/half.?time|^ht$|^break/.test(t)) return 'HALF_TIME';
  if (s === 'live' || /in.?play|in.?progress|playing|ongoing|^(1st|2nd)|extra time|penalt|\blive\b/.test(both) || /^\d{1,3}(\s*\+\s*\d{1,2})?\s*['’′]?$/.test(t)) return 'LIVE';
  if (s === 'upcoming' || /not started|scheduled|upcoming|^ns$|tbd/.test(both)) return 'NOT_STARTED';
  return 'UNKNOWN';
}

function parseMinute(text) {
  const m = /(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/.exec(String(text ?? ''));
  return m ? { minute: Number(m[1]), extra: m[2] ? Number(m[2]) : null } : { minute: null, extra: null };
}

const toScore = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// ───────── fixtures ─────────
function parseUrl(url) {
  const parts = String(url || '').split('/').filter(Boolean); // [football, match, slug, id]
  const i = parts.indexOf('match');
  if (i < 0 || !parts[i + 1]) return null;
  return { slug: parts[i + 1], key: parts[i + 2] || parts[i + 1] };
}

const team = (name, logo) => ({ id: hash31(`t:${lower(name)}`), name: clean(name), logo: cleanLogo(logo) });

/** @returns {{fixture, slug, key}|null} */
function normalizeMatch(raw, now = Date.now()) {
  if (!raw) return null;
  const u = parseUrl(raw.url);
  const kickoffMs = Date.parse(raw.time);
  if (!u || Number.isNaN(kickoffMs) || !clean(raw.home) || !clean(raw.away)) return null;

  let status = mapStatus(raw.status, raw.status_text);
  let home = toScore(raw.home_score);
  let away = toScore(raw.away_score);
  // Unknown wording but a score is present and kick-off was recent: it is being played.
  if (status === 'UNKNOWN' && home !== null && away !== null && now - kickoffMs >= 0 && now - kickoffMs < 3 * 3600e3) status = 'LIVE';
  if ((status === 'LIVE' || status === 'HALF_TIME') && (home === null || away === null)) { home = home ?? 0; away = away ?? 0; }
  const { minute, extra } = status === 'LIVE' ? parseMinute(raw.status_text) : { minute: null, extra: null };

  const fixture = {
    id: hash31(`m:${u.key}`),
    leagueId: leagueIdFor(raw.competition),
    leagueName: clean(raw.competition),
    leagueLogo: cleanLogo(raw.competition_logo),
    leagueCountry: leagueOf(raw.competition)?.country ?? null,
    round: null,
    season: null,
    kickoff: new Date(kickoffMs).toISOString(),
    status,
    statusShort: STATUS_SHORT[status] ?? null,
    minute,
    extra,
    home: team(raw.home, raw.home_logo),
    away: team(raw.away, raw.away_logo),
    score: { home, away },
    venue: null,
    city: null,
    referee: null,
  };
  return { fixture, slug: u.slug, key: u.key };
}

// ───────── tolerant helpers for the not-yet-sampled endpoints ─────────
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const first = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
const nameOf = (v) => (isObj(v) ? clean(first(v, ['name', 'full_name', 'short_name', 'title']) ?? '') : clean(v ?? ''));
const toInt = (v, d = 0) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : d; };

/** First array stored under any of `keys`, looking at the body and one or two nested levels. */
function findArray(body, keys, depth = 0) {
  if (!isObj(body) || depth > 2) return [];
  for (const k of keys) if (Array.isArray(body[k])) return body[k];
  for (const v of Object.values(body)) {
    if (isObj(v)) { const r = findArray(v, keys, depth + 1); if (r.length) return r; }
  }
  return [];
}
function findValue(body, keys, depth = 0) {
  if (!isObj(body) || depth > 2) return undefined;
  for (const k of keys) if (body[k] !== undefined && body[k] !== null) return body[k];
  for (const v of Object.values(body)) {
    if (isObj(v)) { const r = findValue(v, keys, depth + 1); if (r !== undefined) return r; }
  }
  return undefined;
}

function eventKind(typeStr) {
  const t = lower(typeStr);
  if (/own.?goal/.test(t)) return ['GOAL', 'own_goal'];
  if (/miss.*pen|pen.*miss/.test(t)) return ['GOAL', 'missed_penalty'];
  if (/goal|scor/.test(t)) return ['GOAL', /pen/.test(t) ? 'penalty' : 'goal'];
  if (/second.?yellow|yellow.?red/.test(t)) return ['CARD', 'second_yellow'];
  if (/red/.test(t)) return ['CARD', 'red_card'];
  if (/yellow|card/.test(t)) return ['CARD', 'yellow_card'];
  if (/sub/.test(t)) return ['SUBST', 'substitution'];
  if (/\bvar\b/.test(t)) return ['VAR', 'var'];
  return ['OTHER', 'other'];
}

function parseEvents(body, fx) {
  const list = findArray(body, ['timeline', 'events', 'incidents', 'match_events']);
  const out = [];
  for (const e of list) {
    if (!isObj(e)) continue;
    const rawMin = first(e, ['minute', 'time', 'min', 'elapsed']);
    const mm = /(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/.exec(String(rawMin ?? ''));
    const [type, kind] = eventKind(first(e, ['type', 'event', 'kind', 'incident_type', 'name']) ?? '');
    const side = lower(first(e, ['team', 'side', 'team_side']));
    const teamName = lower(nameOf(e.team));
    const isHome = e.is_home === true || side === 'home' || (teamName && teamName === lower(fx.home.name));
    const isAway = e.is_home === false || side === 'away' || (teamName && teamName === lower(fx.away.name));
    out.push({
      minute: mm ? Number(mm[1]) : 0,
      extra: mm && mm[2] ? Number(mm[2]) : null,
      teamId: isHome ? fx.home.id : isAway ? fx.away.id : null,
      type,
      kind,
      detail: clean(first(e, ['detail', 'description', 'text']) ?? '') || null,
      player: nameOf(first(e, ['player', 'player_name', 'name'])) || null,
      related: nameOf(first(e, ['assist', 'related_player', 'player_in', 'player2', 'assist_name'])) || null,
      comments: null,
    });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

const player = (p) => {
  if (!isObj(p)) return { id: null, name: clean(p), number: null, pos: null, grid: null };
  const n = first(p, ['number', 'shirt_number', 'jersey', 'shirt']);
  return { id: null, name: nameOf(first(p, ['name', 'player', 'player_name', 'full_name'])), number: n === undefined ? null : toInt(n, null), pos: clean(first(p, ['position', 'pos']) ?? '') || null, grid: null };
};

function parseLineups(body, fx) {
  const raw = findValue(body, ['lineups', 'lineup']);
  if (!raw) return [];
  const sides = Array.isArray(raw) ? raw : [raw.home && { ...raw.home, side: 'home' }, raw.away && { ...raw.away, side: 'away' }].filter(Boolean);
  const out = [];
  sides.slice(0, 2).forEach((s, i) => {
    if (!isObj(s)) return;
    const isHome = s.side ? s.side === 'home' : i === 0;
    const xi = first(s, ['startXI', 'starters', 'starting', 'players', 'lineup', 'starting_xi']);
    const subs = first(s, ['substitutes', 'subs', 'bench']);
    if (!Array.isArray(xi) || !xi.length) return;
    out.push({
      team: isHome ? fx.home : fx.away,
      formation: clean(s.formation ?? '') || null,
      coach: nameOf(s.coach ?? s.manager) || null,
      startXI: xi.map(player),
      subs: (Array.isArray(subs) ? subs : []).map(player),
    });
  });
  return out;
}

function parseStatistics(body) {
  const raw = findValue(body, ['statistics', 'stats']);
  if (Array.isArray(raw)) {
    return raw.filter(isObj).map((r) => ({ label: clean(first(r, ['label', 'name', 'type', 'title']) ?? ''), home: String(first(r, ['home', 'home_value']) ?? '0'), away: String(first(r, ['away', 'away_value']) ?? '0') })).filter((r) => r.label);
  }
  if (isObj(raw) && isObj(raw.home) && isObj(raw.away)) {
    return Object.keys(raw.home).map((k) => ({ label: k.replace(/_/g, ' '), home: String(raw.home[k] ?? '0'), away: String(raw.away[k] ?? '0') }));
  }
  return [];
}

/** Details: events, lineups and statistics when the payload exposes them; otherwise empty arrays. */
function parseMatchDetail(body, fx) {
  const v = findValue(body, ['venue', 'stadium']);
  const ref = findValue(body, ['referee']);
  return {
    venue: nameOf(v) || null,
    referee: nameOf(ref) || null,
    events: parseEvents(body, fx),
    lineups: parseLineups(body, fx),
    statistics: parseStatistics(body),
  };
}

const ROW_KEYS = ['points', 'pts', 'played', 'position', 'rank', 'team', 'team_name', 'mp'];
const looksLikeRows = (a) => Array.isArray(a) && a.length > 1 && a.every(isObj) && ROW_KEYS.filter((k) => k in a[0]).length >= 2;

function collectRowArrays(node, name = '', acc = [], depth = 0) {
  if (depth > 5 || node === null || typeof node !== 'object') return acc;
  if (looksLikeRows(node)) { acc.push({ name, rows: node }); return acc; }
  if (Array.isArray(node)) { node.forEach((x, i) => collectRowArrays(x, isObj(x) ? clean(x.name ?? x.group ?? '') || name : name, acc, depth + 1)); return acc; }
  const label = clean(node.group ?? node.name ?? name ?? '');
  for (const [k, v] of Object.entries(node)) collectRowArrays(v, Array.isArray(v) || isObj(v) ? (/^(rows|table|standings|teams|data)$/i.test(k) ? label : k) : label, acc, depth + 1);
  return acc;
}

function parseStandings(body, league) {
  const groups = collectRowArrays(body).map(({ name, rows }) => ({
    name: name || '',
    rows: rows.map((r, i) => {
      const t = first(r, ['team', 'team_name', 'club', 'name']);
      const goals = first(r, ['goals']);
      let gf = first(r, ['goals_for', 'gf', 'for', 'scored']);
      let ga = first(r, ['goals_against', 'ga', 'against', 'conceded']);
      if (typeof goals === 'string' && /[:\-]/.test(goals)) { [gf, ga] = goals.split(/[:\-]/); }
      const g = toInt(gf); const a = toInt(ga);
      return {
        rank: toInt(first(r, ['rank', 'position', 'pos']), i + 1),
        team: team(nameOf(t), isObj(t) ? first(t, ['logo', 'image']) : first(r, ['logo', 'team_logo'])),
        played: toInt(first(r, ['played', 'p', 'mp', 'matches', 'games'])),
        win: toInt(first(r, ['won', 'win', 'wins', 'w'])),
        draw: toInt(first(r, ['drawn', 'draw', 'draws', 'd'])),
        lose: toInt(first(r, ['lost', 'lose', 'loss', 'losses', 'l'])),
        goalsFor: g,
        goalsAgainst: a,
        goalDiff: toInt(first(r, ['goal_difference', 'goal_diff', 'goals_diff', 'gd', 'diff']), g - a),
        points: toInt(first(r, ['points', 'pts'])),
        form: Array.isArray(r.form) ? r.form.join('') : clean(r.form ?? ''),
        description: clean(first(r, ['description', 'status', 'note']) ?? '') || null,
      };
    }),
  })).filter((g) => g.rows.length);
  return { league: { id: league.id, name: league.name, logo: null, season: null }, groups };
}

function parseTopPlayers(body, stat) {
  const list = Array.isArray(body) ? body : findArray(body, ['players', 'scorers', 'topscorers', 'top_scorers', 'assists', 'items', 'results', 'data']);
  return list.filter(isObj).map((r, i) => {
    const t = first(r, ['team', 'team_name', 'club']);
    const value = toInt(first(r, [stat, 'value', 'count', 'total', 'stat']));
    return {
      rank: toInt(first(r, ['rank', 'position']), i + 1),
      player: { id: null, name: nameOf(first(r, ['player', 'player_name', 'name'])), photo: isObj(r.player) ? cleanLogo(first(r.player, ['photo', 'image', 'logo'])) : cleanLogo(first(r, ['photo', 'image'])) },
      team: team(nameOf(t), isObj(t) ? first(t, ['logo', 'image']) : first(r, ['team_logo', 'logo'])),
      goals: stat === 'goals' ? value : toInt(first(r, ['goals'])),
      assists: stat === 'assists' ? value : toInt(first(r, ['assists'])),
      played: toInt(first(r, ['played', 'matches', 'appearances', 'apps', 'games'])),
    };
  }).filter((p) => p.player.name);
}

module.exports = {
  LEAGUES, hash31, clean, cleanLogo, buildFilter, leagueOf, mapStatus, parseMinute, normalizeMatch,
  parseMatchDetail, parseStandings, parseTopPlayers, isExcluded,
};
