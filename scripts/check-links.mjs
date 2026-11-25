#!/usr/bin/env node
// Link checker for the built site. Run after a build: `node scripts/check-links.mjs`.
//
//   --external        also GET every unique external URL
//   --root <dir>      project root (default: the parent of scripts/)
//   --dist <dir>      build output (default: <root>/dist)
//   --site <origin>   site origin (default: `site` in astro.config.mjs)
//   --verbose         list every blocked or redirected external URL
//
// Internal: every href/src must resolve to a file in dist/ (a path ending in "/"
// needs an index.html). Links into a sibling project site (see `reservedPaths`
// in src/data/profile.ts) must be absolute, e.g. https://semiquant.com/PPE/,
// because those paths are not part of this build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = path.resolve(opt('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const DIST = path.resolve(opt('--dist', path.join(ROOT, 'dist')));
const EXTERNAL = flag('--external');
const VERBOSE = flag('--verbose');

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Hosts that refuse scripted requests. 403/429/999 from these is "blocked", not "broken".
const BOT_BLOCKING_HOSTS = [
  'linkedin.com', 'researchgate.net', 'medium.com', 'shinyapps.io',
  // DOI resolver and the publishers it lands on.
  'doi.org', 'sciencedirect.com', 'elsevier.com', 'thelancet.com', 'cell.com', 'wiley.com', 'onlinelibrary.wiley.com',
  'tandfonline.com', 'asm.org', 'oup.com', 'nejm.org', 'atsjournals.org', 'ersjournals.com', 'ersnet.org',
  'publications.ersnet.org', 'jove.com', 'biorxiv.org', 'medrxiv.org', 'springer.com', 'nature.com', 'biomedcentral.com',
  'plos.org', 'frontiersin.org', 'ingentaconnect.com', 'theunion.org', 'science.org', 'pnas.org', 'bmj.com',
  'jamanetwork.com', 'acs.org', 'mdpi.com', 'ncbi.nlm.nih.gov', 'nih.gov', 'protocols.io', 'patents.google.com',
  'scholar.google.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'apps.apple.com', 'tinyurl.com',
];
const BLOCKED_STATUS = new Set([403, 429, 999]);
// Apps that sleep and can time out while waking up.
const SLOW_WAKE_HOSTS = ['shinyapps.io'];

const hostMatches = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`));

function readSiteOrigin() {
  const given = opt('--site', null);
  if (given) return new URL(given).origin;
  try {
    const m = fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8').match(/site:\s*['"]([^'"]+)['"]/);
    if (m) return new URL(m[1]).origin;
  } catch {
    // fall through
  }
  return 'https://semiquant.com';
}

function readReservedPaths() {
  try {
    const m = fs.readFileSync(path.join(ROOT, 'src/data/profile.ts'), 'utf8').match(/reservedPaths\s*=\s*\[([\s\S]*?)\]/);
    return m ? [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [];
  } catch {
    return [];
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error(`check-links: ${DIST} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const SITE = readSiteOrigin();
const SITE_HOSTS = new Set([new URL(SITE).host, `www.${new URL(SITE).host}`]);
const reserved = readReservedPaths();
const reservedLower = new Map(reserved.map((r) => [r.toLowerCase(), r]));

const rel = (p) => path.relative(DIST, p);
const failures = [];
const warnings = [];
/** @type {Map<string, Set<string>>} external URL -> pages that use it */
const externals = new Map();
const idCache = new Map();
let internalCount = 0;

// [selector, attribute]
const SOURCES = [
  ['a[href]', 'href'], ['area[href]', 'href'], ['link[href]', 'href'], ['img[src]', 'src'], ['script[src]', 'src'],
  ['source[src]', 'src'], ['video[src]', 'src'], ['audio[src]', 'src'], ['track[src]', 'src'], ['iframe[src]', 'src'],
  ['embed[src]', 'src'], ['object[data]', 'data'], ['video[poster]', 'poster'], ['img[srcset]', 'srcset'],
  ['source[srcset]', 'srcset'], ['form[action]', 'action'],
  ['meta[property="og:image"]', 'content'], ['meta[property="og:url"]', 'content'], ['meta[name="twitter:image"]', 'content'],
];
const SKIP_REL = /\b(?:preconnect|dns-prefetch)\b/i;

function idsOf(file) {
  if (!idCache.has(file)) {
    const $ = load(fs.readFileSync(file, 'utf8'));
    const ids = new Set();
    $('[id]').each((_, el) => ids.add($(el).attr('id')));
    $('a[name]').each((_, el) => ids.add($(el).attr('name')));
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

function addExternal(url, page) {
  const clean = url.split('#')[0];
  if (!externals.has(clean)) externals.set(clean, new Set());
  externals.get(clean).add(page);
}

function checkInternal(pathname, hash, page, raw, line) {
  internalCount++;
  const where = `${rel(page)}:${line}`;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    failures.push({ where, raw, msg: 'malformed URL encoding' });
    return;
  }
  const first = decoded.split('/').filter(Boolean)[0] ?? '';
  const reservedName = reservedLower.get(first.toLowerCase());
  if (reservedName) {
    failures.push({
      where, raw,
      msg: `points into the sibling project site "/${reservedName}/", which is not part of this build. Use the absolute URL ${SITE}/${reservedName}/ if that is intended`,
    });
    return;
  }
  const target = path.join(DIST, decoded);
  if (!target.startsWith(DIST)) {
    failures.push({ where, raw, msg: 'resolves outside the site root' });
    return;
  }
  let file = null;
  if (decoded.endsWith('/')) {
    const index = path.join(target, 'index.html');
    if (fs.existsSync(index)) file = index;
    else failures.push({ where, raw, msg: `no page at ${decoded} (missing ${rel(index)})` });
  } else if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    file = target;
  } else if (fs.existsSync(path.join(target, 'index.html'))) {
    failures.push({ where, raw, msg: `missing trailing slash, link to ${decoded}/ instead` });
  } else {
    failures.push({ where, raw, msg: `no file at ${decoded}` });
  }
  if (file && hash && hash.length > 1 && /\.html?$/i.test(file)) {
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the raw fragment
    }
    if (!id.startsWith(':~:') && !idsOf(file).has(id)) {
      warnings.push({ where, raw, msg: `no element with id "${id}" in ${rel(file)}` });
    }
  }
}

function handle(raw, page, pageUrl, line) {
  const value = raw.trim();
  if (!value || value === '#') return;
  if (/^(?:mailto|tel|sms|javascript|data|blob|about):/i.test(value)) return;
  let url;
  try {
    url = new URL(value, pageUrl);
  } catch {
    failures.push({ where: `${rel(page)}:${line}`, raw, msg: 'not a valid URL' });
    return;
  }
  if (!/^https?:$/.test(url.protocol)) return;

  const isAbsolute = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value);
  if (SITE_HOSTS.has(url.host)) {
    const first = decodeURIComponent(url.pathname).split('/').filter(Boolean)[0] ?? '';
    const reservedName = reservedLower.get(first.toLowerCase());
    if (isAbsolute && reservedName) {
      // An intentional link to a sibling project site. GitHub Pages paths are case-sensitive.
      if (first !== reservedName) {
        failures.push({ where: `${rel(page)}:${line}`, raw, msg: `sibling project path is "/${reservedName}/" (case matters), not "/${first}/"` });
        return;
      }
      addExternal(url.href, rel(page));
      return;
    }
    checkInternal(url.pathname, url.hash, page, raw, line);
    return;
  }
  addExternal(url.href, rel(page));
}

// ---------------------------------------------------------------- crawl

const pages = walk(DIST).filter((f) => /\.html?$/i.test(f));
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const $ = load(html, { sourceCodeLocationInfo: true });
  const relPage = rel(page).split(path.sep).join('/');
  const pageUrl = new URL(relPage.replace(/(^|\/)index\.html$/, '$1'), `${SITE}/`);
  const base = $('base[href]').attr('href');
  const baseUrl = base ? new URL(base, pageUrl) : pageUrl;

  for (const [selector, attr] of SOURCES) {
    $(selector).each((_, el) => {
      if (el.tagName === 'link' && SKIP_REL.test($(el).attr('rel') ?? '')) return;
      const value = $(el).attr(attr);
      if (value === undefined) return;
      const line = el.sourceCodeLocation?.startLine ?? 0;
      if (attr === 'srcset') {
        for (const part of value.split(',')) {
          const candidate = part.trim().split(/\s+/)[0];
          if (candidate) handle(candidate, page, baseUrl, line);
        }
      } else {
        handle(value, page, baseUrl, line);
      }
    });
  }
}

// ---------------------------------------------------------------- external

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    // Do not download bodies.
    res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url };
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { status: 0, error: timedOut ? `timeout after ${TIMEOUT_MS / 1000}s` : (err.cause?.code ?? err.cause?.message ?? err.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkExternal(url) {
  let result = await fetchOnce(url);
  // One retry for network errors and 5xx.
  if (result.status === 0 || result.status >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await fetchOnce(url);
  }
  const host = new URL(url).host.replace(/^www\./, '');
  const finalHost = result.finalUrl ? new URL(result.finalUrl).host.replace(/^www\./, '') : host;
  const { status } = result;
  // PubMed answers scripted requests with 203 and a captcha page, which says nothing about the record.
  if (status === 203 && hostMatches(finalHost, ['pubmed.ncbi.nlm.nih.gov'])) return { url, verdict: 'blocked', status: '203 (captcha page)' };
  if ((status >= 200 && status <= 399) || status === 202) return { url, verdict: 'ok', status, finalUrl: result.finalUrl };
  const botHost = hostMatches(host, BOT_BLOCKING_HOSTS) || hostMatches(finalHost, BOT_BLOCKING_HOSTS);
  if (BLOCKED_STATUS.has(status) && botHost) return { url, verdict: 'blocked', status };
  if (status === 0 && /timeout/.test(result.error ?? '') && (hostMatches(host, SLOW_WAKE_HOSTS) || hostMatches(finalHost, SLOW_WAKE_HOSTS))) {
    return { url, verdict: 'blocked', status: 'timeout (app waking up)' };
  }
  // Some publishers loop through a login redirect when the client keeps no cookies.
  // Count that as blocked only when the first hop lands on a known bot-blocking host.
  if (status === 0 && /redirect count exceeded/i.test(String(result.error ?? ''))) {
    const first = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
    first?.body?.cancel().catch(() => {});
    const loc = first?.headers.get('location');
    const hopHost = loc ? new URL(loc, url).host.replace(/^www\./, '') : host;
    if (first && first.status >= 300 && first.status < 400 && hostMatches(hopHost, BOT_BLOCKING_HOSTS)) {
      return { url, verdict: 'blocked', status: 'redirect loop without cookies' };
    }
  }
  return { url, verdict: 'failed', status: status || result.error };
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

let externalResults = [];
if (EXTERNAL) {
  const urls = [...externals.keys()].sort();
  console.log(`check-links: checking ${urls.length} external URLs (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS / 1000}s)`);
  externalResults = await pool(urls, CONCURRENCY, checkExternal);
}

// ---------------------------------------------------------------- report

const usedOn = (url) => {
  const list = [...(externals.get(url) ?? [])];
  return list.slice(0, 3).join(', ') + (list.length > 3 ? ` (+${list.length - 3} more)` : '');
};
const blocked = externalResults.filter((r) => r.verdict === 'blocked');
const hardFailed = externalResults.filter((r) => r.verdict === 'failed');
const okCount = externalResults.filter((r) => r.verdict === 'ok').length;

const distLabel = path.relative(ROOT, DIST);
console.log(`check-links: ${pages.length} pages in ${!distLabel || distLabel.startsWith('..') ? DIST : distLabel}, site ${SITE}`);
console.log(`  internal links checked: ${internalCount}, broken: ${failures.length}, anchor warnings: ${warnings.length}`);
console.log(
  EXTERNAL
    ? `  external URLs: ${externals.size} unique, ok ${okCount}, blocked (not broken) ${blocked.length}, failed ${hardFailed.length}`
    : `  external URLs: ${externals.size} unique, not checked (pass --external)`,
);

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ${w.where}  ${w.raw}  ${w.msg}`);
}
if (blocked.length) {
  console.log(`\nBlocked by the host, check by hand if in doubt (${blocked.length}):`);
  for (const b of VERBOSE ? blocked : blocked.slice(0, 15)) console.log(`  ${b.status}  ${b.url}`);
  if (!VERBOSE && blocked.length > 15) console.log(`  ... ${blocked.length - 15} more (use --verbose)`);
}
if (failures.length) {
  console.error(`\nBroken internal links (${failures.length}):`);
  for (const f of failures) console.error(`  ${f.where}  ${f.raw}\n      ${f.msg}`);
}
if (hardFailed.length) {
  console.error(`\nBroken external links (${hardFailed.length}):`);
  for (const f of hardFailed) console.error(`  ${f.status}  ${f.url}\n      used on: ${usedOn(f.url)}`);
}
if (failures.length || hardFailed.length) {
  console.error(`\nFAIL: ${failures.length} internal, ${hardFailed.length} external`);
  process.exit(1);
}
console.log('\nPASS');
