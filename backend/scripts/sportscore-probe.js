'use strict';
/**
 * SportScore verification probe.
 *
 * Calls ONLY the endpoints documented at https://sportscore.com/developers/ (GET /api/widget/{matches,match,
 * standings,topscorers}/) and records what the live API really returns, so the provider adapter can be written
 * against evidence instead of guesses. It is schema-agnostic on purpose: it never assumes field names.
 *
 *   node scripts/sportscore-probe.js [--out probe-out]
 *
 * Needs outbound internet (no API key). Uses about 40 requests of the free quota (~10,000 / 24 h per IP).
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://sportscore.com';
const SRC = 'goalpulse-probe'; // optional self-identification parameter from the docs
const outDir = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'sportscore-samples');
fs.mkdirSync(outDir, { recursive: true });

// The nine required competitions. Slugs are CANDIDATES (the docs only show "premier-league" as an example);
// the probe reports which ones the API actually accepts.
const REQUIRED = [
  { id: 'epl', name: 'Premier League', pattern: /premier league/i, slugs: ['premier-league', 'english-premier-league'] },
  { id: 'laliga', name: 'La Liga', pattern: /la ?liga/i, slugs: ['la-liga', 'spanish-la-liga', 'laliga'] },
  { id: 'seriea', name: 'Serie A', pattern: /serie a/i, slugs: ['serie-a', 'italian-serie-a'] },
  { id: 'bundesliga', name: 'Bundesliga', pattern: /bundesliga/i, slugs: ['bundesliga', 'german-bundesliga'] },
  { id: 'ligue1', name: 'Ligue 1', pattern: /ligue 1/i, slugs: ['ligue-1', 'french-ligue-1'] },
  { id: 'ucl', name: 'UEFA Champions League', pattern: /champions league/i, slugs: ['uefa-champions-league', 'champions-league'] },
  { id: 'uel', name: 'UEFA Europa League', pattern: /europa league/i, slugs: ['uefa-europa-league', 'europa-league'] },
  { id: 'spl', name: 'Saudi Pro League', pattern: /saudi/i, slugs: ['saudi-pro-league', 'saudi-professional-league', 'saudi-league'] },
  { id: 'iraq', name: 'Iraq Stars League', pattern: /iraq/i, slugs: ['iraq-stars-league', 'iraqi-stars-league', 'iraqi-premier-league', 'stars-league'] },
];

let requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(endpoint, params) {
  const base = endpoint.startsWith('v1/') ? `${BASE}/api/${endpoint}` : `${BASE}/api/widget/${endpoint}`;
  const url = `${base}/?${new URLSearchParams({ ...params, src: SRC })}`;
  requests += 1;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    await sleep(300); // be polite
    return { url, status: res.status, ms: Date.now() - t0, bytes: text.length, json, cacheControl: res.headers.get('cache-control'), age: res.headers.get('age') };
  } catch (err) {
    return { url, status: 0, error: err.message };
  }
}

const save = (name, data) => fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2));

/** Every key path in a JSON value (depth-limited), e.g. "matches[].home.name". */
function paths(v, prefix = '', depth = 0, acc = new Set()) {
  if (depth > 5 || v === null || typeof v !== 'object') return acc;
  if (Array.isArray(v)) { if (v.length) paths(v[0], `${prefix}[]`, depth + 1, acc); return acc; }
  for (const [k, val] of Object.entries(v)) { const p = prefix ? `${prefix}.${k}` : k; acc.add(p); paths(val, p, depth + 1, acc); }
  return acc;
}
const hasKey = (set, re) => [...set].some((p) => re.test(p.split('.').pop().replace(/\[\]/g, '')));
const countItems = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + countItems(x), 0) : 0);
function findFirst(v, key, depth = 0) {
  if (depth > 6 || v === null || typeof v !== 'object') return undefined;
  if (!Array.isArray(v) && typeof v[key] === 'string') return v[key];
  for (const x of Array.isArray(v) ? v : Object.values(v)) { const r = findFirst(x, key, depth + 1); if (r) return r; }
  return undefined;
}

(async () => {
  const lines = [];
  const log = (s = '') => { console.log(s); lines.push(s); };
  log('# SportScore probe\n');

  // 1. live + recent football matches (the only list endpoint in the docs; limit 1..50, no date or league filter)
  const list = await get('matches', { sport: 'football', limit: 50 });
  save('matches', list);
  log(`## matches (limit 50): HTTP ${list.status}, ${list.bytes ?? 0} bytes, cache-control: ${list.cacheControl || 'n/a'}, age: ${list.age || 'n/a'}`);
  const listPaths = paths(list.json);
  const items = list.json && (list.json.matches || []);
  log(`- items returned: ${Array.isArray(items) ? items.length : 'n/a'}`);
  log(`- field paths (first item): ${[...listPaths].slice(0, 60).join(', ') || 'n/a'}`);
  const text = JSON.stringify(list.json || {});
  log('\n### Required competitions seen in this live+recent window');
  for (const c of REQUIRED) log(`- ${c.name}: ${(text.match(new RegExp(c.pattern.source, 'gi')) || []).length} mentions`);

  // 2. standings per candidate slug
  log('\n## standings: which competition slugs does the API accept?');
  const working = {};
  for (const c of REQUIRED) {
    for (const slug of c.slugs) {
      const r = await get('standings', { sport: 'football', slug });
      const rows = countItems(r.json);
      log(`- ${c.name} / ${slug}: HTTP ${r.status}${rows ? `, ${rows} items` : ', empty'}`);
      if (r.status === 200 && rows > 0) { working[c.id] = slug; save(`standings-${c.id}`, r); break; }
    }
    if (!working[c.id]) log(`  -> no working slug found among candidates for ${c.name}`);
  }

  // 3. top scorers for the working slugs
  log('\n## topscorers (goals)');
  for (const c of REQUIRED.filter((x) => working[x.id])) {
    const r = await get('topscorers', { sport: 'football', slug: working[c.id], limit: 10, stat: 'goals' });
    save(`topscorers-${c.id}`, r);
    log(`- ${c.name}: HTTP ${r.status}, ${countItems(r.json)} items`);
  }

  // 4. one match detail, using a slug taken from the list
  const slug = findFirst(list.json, 'slug');
  log('\n## match detail');
  if (slug) {
    const m = await get('match', { sport: 'football', slug });
    save('match-detail', m);
    const p = paths(m.json);
    log(`- slug ${slug}: HTTP ${m.status}`);
    log(`- lineups present: ${hasKey(p, /lineup/i)}, timeline/events present: ${hasKey(p, /timeline|event|incident/i)}, statistics present: ${hasKey(p, /stat/i)}`);
    log(`- field paths: ${[...p].slice(0, 80).join(', ')}`);
  } else {
    log('- no "slug" key found in the matches list: inspect matches.json to see how matches are identified.');
  }

  // 5. the day endpoint the adapter uses: is it capped at 100 rows, and which paging parameter works?
  log('\n## v1/fixtures (day list used by the adapter)');
  const day = new Date().toISOString().slice(0, 10);
  const d1 = await get('v1/fixtures', { sport: 'football', date: day });
  save('fixtures-day', d1);
  const n1 = (d1.json && d1.json.matches || []).length;
  log(`- HTTP ${d1.status}, ${n1} rows, count field: ${d1.json && d1.json.count}`);
  if (n1 >= 100) {
    for (const extra of [{ limit: 500 }, { page: 2 }, { offset: 100 }]) {
      const r = await get('v1/fixtures', { sport: 'football', date: day, ...extra });
      log(`- ${JSON.stringify(extra)}: HTTP ${r.status}, ${(r.json && r.json.matches || []).length} rows`);
      save(`fixtures-day-${Object.keys(extra)[0]}`, r);
    }
  }
  const liveRow = ((d1.json && d1.json.matches) || []).find((m) => !['upcoming', 'finished'].includes(m.status));
  log(`- a row with a status other than upcoming/finished (in-play wording): ${liveRow ? `${liveRow.status} / ${liveRow.status_text}` : 'none right now (run again while matches are live)'}`);

  log(`\n## Summary\n- requests used by this probe: ${requests}`);
  log(`- competitions with a working standings slug: ${Object.keys(working).length} of ${REQUIRED.length} (${REQUIRED.filter((c) => !working[c.id]).map((c) => c.name).join(', ') || 'none missing'})`);
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n'));
  console.log(`\nSamples and summary.md written to ${outDir}`);
})();
