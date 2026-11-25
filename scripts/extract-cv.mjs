#!/usr/bin/env node
/**
 * Extract structured data from the CV (cv.html) into:
 *   src/data/publications.yaml, src/data/grants.yaml, src/data/cv.yaml
 *
 * Usage:
 *   node scripts/extract-cv.mjs            # write the three files
 *   node scripts/extract-cv.mjs --dry-run  # print a summary, write nothing
 *   node scripts/extract-cv.mjs --fresh    # ignore what is already in publications.yaml
 *   CV_SRC=/path/to/cv.html node scripts/extract-cv.mjs
 *
 * Re-running is safe: for publications already in publications.yaml, a doi,
 * pmid or url that the CV does not print is carried over (so enrichment from
 * scripts/enrich-pubs.mjs survives), and entries that are not in the CV list
 * (added by hand or by scripts/add-pub.mjs) are kept. Comments in
 * publications.yaml are not kept.
 *
 * SANITIZED BY DESIGN: only the sections named in SECTIONS are read. The
 * masthead (phone, address), the Profile paragraphs and the References
 * section (div.refs) are removed from the DOM before anything is extracted,
 * and the output is checked again before it is written.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';
import YAML from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SRC =
  '/Users/semiquant/Library/Mobile Documents/com~apple~CloudDocs/Work/CV/MyCV/2026/cv.html';

/* ------------------------------------------------------------------ */
/* Hand-maintained tables                                              */
/* ------------------------------------------------------------------ */

/** Tag vocabulary. A tag is applied when its pattern matches "title | journal". */
export const TAG_RULES = [
  ['methods', /\b(method|assay|approach|workflow|extraction|circularization|enumeration|stilPCR|bead beat\w*|challenge model|cell lysis)\b|J Vis Exp/i],
  ['diagnostics', /\b(diagnos\w*|Xpert|Deeplex|resistance (detection|testing)|detection of|IRISA-TB|define susceptibility)\b/i],
  ['drug-resistance', /resist|bedaquiline|linezolid|delamanid|untreatable|incurable|pyrazinamide/i],
  ['genomics', /genom|sequencing|Deeplex|amplicon|genetic variants|genotyp|\bNGS\b/i],
  ['transcriptomics', /\bRNAs?\b|transcript/i],
  ['hardware', /turboLysis|cartridge|bead beaters/i],
  ['clinical', /\b(patients|persons|cohort|prospective|regimen|outcomes|Commission|view from the field|human lung)\b/i],
  ['immunology', /IFN|immun|monocyte|lysosome|inflammatory|microbiota/i],
  ['transmission', /aerosol|infectiousness|transmission/i],
  ['bioinformatics', /primerJinn|URAdime|pipeline|in silico|a tool for/i],
  ['covid', /SARS-CoV-2|COVID/i],
];
export const TAGS = TAG_RULES.map(([t]) => t);

/**
 * Publication ids are <first-author-surname>-<year>-<keyword>. The keyword is
 * the first match here (tested against the plain title). These ids are a
 * contract with the content files: do not rename them.
 */
const PUB_KEYWORDS = [
  [/GenoScreen Deeplex/i, 'deeplex'],
  [/Impaired IFN/i, 'ifng'],
  [/Xpert MTB\/RIF Ultra-tested/i, 'bedaquiline'],
  [/^CountFU/i, 'countfu'],
  [/bead beating in custom buffer/i, 'beadbeating-jove'],
  [/Beating the gold standard/i, 'beadbeating-review'],
  [/Matrix-based DNA extraction/i, 'matrix-extraction'],
  [/^URAdime/i, 'uradime'],
  [/^spotPCR/i, 'spotpcr'],
  [/^stilPCR/i, 'stilpcr'],
  [/^Cartridge-based sequencing/i, 'cartridge'],
  [/^turboLysis/i, 'turbolysis'],
  [/lysosome-poor/i, 'lysosome-poor'],
  [/viable SARS-CoV-2/i, 'sars-cov-2-bioaerosols'],
  [/^primerJinn/i, 'primerjinn'],
  [/retrospective longitudinal cohort/i, 'bedaquiline'],
  [/^selSeq/i, 'selseq'],
  [/single-tube overlapping amplicon/i, 'hisspcr'],
  [/^Circularization of rv0678/i, 'rv0678'],
  [/Updating the approaches/i, 'susceptibility'],
  [/pyrazinamide resistance/i, 'pyrazinamide'],
  [/Genetic variants and their association/i, 'bedaquiline-variants'],
  [/gut microbiota/i, 'gut-microbiota'],
  [/^Textbook of Tuberculosis/i, 'textbook'],
  [/^pipeline-umi-amplicon/i, 'pipeline-umi-amplicon'],
  [/cough aerosol culture positivity/i, 'cough-aerosol'],
  [/RD-1-specific/i, 'rd1-ifng'],
  [/human lung challenge model/i, 'lung-challenge'],
  [/landscape of genomic alterations/i, 'genomic-landscape'],
  [/bedaquiline and delamanid/i, 'bedaquiline-delamanid'],
  [/pleural tuberculosis/i, 'pleural-tb'],
  [/Respiratory Medicine Commission/i, 'lancet-commission'],
  [/Linezolid interruption/i, 'linezolid'],
  [/Long-term bedaquiline-related/i, 'bedaquiline-outcomes'],
  [/^Outcomes, infectiousness/i, 'xdr-outcomes'],
  [/Selected questions and controversies/i, 'bedaquiline-controversies'],
  [/Xpert MTB\/RIF results in patients with previous/i, 'xpert-previous-tb'],
];

const FEATURED = new Set([
  'limberis-2025-countfu',
  'limberis-2024-turbolysis',
  'limberis-2024-stilpcr',
  'limberis-2023-primerjinn',
  'theron-2020-cough-aerosol',
  'dheda-2017-xdr-outcomes',
]);

/** Grant ids, matched against the project title. Also a contract. */
const GRANT_IDS = [
  [/cartridge-based sequencing solution/i, 'nih-xpertnano'],
  [/^turboLysis/i, 'gates-turbolysis'],
  [/TSELiOT/i, 'nih-tseliot'],
  [/dual single-cell RNA sequencing/i, 'pbbr-dual-scrnaseq'],
  [/determinants of infectiousness/i, 'nih-infectiousness'],
  [/incurable tuberculosis in the Western Cape/i, 'oppenheimer-incurable-tb'],
  [/^TESA networks/i, 'edctp-tesa'],
];
/**
 * Role labels for projects whose role text does not start with a short label.
 * Worded from the role text itself ("Developing the DNA extraction methods ...").
 */
const GRANT_ROLE_FALLBACK = { 'nih-tseliot': 'DNA extraction method development' };

/**
 * Citations the CV prints incompletely, completed from the published record
 * (PubMed and Crossref agree). Applied only when the CV still prints the
 * short form on the left.
 */
const CITATION_FIXES = {
  'limberis-2023-primerjinn': ['24(1)', '24(1):468'],
  'limberis-2023-rv0678': ['e0412722', '11(2):e0412722'],
};

const EXPERIENCE_IDS = [
  [/University of California, San Francisco/i, 'ucsf'],
  [/Centre for Lung Infection and Immunity/i, 'uct-lung-institute'],
  [/Centre for Genomic Regulation/i, 'crg'],
  [/Cereal Genomics/i, 'stellenbosch-cereal-genomics'],
];
const EDUCATION_IDS = [
  [/^PhD/i, 'phd'],
  [/^BSc Honours/i, 'bsc-honours'],
  [/^BSc,/i, 'bsc'],
];

const OWNER = /^Limberis\s+JD?$/;
/** Sections that may be read. Everything else in cv.html is ignored. */
const SECTIONS = [
  'Work Experience', 'Education', 'Skills', 'Awards', 'Certificates & Training',
  'Major Projects', 'Publications', 'Patents', 'Novel Protocols',
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const stripDot = (s) => s.replace(/\.$/, '');
export const slug = (s) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pick = (table, text, fallback) => (table.find(([re]) => re.test(text)) ?? [])[1] ?? fallback;

export function tagsFor(title, journal = '') {
  const hay = `${title.replace(/\*/g, '')} | ${journal}`;
  return TAG_RULES.filter(([, re]) => re.test(hay)).map(([t]) => t);
}

/** Split a printed author list into array items, keeping "et al." and "…". */
export function splitAuthors(text) {
  const out = [];
  for (let part of clean(text).replace(/\.$/, '').split(/,\s*/)) {
    part = part.trim();
    if (!part) continue;
    if (/^et al\.?$/i.test(part)) { out.push('et al.'); continue; }
    const m = part.match(/^(…|\.\.\.)\s*(.*)$/);
    if (m) { out.push('…'); if (m[2]) out.push(m[2]); continue; }
    out.push(part);
  }
  return out;
}

function sectionByHeading($, name) {
  const h2 = $('h2').filter((_, el) => {
    const $h = $(el).clone();
    $h.find('span').remove();
    return clean($h.text()).toLowerCase() === name.toLowerCase();
  }).first();
  if (!h2.length) throw new Error(`Section not found in CV: "${name}"`);
  return h2.closest('section');
}

/* ------------------------------------------------------------------ */
/* Publications                                                        */
/* ------------------------------------------------------------------ */

function parsePublication($, li) {
  const $li = $(li);
  const $ttl = $li.children('span.ttl').first();
  const $topJrnl = $li.children('span.jrnl'); // journal spans outside the title
  const hasTitle = $ttl.length > 0;

  // Authors: everything before the title (or before the book title).
  const stop = hasTitle ? $ttl[0] : $topJrnl[0];
  let authorText = '';
  for (const node of $li.contents().toArray()) {
    if (node === stop) break;
    authorText += $(node).text();
  }
  const rawAuthors = splitAuthors(authorText);
  const ownerRaw = clean($li.children('span.me').first().text());
  const authors = rawAuthors.map((a) => a.replace(/\*+$/, '').trim());
  const ownerIdx = authors.findIndex((a) => OWNER.test(a));
  const starred = ownerIdx >= 0 && /\*$/.test(rawAuthors[ownerIdx]);
  const jointMark = new RegExp(`${ownerRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*`).test(authorText);
  const role = starred || (ownerRaw && jointMark) ? 'joint-first' : ownerIdx === 0 ? 'first' : 'middle';

  // Title: italic spans become *markdown*; one trailing period is dropped.
  let title;
  if (hasTitle) {
    const $t = $ttl.clone();
    $t.find('span.jrnl, em').each((_, el) => { $(el).replaceWith(`*${clean($(el).text())}*`); });
    title = stripDot(clean($t.text()));
  } else {
    title = stripDot(clean($topJrnl.first().text()));
  }

  // Journal: the last .jrnl outside the title (the first one is the book title when there is no .ttl).
  const $journal = hasTitle ? $topJrnl.last() : $();
  const journal = $journal.length ? stripDot(clean($journal.text())) : undefined;

  // Free text after the title / journal: "year;vol:pages. doi:... " or "Publisher; year."
  const $rest = $li.clone();
  $rest.children('span.ttl, span.jrnl, span.me, span.pmid, span.tag').remove();
  let tail = '';
  let seen = false;
  for (const node of $li.contents().toArray()) {
    if (node === ($journal[0] ?? stop)) { seen = true; continue; }
    if (!seen) continue;
    if (node.type === 'text') tail += $(node).text();
  }
  tail = clean(tail);

  const doi = (tail.match(/doi:\s*(10\.\S+)/i)?.[1] ?? '').replace(/[.,;]+$/, '') || undefined;
  const pmid = clean($li.children('span.pmid').text()).match(/\d+/)?.[0];
  const tag = clean($li.children('span.tag').text()).toLowerCase();
  const beforeDoi = tail.replace(/\s*doi:.*$/i, '');
  const ym = beforeDoi.match(/(?:^|\s)((?:19|20)\d{2})(?:[;:]\s*([^\s]+?))?\.(?:\s|$)/) ?? beforeDoi.match(/((?:19|20)\d{2})/);
  if (!ym) throw new Error(`No year found for: ${title}`);
  const year = Number(ym[1]);
  const citation = ym[2] || undefined;
  const bare = tail.match(/(?:^|\s)((?:github\.com|gitlab\.com)\/\S+)/i)?.[1];
  const url = !doi && !pmid && bare ? `https://${bare.replace(/[.,;]+$/, '')}` : undefined;
  // Book chapter: "Publisher; year." Keep the publisher where a journal would go.
  const publisher = !hasTitle ? clean(beforeDoi.replace(/;?\s*(19|20)\d{2}\.?$/, '')) || undefined : undefined;

  let type = 'article';
  if (!hasTitle) type = 'chapter';
  else if (tag === 'software' || /^pipeline-umi-amplicon/i.test(title)) type = 'software';
  else if (tag === 'preprint' || /^(bio|med)Rxiv$/i.test(journal ?? '')) type = 'preprint';

  const plain = title.replace(/\*/g, '');
  const surname = /^contributing author$/i.test(authors[0])
    ? 'limberis'
    : slug(authors[0].replace(/\s+[A-Z]{1,3}$/, ''));
  const keyword = pick(PUB_KEYWORDS, plain, slug(plain.split(/[:.,]/)[0]).split('-').slice(0, 3).join('-'));
  const id = `${surname}-${year}-${keyword}`;

  const pub = { id, type, title, authors, role };
  if (journal ?? publisher) pub.journal = journal ?? publisher;
  pub.year = year;
  const fix = CITATION_FIXES[id];
  const cite = fix && citation === fix[0] ? fix[1] : citation;
  if (cite) pub.citation = cite;
  if (doi) pub.doi = doi;
  if (pmid) pub.pmid = pmid;
  if (url) pub.url = url;
  pub.tags = tagsFor(title, journal);
  if (FEATURED.has(id)) pub.featured = true;
  return pub;
}

export function extractPublications($) {
  const $sec = sectionByHeading($, 'Publications');
  return $sec.find('ol.pubs > li').toArray().map((li) => parsePublication($, li));
}

/** Field order used in publications.yaml. */
export const PUB_FIELDS = ['id', 'type', 'title', 'authors', 'role', 'journal', 'year', 'citation', 'doi', 'pmid', 'url', 'tags', 'featured', 'inCv'];

/** One publication as a YAML list item (block style, authors and tags inline). */
export function publicationToYaml(pub) {
  const ordered = {};
  for (const k of PUB_FIELDS) if (pub[k] !== undefined) ordered[k] = pub[k];
  for (const k of Object.keys(pub)) if (!(k in ordered)) ordered[k] = pub[k];
  const doc = new YAML.Document([ordered]);
  YAML.visit(doc, {
    Pair(_, pair) {
      if (['authors', 'tags'].includes(pair.key?.value) && YAML.isSeq(pair.value)) pair.value.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

const PUB_HEADER = `# Publications. Generated from the CV by scripts/extract-cv.mjs, then checked
# against Crossref and PubMed by scripts/enrich-pubs.mjs.
# Add a paper with: node scripts/add-pub.mjs <doi>
# Titles are verbatim; *asterisks* mark italics (species and gene names).
# ids are referenced from src/content: do not rename them.
`;

function mergeExisting(pubs, existing) {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const cvIds = new Set(pubs.map((p) => p.id));
  const carried = [];
  for (const pub of pubs) {
    const old = byId.get(pub.id);
    if (!old) continue;
    for (const k of ['doi', 'pmid']) {
      if (pub[k] === undefined && old[k] !== undefined) { pub[k] = String(old[k]); carried.push(`${pub.id}.${k}`); }
    }
    if (pub.url === undefined && old.url !== undefined && !pub.doi && !pub.pmid) pub.url = old.url;
  }
  const firstCv = existing.findIndex((p) => cvIds.has(p.id));
  const top = [];
  const bottom = [];
  existing.forEach((p, i) => {
    if (cvIds.has(p.id)) return;
    (firstCv >= 0 && i < firstCv ? top : bottom).push(p);
  });
  return { merged: [...top, ...pubs, ...bottom], carried, kept: [...top, ...bottom].map((p) => p.id) };
}

/* ------------------------------------------------------------------ */
/* Grants (Major Projects)                                             */
/* ------------------------------------------------------------------ */

export function extractGrants($) {
  return sectionByHeading($, 'Major Projects').find('div.project').toArray().map((el) => {
    const $p = $(el);
    const title = clean($p.find('h3').text());
    const meta = clean($p.find('p.meta').text());
    const mm = meta.match(/^(\d{4})\s*[–-]\s*(\d{4})\s*·\s*(.+)$/);
    if (!mm) throw new Error(`Cannot parse project meta: ${meta}`);
    const $r = $p.find('p.rolep').clone();
    $r.find('span.lbl').remove();
    const text = clean($r.text());
    const id = pick(GRANT_IDS, title, slug(title).split('-').slice(0, 4).join('-'));
    const first = text.match(/^(.+?)\.\s+(.*)$/s);
    let role;
    let summary;
    if (first && first[1].split(' ').length <= 6 && /lead|manage/i.test(first[1])) {
      role = first[1];
      summary = first[2];
    } else {
      role = GRANT_ROLE_FALLBACK[id];
      summary = text;
      if (!role) throw new Error(`No short role label for project "${title}". Add one to GRANT_ROLE_FALLBACK.`);
    }
    return { id, title, funder: mm[3], start: Number(mm[1]), end: Number(mm[2]), role, summary };
  });
}

/* ------------------------------------------------------------------ */
/* CV sections                                                         */
/* ------------------------------------------------------------------ */

function entries($, heading) {
  return sectionByHeading($, heading).find('div.entry').toArray().map((el) => $(el));
}
const span = (when) => {
  const [start, end] = clean(when).split(/\s*[–-]\s*/);
  return { start, end: end ?? start };
};

export function extractCv($) {
  const experience = entries($, 'Work Experience').map(($e) => {
    const org = clean($e.find('p.org').text());
    const item = {
      id: pick(EXPERIENCE_IDS, org, slug(org).split('-').slice(0, 4).join('-')),
      role: clean($e.find('p.role').text()),
      org,
      place: clean($e.find('span.where').text()),
      ...span($e.find('span.when').text()),
    };
    const points = $e.find('ul.points > li').toArray().map((li) => clean($(li).text()));
    if (points.length) item.points = points;
    return item;
  });

  const education = entries($, 'Education').map(($e) => {
    const degree = clean($e.find('p.role').text());
    const item = {
      id: pick(EDUCATION_IDS, degree, slug(degree)),
      degree,
      org: clean($e.find('p.org').text()),
      place: clean($e.find('span.where').text()),
      ...span($e.find('span.when').text()),
    };
    const note = clean($e.find('p.note').text());
    if (note) item.note = note;
    return item;
  });

  const skills = sectionByHeading($, 'Skills').find('div.skillgroup').toArray().map((el) => {
    const label = clean($(el).find('.skilllabel').text());
    const $b = $(el).find('p.skillbody').clone();
    $b.find('br').replaceWith('\n');
    const body = $b.text().split('\n').map(clean).filter(Boolean).join('\n');
    return { id: slug(label), label, body };
  });

  const awards = entries($, 'Awards').map(($e) => {
    const title = clean($e.find('p.role').text());
    const year = Number(clean($e.find('span.when').text()));
    return { id: `${slug(title)}-${year}`, year, title, org: clean($e.find('p.org').text()) };
  });

  const seen = new Set();
  const training = sectionByHeading($, 'Certificates & Training').find('div.cert').toArray().map((el) => {
    const title = clean($(el).find('p.ct').text());
    let id = slug(title);
    if (seen.has(id)) id = `${id}-${slug(clean($(el).find('p.cm').text()).split(',')[0])}`;
    seen.add(id);
    return { id, title, provider: clean($(el).find('p.cm').text()) };
  });

  const patents = entries($, 'Patents').map(($e) => {
    const descs = $e.find('p.item-desc').toArray().map((p) => clean($(p).text()));
    const [inventors, ...restFirst] = descs[0].split(/\.\s+/);
    const year = Number(clean($e.find('span.when').text()));
    const title = clean($e.find('p.item-title').text());
    const item = {
      id: `${slug(title).split('-').slice(-3).join('-')}-${year}`,
      year,
      status: clean($e.find('span.where').text()),
      title,
      inventors,
      detail: [restFirst.join('. '), ...descs.slice(1)].filter(Boolean).join(' '),
    };
    const href = $e.find('a.url').attr('href');
    if (href) item.url = href;
    return item;
  });

  const protocols = entries($, 'Novel Protocols').map(($e) => {
    const descs = $e.find('p.item-desc').toArray().map((p) => clean($(p).text()));
    const name = clean($e.find('span.when').text());
    const item = { id: slug(name), name, description: descs[0], authors: stripDot(descs[1] ?? '') };
    const href = $e.find('a.url').attr('href');
    if (href) item.url = href;
    return item;
  });

  return { experience, education, skills, awards, training, patents, protocols };
}

/* ------------------------------------------------------------------ */
/* Load, sanitize, write                                               */
/* ------------------------------------------------------------------ */

export function loadCv(src = process.env.CV_SRC || DEFAULT_SRC) {
  const $ = cheerio.load(readFileSync(src, 'utf8'));
  // Sanitize before anything is read: contact block, profile, references.
  $('header, .masthead, .contact, section.profile, .refs, .ref, script, style').remove();
  $('section').each((_, el) => {
    const $h = $(el).children('h2').first().clone();
    $h.find('span').remove();
    const name = clean($h.text());
    if (!SECTIONS.some((s) => s.toLowerCase() === name.toLowerCase())) $(el).remove();
  });
  return $;
}

/** Last line of defense: refuse to write anything that looks private. */
function assertClean(name, text) {
  const problems = [];
  const emails = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).filter((e) => e.toLowerCase() !== 'jasonlimberis@gmail.com');
  if (emails.length) problems.push(`email address (${emails.length})`);
  if (/\+\d[\d\s().-]{8,}\d/.test(text) || /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(text)) problems.push('phone-like number');
  if (new RegExp('Claude' + ' Code', 'i').test(text)) problems.push('job-application profile text');
  if (text.includes(String.fromCharCode(0x2014))) problems.push('em dash');
  if (problems.length) throw new Error(`Refusing to write ${name}: found ${problems.join(', ')}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const dry = args.has('--dry-run');
  const $ = loadCv();

  const pubs = extractPublications($);
  const grants = extractGrants($);
  const cv = extractCv($);

  const ids = pubs.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`Duplicate publication ids: ${dupes.join(', ')}`);

  const pubPath = resolve(ROOT, 'src/data/publications.yaml');
  let existing = [];
  if (!args.has('--fresh') && existsSync(pubPath)) {
    const parsed = YAML.parse(readFileSync(pubPath, 'utf8'));
    if (Array.isArray(parsed)) existing = parsed;
  }
  const { merged, carried, kept } = mergeExisting(pubs, existing);

  const out = {
    'src/data/publications.yaml': PUB_HEADER + '\n' + merged.map(publicationToYaml).join('\n'),
    'src/data/grants.yaml':
      '# Major projects and funding. Generated from the CV by scripts/extract-cv.mjs.\n\n' +
      grants.map((g) => YAML.stringify([g], { lineWidth: 0 })).join('\n'),
    'src/data/cv.yaml':
      '# CV sections. Generated from the CV by scripts/extract-cv.mjs. Edit the CV, then re-run.\n\n' +
      Object.entries(cv).map(([k, v]) => YAML.stringify({ [k]: v }, { lineWidth: 0 })).join('\n'),
  };

  for (const [rel, text] of Object.entries(out)) {
    assertClean(rel, text);
    if (!dry) writeFileSync(resolve(ROOT, rel), text);
  }

  const n = (r) => pubs.filter((p) => p.role === r).length;
  console.log(`${dry ? '[dry run] ' : ''}publications: ${merged.length} (${pubs.length} from the CV; first ${n('first')}, joint-first ${n('joint-first')}, middle ${n('middle')})`);
  if (carried.length) console.log(`  kept from existing file: ${carried.join(', ')}`);
  if (kept.length) console.log(`  kept entries not in the CV list: ${kept.join(', ')}`);
  console.log(`grants: ${grants.length}`);
  console.log(Object.entries(cv).map(([k, v]) => `${k}: ${v.length}`).join(', '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
