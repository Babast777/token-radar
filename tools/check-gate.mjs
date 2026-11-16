// Local stand-in for the seven gate rows. The kit has no grade-local for this bounty.
// Usage: node tools/check-gate.mjs <output-dir> <snapshot.json>
// The snapshot is the kit's sealed file, not a copy in this repository.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapshotPath = process.argv[3] ?? '/tmp/token-radar-01-kit/input/snapshot.json';
const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const fails = [];
const note = (row, ok, detail) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${row}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(row);
};

function walk(dir, prefix = '') {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(path);
    if (st.isDirectory()) files.push(...walk(path, rel));
    else files.push({ rel, path, size: st.size, name });
  }
  return files;
}

const dashDir = join(out, 'dashboard');
const dash = walk(dashDir);
const dashBytes = dash.reduce((s, f) => s + f.size, 0);
const namesOk = dash.every((f) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f.name) && !f.rel.split('/').some((p) => p.startsWith('.')));
const html = dash.filter((f) => f.name.endsWith('.html')).map((f) => readFileSync(f.path, 'utf8')).join('\n');
const css = dash.filter((f) => f.name.endsWith('.css')).map((f) => readFileSync(f.path, 'utf8')).join('\n');
const js = dash.filter((f) => f.name.endsWith('.js')).map((f) => readFileSync(f.path, 'utf8')).join('\n');
const attrUrl = /<[^>]*\s(?:href|src|action|poster|data)\s*=\s*["']https?:\/\//i.test(html);
const cssUrl = /https?:\/\//.test(css);
const importUrl = /(?:import|export)\s[^;]*from\s*['"]https?:\/\/|import\(\s*['"]https?:\/\/|require\(\s*['"]https?:\/\//.test(js);
const hasHtml = dash.some((f) => f.name === 'index.html');
const hasCss = dash.some((f) => f.name.endsWith('.css'));
const hasJs = dash.some((f) => f.name.endsWith('.js'));
note('dashboard_files', hasHtml && hasCss && hasJs && dash.length <= 400 && dashBytes <= 4_194_304 && namesOk && !attrUrl && !cssUrl && !importUrl,
  `${dash.length} files, ${dashBytes} bytes`);

const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = Array.isArray(board) ? board : board.rows;
const slugs = new Set(snap.protocols.map((p) => p.slug));
const rowOk = rows.every((r) => slugs.has(r.slug) && r.name && Number.isSafeInteger(r.rank) && r.rank > 0
  && Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 100_000_000_000_000
  && Array.isArray(r.farm_steps));
const same = rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
note('board_file', rows.length >= 100 && rows.length <= 4000 && rowOk && !same && statSync(join(out, 'board.json')).size <= 8_388_608,
  `${rows.length} rows`);

const byRank = [...rows].sort((a, b) => a.rank - b.rank);
let ranksOk = byRank.length === rows.length;
const seen = new Set();
for (let i = 0; i < byRank.length; i++) {
  if (byRank[i].rank !== i + 1 || seen.has(byRank[i].slug)) ranksOk = false;
  seen.add(byRank[i].slug);
  if (i > 0 && byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) ranksOk = false;
}
note('sorted_by_value', ranksOk, `rank 1 $${byRank[0]?.implied_value_usd}`);

const missing = snap.watchlist.filter((s) => !seen.has(s));
note('coverage', missing.length === 0, missing.length ? missing.slice(0, 5).join(', ') : `${snap.watchlist.length}/${snap.watchlist.length}`);

const stepsOk = rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600));
note('farm_steps', stepsOk, '3 to 12 steps, 20 to 600 characters');

function pngSize(buf) {
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const shots = readdirSync(join(out, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
let shotOk = shots.length >= 3 && shots.length <= 4;
const shotDetails = [];
for (const name of shots) {
  const buf = readFileSync(join(out, 'screenshots', name));
  const dim = pngSize(buf);
  const long = dim ? Math.max(dim.w, dim.h) : 0;
  const short = dim ? Math.min(dim.w, dim.h) : 0;
  shotDetails.push(`${name} ${buf.length} ${dim ? dim.w + 'x' + dim.h : 'bad'}`);
  if (!dim || buf.length > 524_288 || long > 1440 || short < 800 || !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name)) shotOk = false;
}
note('screenshots', shotOk, shotDetails.join('; '));

let dossierOk = false;
let dossierDetail = '';
try {
  const built = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  const onDisk = readFileSync(join(out, 'dossier.json'));
  dossierOk = onDisk.equals(Buffer.from(built)) && onDisk.length <= Math.floor(1.5 * 1024 * 1024);
  dossierDetail = `${onDisk.length} bytes, sha256 ${createHash('sha256').update(onDisk).digest('hex').slice(0, 16)}`;
} catch (err) {
  dossierDetail = String(err.message || err);
}
note('dossier_matches', dossierOk, dossierDetail);

if (fails.length) {
  console.log('gate: failed', fails.join(', '));
  process.exit(1);
}
console.log('gate: all seven rows pass');
