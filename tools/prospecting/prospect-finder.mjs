#!/usr/bin/env node
/**
 * Magnus Accord — prospect finder.
 *
 * Pulls US 501(c)(3) organizations from ProPublica's free Nonprofit Explorer API,
 * computes funding-concentration signals from their public Form 990 filings, and
 * ranks them as outreach targets.
 *
 * No API key. No cost. No account.
 *
 *   node prospect-finder.mjs --state NY --ntee P --pages 3 > prospects.csv
 *
 * Flags:
 *   --state   two-letter US state code            (required)
 *   --ntee    NTEE major group letter, e.g. P     (repeatable)
 *   --q       search term                         (default: empty = broad)
 *   --pages   result pages to scan, 25 orgs each  (default 4)
 *   --min     minimum total revenue               (default 500000)
 *   --max     maximum total revenue               (default 5000000)
 *   --limit   max rows to output                  (default 40)
 *
 * FIELD NAMES VERIFIED against the live API on 21 Aug 2026:
 *   search:  ein, name, city, state, ntee_code, subseccd
 *   detail:  filings_with_data[].{tax_prd_yr, totrevenue, totcntrbgfts,
 *                                 totprgmrevnue, invstmntinc}
 *
 * HONEST LIMIT: the 990 exposes revenue by SOURCE CATEGORY, not by individual
 * funder. Schedule B donor detail is not public. So "82% of revenue is
 * contributions" is certain; "82% comes from the Acme Foundation" is not
 * knowable from outside and must never be claimed.
 */

import { setTimeout as sleep } from 'node:timers/promises';

const API = 'https://projects.propublica.org/nonprofits/api/v2';

// ─── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { ntee: [], pages: 4, min: 500_000, max: 5_000_000, limit: 40, q: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--state') out.state = next().toUpperCase();
    else if (a === '--ntee') out.ntee.push(next().toUpperCase());
    else if (a === '--q') out.q = next();
    else if (a === '--pages') out.pages = Number(next());
    else if (a === '--min') out.min = Number(next());
    else if (a === '--max') out.max = Number(next());
    else if (a === '--limit') out.limit = Number(next());
  }
  if (!out.state) {
    console.error('ERROR: --state is required (e.g. --state NY)');
    process.exit(2);
  }
  return out;
}

// NTEE major group letter -> ProPublica ntee[id]. Their ids are 1-indexed by group.
const NTEE_ID = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10,
  K: 11, L: 12, M: 13, N: 14, O: 15, P: 16, Q: 17, R: 18, S: 19,
  T: 20, U: 21, V: 22, W: 23, X: 24, Y: 25, Z: 26,
};

// ─── fetch helpers ───────────────────────────────────────────────────────────

async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'magnus-accord-prospecting/1.0 (nonprofit advisory research)' },
    });
    if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (attempt >= 3) return null;
    await sleep(1500 * attempt);
    return getJson(url, attempt + 1);
  }
}

// ─── metrics ─────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Herfindahl index across revenue source categories.
 * 1.0 = every dollar from one category. ~0.25 = evenly spread across four.
 * Returns null when total revenue is absent — an unknown mix is not a low one.
 */
function sourceHHI(f) {
  const total = num(f.totrevenue);
  if (total <= 0) return null;
  const contrib = num(f.totcntrbgfts);
  const program = num(f.totprgmrevnue);
  const invest = num(f.invstmntinc);
  const other = Math.max(0, total - contrib - program - invest);
  return [contrib, program, invest, other]
    .map((v) => (v / total) ** 2)
    .reduce((a, b) => a + b, 0);
}

function analyse(org, filings) {
  const usable = (filings || [])
    .filter((f) => num(f.totrevenue) > 0)
    .sort((a, b) => num(b.tax_prd_yr) - num(a.tax_prd_yr));
  if (!usable.length) return null;

  const latest = usable[0];
  const prior = usable[1];
  const total = num(latest.totrevenue);

  const contribShare = total > 0 ? num(latest.totcntrbgfts) / total : null;
  const programShare = total > 0 ? num(latest.totprgmrevnue) / total : null;
  const hhi = sourceHHI(latest);

  // Revenue shock: negative = decline. The single strongest timing signal.
  const yoy = prior && num(prior.totrevenue) > 0
    ? (total - num(prior.totrevenue)) / num(prior.totrevenue)
    : null;

  // Score. Shock and concentration dominate; HHI breaks ties.
  let score = 0;
  if (yoy !== null && yoy <= -0.20) score += 50;
  else if (yoy !== null && yoy <= -0.10) score += 25;
  if (contribShare !== null && contribShare >= 0.60) score += 30;
  else if (contribShare !== null && contribShare >= 0.45) score += 15;
  if (hhi !== null && hhi >= 0.50) score += 20;
  else if (hhi !== null && hhi >= 0.35) score += 10;

  return {
    ein: org.ein,
    name: org.name,
    city: org.city,
    state: org.state,
    ntee: org.ntee_code,
    year: num(latest.tax_prd_yr),
    totalRevenue: total,
    contribShare,
    programShare,
    hhi,
    yoy,
    score,
    filingsUsed: usable.length,
  };
}

/** The sentence that goes in the outreach email. Written to be verifiably true. */
function hook(p) {
  if (p.yoy !== null && p.yoy <= -0.20) {
    return `Total revenue fell ${(Math.abs(p.yoy) * 100).toFixed(0)}% between ${p.year - 1} and ${p.year}.`;
  }
  if (p.contribShare !== null && p.contribShare >= 0.60) {
    return `${(p.contribShare * 100).toFixed(0)}% of ${p.year} revenue came from contributions and gifts.`;
  }
  if (p.programShare !== null && p.programShare >= 0.60) {
    return `${(p.programShare * 100).toFixed(0)}% of ${p.year} revenue came from program services.`;
  }
  if (p.hhi !== null && p.hhi >= 0.50) {
    return `Revenue is concentrated across few sources (HHI ${p.hhi.toFixed(2)}) in ${p.year}.`;
  }
  return `Revenue mix reviewed for ${p.year}; no single-source concentration flagged.`;
}

// ─── main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

const nteeParams = args.ntee
  .map((l) => NTEE_ID[l])
  .filter(Boolean)
  .map((id) => `ntee%5Bid%5D=${id}`)
  .join('&');

const seen = new Set();
const candidates = [];

for (let page = 0; page < args.pages; page++) {
  const url =
    `${API}/search.json?q=${encodeURIComponent(args.q)}` +
    `&state%5Bid%5D=${args.state}&c_code%5Bid%5D=3` +
    (nteeParams ? `&${nteeParams}` : '') +
    `&page=${page}`;

  const data = await getJson(url);
  if (!data || !Array.isArray(data.organizations) || data.organizations.length === 0) break;

  for (const org of data.organizations) {
    if (org.subseccd !== 3) continue;      // 501(c)(3) only
    if (seen.has(org.ein)) continue;
    seen.add(org.ein);
    candidates.push(org);
  }
  process.stderr.write(`scanned page ${page + 1}, ${candidates.length} candidates\n`);
  await sleep(400);                         // be a good citizen
}

const rows = [];
let checked = 0;

for (const org of candidates) {
  checked++;
  if (checked % 25 === 0) process.stderr.write(`  fetched ${checked}/${candidates.length} filings\n`);

  const detail = await getJson(`${API}/organizations/${org.ein}.json`);
  await sleep(350);
  if (!detail) continue;

  const filings = detail.filings_with_data || detail.organization?.filings_with_data || [];
  const p = analyse(detail.organization || org, filings);
  if (!p) continue;

  if (p.totalRevenue < args.min || p.totalRevenue > args.max) continue;
  if (p.score === 0) continue;              // no signal, no outreach angle

  p.hook = hook(p);
  rows.push(p);
}

rows.sort((a, b) => b.score - a.score);

const pct = (v) => (v === null ? '' : (v * 100).toFixed(1));
const out = rows.slice(0, args.limit);

console.log(
  ['score','ein','name','city','state','ntee','year','total_revenue',
   'contrib_pct','program_pct','hhi','yoy_pct','hook'].join(','),
);
for (const p of out) {
  console.log([
    p.score,
    `"${p.ein}"`,
    `"${String(p.name).replace(/"/g, "'")}"`,
    `"${p.city ?? ''}"`,
    p.state ?? '',
    p.ntee ?? '',
    p.year,
    p.totalRevenue,
    pct(p.contribShare),
    pct(p.programShare),
    p.hhi === null ? '' : p.hhi.toFixed(3),
    p.yoy === null ? '' : pct(p.yoy),
    `"${p.hook}"`,
  ].join(','));
}

process.stderr.write(
  `\nDONE: ${out.length} qualified prospects from ${candidates.length} scanned ` +
  `(revenue $${args.min.toLocaleString()}–$${args.max.toLocaleString()})\n`,
);
