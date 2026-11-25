#!/usr/bin/env node
// Copy lint: `node scripts/lint-copy.mjs`.
//
// Flags, in src/content, src/pages, src/components, src/layouts, src/data and
// (when built) the visible text of dist/**/*.html:
//   - em dashes (U+2014, &mdash;) and " -- "
//   - British spellings
//   - filler phrases
//
//   --root <dir>      project root (default: the parent of scripts/)
//   --dist <dir>      build output (default: <root>/dist; skipped when absent)
//   --no-dist         lint sources only
//   --verbose         also print the allowlist
//
// Allowed without a comment (they stay verbatim):
//   - publication titles and journal names from src/data/publications.yaml
//   - proper names from the data files (grant titles and funders, organizations,
//     awards, courses, patents) and the PROPER_NAMES list below
//   - URLs, `inline code`, sibling project names (reservedPaths) and project slugs
//
// Inline allow comments, for anything else that is right as written:
//   some text  # lint-allow              (whole line; any comment syntax works)
//   some text  <!-- lint-allow: grey --> (only the listed words)
//   {/* lint-allow-next-line */}         (the line after)
// A spelling or phrase allowed this way in a source file is also accepted in the
// built HTML. For an em dash that must survive into the built page, put
// data-lint-allow on the element that holds it.

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

const SOURCE_DIRS = ['src/content', 'src/pages', 'src/components', 'src/layouts', 'src/data'];
const SOURCE_EXT = new Set(['.md', '.mdx', '.astro', '.yaml', '.yml', '.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.txt', '.svg']);

// Proper names that keep their spelling wherever they appear.
const PROPER_NAMES = [
  'Novartis-CRG mobility programme',
  'Centre for Lung Infection and Immunity',
  'Centre for Genomic Regulation',
  'who-catalogue-tool',
  'WHO TB catalogue',
  'WHO catalogue',
];

// ---------------------------------------------------------------- rules

// [pattern, American spelling]. Patterns are matched whole-word, case-insensitive.
const BRITISH = [
  ['colour\\w*', 'color'],
  ['behaviour\\w*', 'behavior'],
  ['favour\\w*', 'favor'],
  ['honour\\w*', 'honor'],
  ['labour\\w*', 'labor'],
  ['neighbour\\w*', 'neighbor'],
  ['humour\\w*', 'humor'],
  ['rumour\\w*', 'rumor'],
  ['vapour\\w*', 'vapor'],
  ['odour\\w*', 'odor'],
  ['flavour\\w*', 'flavor'],
  ['rigour', 'rigor'],
  ['endeavour\\w*', 'endeavor'],
  ['tumour\\w*', 'tumor'],
  ['harbour\\w*', 'harbor'],
  ['analys(?:e|ed|ing|er|ers)', 'analyze'],
  ['catalys(?:e|ed|ing)', 'catalyze'],
  ['hydrolys(?:e|ed|ing)', 'hydrolyze'],
  ['paralys(?:e|ed|ing)', 'paralyze'],
  ['\\w+isation\\w*', '-ization'],
  ['\\w*(?:optim|organ|util|recogn|character|standard|normal|visual|minim|maxim|summar|priorit|special|general|categor|custom|digit|real|final|central|local|global|commercial|steril|immun|random|synchron|harmon|hypothes|synthes|emphas|critic|apolog|author|capital|modern|stabil|neutral|initial|personal|familiar|quantit|parallel|polymer|crystall|solubil|homogen|linear|ion|oxid|sensit|vapor|penal|subsid|mobil|rational|formal|external|visual|memor|monet|public|serial)is(?:e|es|ed|ing|er|ers)', '-ize'],
  ['programmes?', 'program'],
  ['centre(?:s|d)?', 'center'],
  ['centring', 'centering'],
  ['(?:milli|centi|kilo|micro|nano)?metres?', 'meter'],
  ['(?:milli|micro)?litres?', 'liter'],
  ['fibres?', 'fiber'],
  ['theatres?', 'theater'],
  ['calibre', 'caliber'],
  ['catalogue(?:s|d)?', 'catalog'],
  ['cataloguing', 'cataloging'],
  ['analogues?', 'analog'],
  ['whilst', 'while'],
  ['amongst', 'among'],
  ['grey\\w*', 'gray'],
  ['licence[sd]?', 'license'],
  ['modell(?:ing|ed|er|ers)', 'modeling'],
  ['labell(?:ing|ed|er)', 'labeling'],
  ['travell(?:ing|ed|er|ers)', 'traveling'],
  ['cancell(?:ing|ed)', 'canceling'],
  ['fuell(?:ing|ed)', 'fueling'],
  ['channell(?:ing|ed)', 'channeling'],
  ['signall(?:ing|ed)', 'signaling'],
  ['levell(?:ing|ed)', 'leveling'],
  ['defence\\w*', 'defense'],
  ['offence\\w*', 'offense'],
  ['pretence', 'pretense'],
  ['practis(?:e|ed|es|ing)', 'practice'],
  ['haem(?:oglobin|atolog|orrhag|olys|olyt)\\w*', 'hem-'],
  ['anaemi\\w+', 'anemia'],
  ['leukaemi\\w+', 'leukemia'],
  ['paediatric\\w*', 'pediatric'],
  ['oesophag\\w+', 'esophag-'],
  ['oedema\\w*', 'edema'],
  ['diarrhoea\\w*', 'diarrhea'],
  ['foet(?:al|us)', 'fetal'],
  ['aetiolog\\w+', 'etiology'],
  ['faec(?:es|al)', 'feces'],
  ['sulph\\w+', 'sulf-'],
  ['aluminium', 'aluminum'],
  ['ageing', 'aging'],
  ['artefact\\w*', 'artifact'],
  ['judgement\\w*', 'judgment'],
  ['enrolment\\w*', 'enrollment'],
  ['fulfil', 'fulfill'],
  ['fulfilment', 'fulfillment'],
  ['skilful\\w*', 'skillful'],
  ['learnt', 'learned'],
  ['sceptic\\w*', 'skeptic'],
  ['mould\\w*', 'mold'],
  ['plough\\w*', 'plow'],
  ['tyres?', 'tire'],
  ['cheques?', 'check'],
  ['manoeuvr\\w+', 'maneuver'],
  ['cosy', 'cozy'],
  ['per cent', 'percent'],
  ['speciality', 'specialty'],
  ['orientated', 'oriented'],
  ['maths', 'math'],
].map(([pattern, us]) => ({ re: new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-])`, 'gi'), us }));

const FILLER = [
  "I(?:'|’)d be happy to",
  "I(?:'|’)m (?:excited|thrilled|delighted) to",
  'cutting[- ]edge',
  'state[- ]of[- ]the[- ]art',
  'passionate\\w*',
  'leverag(?:e|es|ed|ing)',
  'delv(?:e|es|ed|ing)',
  'seamless\\w*',
  'revolutioni[sz]\\w+',
  'game[- ]chang\\w+',
  'groundbreaking',
  'world[- ]class',
  'best[- ]in[- ]class',
  'synerg\\w+',
  'paradigm shift',
  'in today(?:\'|’)s (?:fast-paced )?world',
].map((pattern) => new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-])`, 'gi'));

const DASHES = [
  [/—/g, 'em dash'],
  [/&mdash;|&#8212;|&#x2014;/gi, 'em dash entity'],
  [/(?<=\S)[ \t]+--[ \t]+(?=\S)/g, '" -- " used as a dash'],
  [/―/g, 'horizontal bar used as a dash'],
];

// ---------------------------------------------------------------- allowlist

const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(ROOT, p);

function readYaml(file) {
  try {
    return parseYaml(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectAllowed() {
  const phrases = new Set(PROPER_NAMES);
  const add = (v) => {
    if (typeof v === 'string' && v.trim().length >= 4) phrases.add(v.trim());
  };
  const pubs = readYaml(path.join(ROOT, 'src/data/publications.yaml'));
  for (const p of Array.isArray(pubs) ? pubs : []) {
    add(p?.title);
    add(p?.journal);
  }
  const grants = readYaml(path.join(ROOT, 'src/data/grants.yaml'));
  for (const g of Array.isArray(grants) ? grants : []) {
    add(g?.title);
    add(g?.funder);
  }
  const cv = readYaml(path.join(ROOT, 'src/data/cv.yaml')) ?? {};
  const fields = { experience: ['org'], education: ['org', 'degree'], awards: ['title', 'org'], training: ['title', 'provider'], patents: ['title'] };
  for (const [section, keys] of Object.entries(fields)) {
    for (const item of Array.isArray(cv[section]) ? cv[section] : []) for (const k of keys) add(item?.[k]);
  }
  // Sibling project sites and project slugs are names, not prose.
  try {
    const m = fs.readFileSync(path.join(ROOT, 'src/data/profile.ts'), 'utf8').match(/reservedPaths\s*=\s*\[([\s\S]*?)\]/);
    for (const x of m ? m[1].matchAll(/['"`]([^'"`]+)['"`]/g) : []) add(x[1]);
  } catch {
    // no profile file
  }
  for (const dir of ['src/content/projects', 'src/content/builds']) {
    const full = path.join(ROOT, dir);
    if (exists(full)) for (const f of fs.readdirSync(full)) add(f.replace(/\.mdx?$/, ''));
  }
  return [...phrases];
}

const DASH_CLASS = '[-‐-―]';
/** Phrase to a regex that tolerates markdown emphasis, spacing and dash variants. */
function phraseRegex(phrase) {
  const cleaned = phrase.replace(/[*`]/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
  const body = cleaned
    .split(' ')
    .map((word) =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/[-‐-―]/g, DASH_CLASS)
        .replace(/['‘’]/g, "['‘’]"),
    )
    .join('[\\s*`]+');
  return new RegExp(body, 'gi');
}

const allowedPhrases = collectAllowed().sort((a, b) => b.length - a.length);
const allowedRes = allowedPhrases.map(phraseRegex);
const blank = (m) => m.replace(/[^\n]/g, ' ');

/** Blank out everything that is allowed to keep its spelling. Length is preserved. */
function mask(text, { code = true } = {}) {
  let out = text.replace(/\bhttps?:\/\/[^\s"'<>)\]]+/gi, blank);
  out = out.replace(/\b(?:github\.com|[\w-]+\.github\.io|doi\.org)\/[^\s"'<>)\]]+/gi, blank);
  out = out.replace(/\bSemiQuant\/[\w.-]+/g, blank);
  if (code) out = out.replace(/`[^`\n]+`/g, blank);
  for (const re of allowedRes) out = out.replace(re, blank);
  return out;
}

// ---------------------------------------------------------------- scanning

/** @type {{file: string, line: number, kind: string, msg: string, excerpt: string}[]} */
const findings = [];

function excerptAround(text, index, length) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return `${start > 0 ? '...' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '...' : ''}`;
}

/**
 * Scan one already-masked string and return what it finds.
 * `original` is the unmasked text, used for excerpts.
 */
function scanText(masked, original) {
  const out = [];
  const push = (kind, msg, m) => out.push({ kind, msg, match: m[0].toLowerCase(), excerpt: excerptAround(original, m.index, m[0].length) });
  for (const [re, label] of DASHES) for (const m of masked.matchAll(re)) push('dash', label, m);
  for (const { re, us } of BRITISH) for (const m of masked.matchAll(re)) push('spelling', `"${m[0]}" (American: ${us})`, m);
  for (const re of FILLER) for (const m of masked.matchAll(re)) push('filler', `"${m[0]}"`, m);
  return out;
}

const ALLOW_LINE = /lint-allow(?!-next-line)(?:\s*:\s*([\w ,'’-]*))?/;
const ALLOW_NEXT = /lint-allow-next-line(?:\s*:\s*([\w ,'’-]*))?/;
/** null means "everything on the line". */
const wordList = (list) => {
  const words = (list ?? '').split(/[,\s]+/).filter((w) => /[a-z]/i.test(w)).map((w) => w.toLowerCase());
  return words.length ? new Set(words) : null;
};
/** Words and phrases allowed by a comment in a source file. Also accepted in the built HTML. */
const allowedInBuild = new Set();

function lintSource(file) {
  const text = fs.readFileSync(file, 'utf8');
  // Mask across the whole file so a title that wraps over two lines is still recognized.
  const maskedLines = mask(text).split('\n');
  const lines = text.split('\n');
  /** @type {{all: boolean, words: Set<string>} | null} */
  let carried = null;
  lines.forEach((line, i) => {
    const allow = carried ?? { all: false, words: new Set() };
    carried = null;
    const next = line.match(ALLOW_NEXT);
    if (next) {
      const words = wordList(next[1]);
      carried = { all: words === null, words: words ?? new Set() };
      return;
    }
    const here = line.match(ALLOW_LINE);
    if (here) {
      const words = wordList(here[1]);
      if (words === null) allow.all = true;
      else for (const w of words) allow.words.add(w);
    }
    for (const f of scanText(maskedLines[i] ?? '', line)) {
      const ok = allow.all || allow.words.has(f.match) || f.match.split(/\s+/).some((w) => allow.words.has(w));
      if (ok) {
        if (f.kind !== 'dash') allowedInBuild.add(f.match);
        continue;
      }
      findings.push({ file: rel(file), line: i + 1, kind: f.kind, msg: f.msg, excerpt: f.excerpt });
    }
  });
}

const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i', 'mark', 'q', 's', 'small', 'span', 'strong',
  'sub', 'sup', 'time', 'u', 'wbr', 'ins', 'del', 'font',
]);
const INVISIBLE = new Set(['script', 'style', 'noscript', 'template']);
// Code is not prose.
const CODE = 'code, pre, kbd, samp, var';

function lintHtml(file) {
  const html = fs.readFileSync(file, 'utf8');
  const $ = load(html, { sourceCodeLocationInfo: true });
  const name = path.relative(ROOT, file).startsWith('..') ? file : rel(file);
  const report = (text, line) => {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) return;
    for (const f of scanText(mask(collapsed, { code: false }), collapsed)) {
      if (f.kind !== 'dash' && allowedInBuild.has(f.match)) continue;
      findings.push({ file: name, line, kind: f.kind, msg: f.msg, excerpt: f.excerpt });
    }
  };

  /** Text of a block without nested blocks, so a title split by <em> is judged whole and nothing is counted twice. */
  const ownText = (block) => {
    let out = '';
    const walkInline = (node) => {
      for (const child of node.children ?? []) {
        if (child.type === 'text') out += child.data;
        else if (child.type === 'tag' && INLINE.has(child.name) && !('data-lint-allow' in (child.attribs ?? {}))) walkInline(child);
        else out += ' ';
      }
    };
    walkInline(block);
    return out;
  };

  const visit = (node) => {
    if (node.type === 'tag') {
      if (INVISIBLE.has(node.name) || $(node).is(CODE) || 'data-lint-allow' in (node.attribs ?? {})) return;
      const line = node.sourceCodeLocation?.startLine ?? 0;
      for (const attr of ['alt', 'title', 'aria-label', 'placeholder']) {
        const v = node.attribs?.[attr];
        if (v) report(v, line);
      }
      const metaName = node.attribs?.name ?? node.attribs?.property ?? '';
      if (node.name === 'meta' && /^(?:description|og:title|og:description|twitter:title|twitter:description)$/.test(metaName)) {
        report(node.attribs.content ?? '', line);
      }
      if (!INLINE.has(node.name)) report(ownText(node), line);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit($.root()[0]);
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

// ---------------------------------------------------------------- run

let sourceCount = 0;
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    if (!SOURCE_EXT.has(path.extname(file).toLowerCase())) continue;
    lintSource(file);
    sourceCount++;
  }
}

let htmlCount = 0;
const distSkipped = flag('--no-dist') || !exists(DIST);
if (!distSkipped) {
  for (const file of walk(DIST)) {
    if (!/\.html?$/i.test(file)) continue;
    lintHtml(file);
    htmlCount++;
  }
}

// ---------------------------------------------------------------- report

console.log(
  `lint-copy: ${sourceCount} source files, ${distSkipped ? 'built HTML skipped' : `${htmlCount} built pages`}, ${allowedPhrases.length} allowlisted names and titles`,
);
if (VERBOSE) for (const p of allowedPhrases) console.log(`  allow: ${p}`);

if (findings.length) {
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const byKind = {};
  console.error('');
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    console.error(`${f.file}:${f.line}  [${f.kind}] ${f.msg}\n    ${f.excerpt}`);
  }
  const summary = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ');
  console.error(`\nFAIL: ${findings.length} finding${findings.length === 1 ? '' : 's'} (${summary})`);
  console.error('Fix the text, or add "lint-allow" in a comment on that line if it is right as written.');
  process.exit(1);
}
console.log('PASS: no em dashes, British spellings or filler phrases');
