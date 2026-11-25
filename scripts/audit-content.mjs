#!/usr/bin/env node
// Content accuracy audit: `node scripts/audit-content.mjs`.
//
//   --root <dir>      project root (default: the parent of scripts/)
//   --dist <dir>      build output (default: <root>/dist; dist checks are skipped when absent)
//   --no-dist         skip the built-site checks
//   --verbose         list every detail line, not only the first 12 per check
//   CV_SRC=<path>     the private cv.html to compare against. Checks that need it
//                     are skipped with a notice when the file is absent (as in CI).
//
// Data checks read src/data/*.yaml, src/data/profile.ts and src/content/projects/*.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { parse as parseYaml } from 'yaml';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = path.resolve(opt('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const DIST = path.resolve(opt('--dist', path.join(ROOT, 'dist')));
const VERBOSE = flag('--verbose');
const CV_SRC = process.env.CV_SRC ?? '';

const EXPECT = {
  inCv: 36,
  firstOrJointFirst: 12,
  hIndex: 16,
  citations: 1507,
  siteStrings: ['$40', '$2,000', '$12.50', '182 countries'],
  placeholders: [
    ['Lorem', /\bLorem\b/i],
    ['TODO', /\bTODO\b/],
    ['Stub.', /\bStub\.(?!\w)/],
    ['undefined', /\bundefined\b/],
    ['[object Object]', /\[object Object\]/],
    ['NaN', /(?<![\w-])NaN(?![\w-])/],
  ],
};

// ---------------------------------------------------------------- results table

/** @type {{name: string, status: 'PASS'|'FAIL'|'SKIP', summary: string, details: string[]}[]} */
const results = [];
const record = (name, status, summary, details = []) => results.push({ name, status, summary, details });
/** Record PASS when `problems` is empty, else FAIL with the problems listed. */
const check = (name, problems, okSummary) =>
  problems.length
    ? record(name, 'FAIL', `${problems.length} problem${problems.length === 1 ? '' : 's'}`, problems)
    : record(name, 'PASS', okSummary);

// ---------------------------------------------------------------- helpers

const exists = (p) => fs.existsSync(p);
const rel = (p) => {
  const r = path.relative(ROOT, p) || '.';
  return r.startsWith('..') ? p : r;
};

/** Loose title key: no markup, accents, case, punctuation or spacing. */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normDoi = (s) =>
  String(s ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase();

const ELLIPSIS = /^(?:…|\.\.\.|et al\.?)$/i;
/** Split author strings so "… Limberis JD" and "et al." become their own tokens. */
function authorTokens(list) {
  return list
    .flatMap((a) => String(a).split(/(…|\.\.\.)/))
    .map((a) => a.replace(/\s+/g, ' ').trim().replace(/\.$/, (m, off, s) => (/et al\.$/i.test(s) ? m : '')))
    .filter(Boolean);
}
const isOwner = (token) => /^Limberis\b/i.test(token.replace(/[*†‡#]/g, '').trim());

function readYaml(file) {
  if (!exists(file)) return { error: `${rel(file)} not found` };
  try {
    return { data: parseYaml(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { error: `${rel(file)}: ${err.message.split('\n')[0]}` };
  }
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- load data

const pubsFile = path.join(ROOT, 'src/data/publications.yaml');
const grantsFile = path.join(ROOT, 'src/data/grants.yaml');
const profileFile = path.join(ROOT, 'src/data/profile.ts');
const projectsDir = path.join(ROOT, 'src/content/projects');

const pubsRead = readYaml(pubsFile);
const grantsRead = readYaml(grantsFile);
const pubs = Array.isArray(pubsRead.data) ? pubsRead.data : [];
const grants = Array.isArray(grantsRead.data) ? grantsRead.data : [];
const inCvPubs = pubs.filter((p) => p.inCv !== false);

{
  const problems = [];
  if (pubsRead.error) problems.push(pubsRead.error);
  else if (!Array.isArray(pubsRead.data)) problems.push(`${rel(pubsFile)}: expected a top-level list`);
  if (grantsRead.error) problems.push(grantsRead.error);
  else if (!Array.isArray(grantsRead.data)) problems.push(`${rel(grantsFile)}: expected a top-level list`);
  check('Data files load', problems, `${pubs.length} publications, ${grants.length} grants`);
}

// ---------------------------------------------------------------- data checks

// ids unique
{
  const problems = [];
  for (const [label, list] of [['publications.yaml', pubs], ['grants.yaml', grants]]) {
    const seen = new Map();
    list.forEach((item, i) => {
      if (!item?.id) return problems.push(`${label}: entry ${i + 1} has no id`);
      seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
    });
    for (const [id, n] of seen) if (n > 1) problems.push(`${label}: id "${id}" is used ${n} times`);
  }
  // Two entries for one paper are also a duplicate.
  const byDoi = new Map();
  for (const p of pubs) {
    if (!p.doi) continue;
    const key = normDoi(p.doi);
    if (byDoi.has(key)) problems.push(`publications.yaml: DOI ${p.doi} is on both "${byDoi.get(key)}" and "${p.id}"`);
    else byDoi.set(key, p.id);
  }
  check('Ids are unique', problems, `${pubs.length + grants.length} ids, no duplicates`);
}

// counts
record(
  `Exactly ${EXPECT.inCv} entries have inCv true`,
  inCvPubs.length === EXPECT.inCv ? 'PASS' : 'FAIL',
  `found ${inCvPubs.length}`,
);
{
  const first = inCvPubs.filter((p) => p.role === 'first').length;
  const joint = inCvPubs.filter((p) => p.role === 'joint-first').length;
  record(
    `First + joint-first = ${EXPECT.firstOrJointFirst} (inCv)`,
    first + joint === EXPECT.firstOrJointFirst ? 'PASS' : 'FAIL',
    `first ${first} + joint-first ${joint} = ${first + joint}`,
  );
}

// DOIs and PMIDs are well formed
{
  const problems = [];
  for (const p of pubs) {
    if (p.doi !== undefined && !String(p.doi).startsWith('10.')) problems.push(`${p.id}: doi "${p.doi}" does not start with "10."`);
    if (p.doi !== undefined && /\s/.test(String(p.doi))) problems.push(`${p.id}: doi "${p.doi}" contains whitespace`);
    if (p.pmid !== undefined && !/^\d{1,9}$/.test(String(p.pmid))) problems.push(`${p.id}: pmid "${p.pmid}" is not a number`);
  }
  check('Every doi starts with "10."', problems, `${pubs.filter((p) => p.doi).length} DOIs`);
}

// project references
{
  const problems = [];
  const pubIds = new Set(pubs.map((p) => p.id));
  const grantIds = new Set(grants.map((g) => g.id));
  const files = exists(projectsDir) ? fs.readdirSync(projectsDir).filter((f) => f.endsWith('.md')) : [];
  let refs = 0;
  for (const name of files) {
    const text = fs.readFileSync(path.join(projectsDir, name), 'utf8');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) {
      problems.push(`projects/${name}: no frontmatter`);
      continue;
    }
    let fm;
    try {
      fm = parseYaml(m[1]) ?? {};
    } catch (err) {
      problems.push(`projects/${name}: frontmatter does not parse (${err.message.split('\n')[0]})`);
      continue;
    }
    for (const ref of fm.publications ?? []) {
      refs++;
      const id = typeof ref === 'string' ? ref : ref?.id;
      if (!pubIds.has(id)) problems.push(`projects/${name}: publication "${id}" is not in publications.yaml`);
    }
    if (fm.grant !== undefined) {
      refs++;
      const id = typeof fm.grant === 'string' ? fm.grant : fm.grant?.id;
      if (!grantIds.has(id)) problems.push(`projects/${name}: grant "${id}" is not in grants.yaml`);
    }
  }
  check('Project references resolve', problems, `${files.length} projects, ${refs} references`);
}

// profile metrics
{
  const problems = [];
  if (!exists(profileFile)) problems.push(`${rel(profileFile)} not found`);
  else {
    const src = fs.readFileSync(profileFile, 'utf8');
    const h = src.match(/hIndex:\s*([\d_]+)/);
    const c = src.match(/citations:\s*([\d_]+)/);
    const hIndex = h ? Number(h[1].replace(/_/g, '')) : null;
    const citations = c ? Number(c[1].replace(/_/g, '')) : null;
    if (hIndex !== EXPECT.hIndex) problems.push(`hIndex is ${hIndex}, expected ${EXPECT.hIndex}`);
    if (citations !== EXPECT.citations) problems.push(`citations is ${citations}, expected ${EXPECT.citations}`);
  }
  check('Profile metrics', problems, `hIndex ${EXPECT.hIndex}, citations ${EXPECT.citations}`);
}

// ---------------------------------------------------------------- CV comparison

function parseCv(file) {
  const $ = load(fs.readFileSync(file, 'utf8'));
  const items = [];
  $('ol.pubs > li').each((i, li) => {
    const $li = $(li);
    const $ttl = $li.children('.ttl').first();
    const $jrnl = $li.children('.jrnl').first();
    const $split = $ttl.length ? $ttl : $jrnl;

    // Text before the title is the author list. Mark the owner's name.
    let authorText = '';
    let tailText = '';
    let before = true;
    for (const node of $li.contents().toArray()) {
      if ($split.length && node === $split[0]) {
        before = false;
        continue;
      }
      const $n = $(node);
      const isMe = node.type === 'tag' && $n.hasClass('me');
      const text = isMe ? `\u0001${$n.text()}\u0001` : $n.text();
      if (before) authorText += text;
      else if (!(node.type === 'tag' && ($n.hasClass('jrnl') || $n.hasClass('tag') || $n.hasClass('pmid')))) tailText += ` ${text}`;
    }
    const full = $li.text().replace(/\s+/g, ' ').trim();
    const rawTokens = authorTokens(authorText.replace(/\s+/g, ' ').trim().replace(/\.$/, '').split(/,\s*/));
    const hasAuthors = !/^contributing author/i.test(rawTokens[0] ?? '') && rawTokens.length > 0;
    const tokens = hasAuthors ? rawTokens : [];
    const meIndex = tokens.findIndex((t) => t.includes('\u0001'));
    const meToken = meIndex === -1 ? '' : tokens[meIndex];
    const doi = full.match(/\bdoi:\s*(10\.\S+)/i);
    const pmid = full.match(/\bPMID:\s*(\d+)/i);
    const year = tailText.match(/\b(?:19|20)\d{2}\b/);
    items.push({
      n: i + 1,
      title: $ttl.length ? $ttl.text().replace(/\s+/g, ' ').trim() : null,
      journal: $jrnl.length ? $jrnl.text().replace(/\s+/g, ' ').trim() : null,
      authors: tokens.map((t) => t.replace(/\u0001/g, '')),
      hasAuthors,
      meIndex,
      jointFirst: /\*/.test(meToken),
      doi: doi ? normDoi(doi[1]) : null,
      doiPrinted: doi ? doi[1].replace(/[.,;]+$/, '') : null,
      pmid: pmid ? pmid[1] : null,
      year: year ? Number(year[0]) : null,
      label: full.length > 90 ? `${full.slice(0, 87)}...` : full,
    });
  });
  const metric = (label) => {
    const row = $('.metrics div').filter((_, el) => norm($(el).find('.k').text()).startsWith(norm(label))).first();
    const v = row.find('.v').text().replace(/[,\s]/g, '');
    return /^\d+$/.test(v) ? Number(v) : null;
  };
  return {
    items,
    count: Number(($('.count').first().text().match(/\d+/) ?? [NaN])[0]),
    hIndex: metric('h-index'),
    citations: metric('Citations'),
    firstAuthor: metric('First / joint-first author'),
  };
}

const CV_CHECKS = ['CV: every publication has an entry', 'CV: DOI, PMID and year match', 'CV: author count and owner position match', 'CV: headline numbers match'];

if (!exists(CV_SRC)) {
  console.log(`notice: CV source not found (${CV_SRC}). Skipping the CV comparison. Set CV_SRC to run it.\n`);
  for (const name of CV_CHECKS) record(name, 'SKIP', 'CV_SRC not available');
} else {
  const cv = parseCv(CV_SRC);
  const byTitle = new Map();
  for (const p of pubs) {
    const key = norm(String(p.title).replace(/[*_]/g, ''));
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(p);
  }
  const used = new Map();
  const missing = [];
  const fieldProblems = [];
  const authorProblems = [];
  const pairs = [];

  for (const item of cv.items) {
    // Match on title. Entries with no title (book chapters) match on the book name.
    const keys = [item.title, item.journal].filter(Boolean).map(norm);
    let match = null;
    for (const key of item.title ? keys.slice(0, 1) : keys) {
      match = (byTitle.get(key) ?? []).find((p) => !used.has(p.id)) ?? null;
      if (!match && !item.title) match = pubs.find((p) => !used.has(p.id) && norm(p.journal) === key) ?? null;
      if (match) break;
    }
    if (!match) {
      // Help the reader: is there a near miss on DOI or PMID?
      const near = pubs.find((p) => (item.doi && normDoi(p.doi) === item.doi) || (item.pmid && String(p.pmid) === item.pmid));
      missing.push(`CV #${item.n} not in publications.yaml: ${item.label}${near ? ` (same DOI/PMID as "${near.id}", so the title differs: "${near.title}")` : ''}`);
      continue;
    }
    used.set(match.id, item.n);
    pairs.push([item, match]);
    if (match.inCv === false) missing.push(`CV #${item.n} matches "${match.id}" but that entry has inCv: false`);
  }
  for (const p of inCvPubs) {
    if (!used.has(p.id)) missing.push(`"${p.id}" has inCv true but is not in the CV list: ${p.title}`);
  }

  for (const [item, p] of pairs) {
    const tag = `CV #${item.n} / ${p.id}`;
    if (item.doi && normDoi(p.doi) !== item.doi) fieldProblems.push(`${tag}: DOI is ${p.doi ?? '(none)'}, CV prints ${item.doiPrinted}`);
    if (item.pmid && String(p.pmid ?? '') !== item.pmid) fieldProblems.push(`${tag}: PMID is ${p.pmid ?? '(none)'}, CV prints ${item.pmid}`);
    if (item.year === null) fieldProblems.push(`${tag}: could not read a year from the CV entry`);
    else if (p.year !== item.year) fieldProblems.push(`${tag}: year is ${p.year}, CV prints ${item.year}`);

    if (!item.hasAuthors) continue; // "Contributing author." has no list to compare
    const tokens = authorTokens(p.authors ?? []);
    const named = (list) => list.filter((t) => !ELLIPSIS.test(t)).length;
    if (tokens.length !== item.authors.length || named(tokens) !== named(item.authors)) {
      authorProblems.push(`${tag}: ${named(tokens)} named authors (${tokens.length} items), CV prints ${named(item.authors)} (${item.authors.length} items)`);
    }
    const mine = tokens.findIndex(isOwner);
    if (mine !== item.meIndex) {
      const pos = (i) => (i === -1 ? 'not listed' : `position ${i + 1}`);
      authorProblems.push(`${tag}: owner is ${pos(mine)}, CV has ${pos(item.meIndex)}`);
    }
    const role = item.jointFirst ? 'joint-first' : item.meIndex === 0 ? 'first' : 'middle';
    if (p.role !== role) authorProblems.push(`${tag}: role is "${p.role}", CV implies "${role}"`);
  }

  const cvCountNote = cv.items.length ? [] : [`no <li> found under ol.pubs in ${CV_SRC}`];
  check(CV_CHECKS[0], [...cvCountNote, ...missing], `${pairs.length} of ${cv.items.length} CV publications matched`);
  check(CV_CHECKS[1], fieldProblems, `${pairs.length} entries compared`);
  check(CV_CHECKS[2], authorProblems, `${pairs.filter(([i]) => i.hasAuthors).length} author lists compared`);

  const headline = [];
  const cvFirst = cv.items.filter((i) => i.jointFirst || i.meIndex === 0).length;
  if (cv.items.length !== EXPECT.inCv) headline.push(`CV lists ${cv.items.length} publications, this audit expects ${EXPECT.inCv}`);
  if (Number.isFinite(cv.count) && cv.count !== cv.items.length) headline.push(`CV heading says ${cv.count} items but lists ${cv.items.length}`);
  if (cv.hIndex !== null && cv.hIndex !== EXPECT.hIndex) headline.push(`CV h-index is ${cv.hIndex}, this audit expects ${EXPECT.hIndex}`);
  if (cv.citations !== null && cv.citations !== EXPECT.citations) headline.push(`CV citations are ${cv.citations}, this audit expects ${EXPECT.citations}`);
  if (cv.firstAuthor !== null && cv.firstAuthor !== EXPECT.firstOrJointFirst) headline.push(`CV first/joint-first is ${cv.firstAuthor}, this audit expects ${EXPECT.firstOrJointFirst}`);
  if (cvFirst !== EXPECT.firstOrJointFirst) headline.push(`CV author lists give ${cvFirst} first or joint-first papers, expected ${EXPECT.firstOrJointFirst}`);
  check(CV_CHECKS[3], headline, `${cv.items.length} items, h-index ${cv.hIndex}, ${cv.citations} citations, ${cvFirst} first or joint-first`);
}

// ---------------------------------------------------------------- built site

const DIST_CHECKS = ['Site: key numbers appear', 'Site: publications page lists every inCv DOI', 'Site: no placeholder text'];

/** Text a visitor can see or that search engines show. */
function visibleText(html) {
  const $ = load(html);
  const meta = [
    $('title').first().text(),
    $('meta[name="description"]').attr('content') ?? '',
    $('meta[property="og:title"]').attr('content') ?? '',
    $('meta[property="og:description"]').attr('content') ?? '',
    ...$('[alt]').map((_, el) => $(el).attr('alt')).get(),
    ...$('[title]').map((_, el) => $(el).attr('title')).get(),
    ...$('[aria-label]').map((_, el) => $(el).attr('aria-label')).get(),
  ];
  $('script, style, noscript, template, svg, head').remove();
  // Keep words in neighboring blocks apart.
  $('br, p, li, div, h1, h2, h3, h4, h5, h6, td, th, dt, dd, section, article, header, footer, nav').each((_, el) => {
    $(el).append(' ');
  });
  return `${meta.join(' \n ')} \n ${$('body').text()}`.replace(/[ \t ]+/g, ' ');
}

if (flag('--no-dist') || !exists(DIST)) {
  if (!flag('--no-dist')) console.log(`notice: ${rel(DIST)} not found. Skipping the built-site checks. Run \`npm run build\` first.\n`);
  for (const name of DIST_CHECKS) record(name, 'SKIP', flag('--no-dist') ? '--no-dist' : 'no build output');
} else {
  const htmlFiles = walk(DIST).filter((f) => /\.html?$/i.test(f));
  const pages = htmlFiles.map((file) => ({ file, rel: path.relative(DIST, file), html: fs.readFileSync(file, 'utf8') }));
  for (const p of pages) p.text = visibleText(p.html);

  // key numbers
  {
    const problems = [];
    const found = [];
    for (const s of EXPECT.siteStrings) {
      const hit = pages.find((p) => p.text.includes(s));
      if (hit) found.push(`"${s}" on ${hit.rel}`);
      else problems.push(`"${s}" does not appear on any page`);
    }
    check(DIST_CHECKS[0], problems, found.join('; '));
  }

  // DOIs on the publications page
  {
    const problems = [];
    const page = pages.find((p) => p.rel.split(path.sep).join('/') === 'publications/index.html');
    const withDoi = inCvPubs.filter((p) => p.doi);
    if (!page) problems.push('dist/publications/index.html not found');
    else {
      let decoded = page.html;
      try {
        decoded = decodeURIComponent(page.html.replace(/%(?![0-9a-f]{2})/gi, '%25'));
      } catch {
        // keep the raw HTML
      }
      const haystack = `${page.html}\n${decoded}`.toLowerCase().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      for (const p of withDoi) {
        if (!haystack.includes(normDoi(p.doi))) problems.push(`${p.id}: DOI ${p.doi} is not on the publications page`);
      }
    }
    check(DIST_CHECKS[1], problems, `${withDoi.length} DOIs found`);
  }

  // placeholders
  {
    const problems = [];
    for (const p of pages) {
      for (const [label, re] of EXPECT.placeholders) {
        const m = p.text.match(re);
        if (!m) continue;
        const at = m.index;
        const context = p.text.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, ' ').trim();
        problems.push(`${p.rel}: "${label}" in visible text: ...${context}...`);
      }
    }
    check(DIST_CHECKS[2], problems, `${pages.length} pages clean`);
  }
}

// ---------------------------------------------------------------- report

const width = Math.max(...results.map((r) => r.name.length), 5);
console.log(`${'Check'.padEnd(width)}  Result  Detail`);
console.log(`${'-'.repeat(width)}  ------  ------`);
for (const r of results) console.log(`${r.name.padEnd(width)}  ${r.status.padEnd(6)}  ${r.summary}`);

const failed = results.filter((r) => r.status === 'FAIL');
for (const r of failed) {
  if (!r.details.length) continue;
  console.log(`\n${r.name}:`);
  const shown = VERBOSE ? r.details : r.details.slice(0, 12);
  for (const d of shown) console.log(`  - ${d}`);
  if (shown.length < r.details.length) console.log(`  ... ${r.details.length - shown.length} more (use --verbose)`);
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
process.exit(failed.length ? 1 : 0);
