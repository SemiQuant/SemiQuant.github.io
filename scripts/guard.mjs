#!/usr/bin/env node
// Route and privacy guard. Run after a build: `node scripts/guard.mjs`.
//
//   --src-only        skip the dist/ checks (usable before a build)
//   --root <dir>      project root (default: the parent of scripts/)
//   --dist <dir>      build output (default: <root>/dist)
//   --strict-pdf      fail when a PDF cannot be read with pdftotext
//   --reveal          print matches in full (default: masked, CI logs are public)
//
// Checks
//   1. Reserved routes: nothing at the top of dist/ (or src/pages, public/) may
//      share a name with a sibling project site listed in `reservedPaths`
//      (src/data/profile.ts), compared case-insensitively. Routes are lowercase.
//   2. Privacy: no phone numbers, no referee contact details, no email other
//      than the site owner's, no job-application text.
//
// No phone number is stored in this file on purpose. The phone check matches
// number shapes, not one specific number.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = path.resolve(opt('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const DIST = path.resolve(opt('--dist', path.join(ROOT, 'dist')));
const SRC_ONLY = flag('--src-only');
const STRICT_PDF = flag('--strict-pdf');
const REVEAL = flag('--reveal');

const OWNER_EMAIL = 'jasonlimberis@gmail.com';
const REFEREE_DOMAINS = ['ucsf.edu', 'cepheid.com', 'sun.ac.za', 'uct.ac.za'];
// Built by concatenation so this file never contains the phrases it hunts for.
const BANNED_PHRASES = ['Claude' + ' Code', 'bring to' + ' this team'];
// Top-level dist entries that may keep their capitals.
const UPPERCASE_OK = new Set(['CNAME', 'README.md', 'LICENSE', 'LICENSE.txt']);
// Number-shaped strings that are known not to be phone numbers. Add exact matches here.
const PHONE_ALLOW = new Set([]);

const TEXT_EXT = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.xml', '.txt', '.md', '.mdx',
  '.astro', '.yaml', '.yml', '.svg', '.webmanifest', '.map', '.csv', '.tsv', '.toml', '.sh', '.vcf', '.ics', '.bib',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', '.astro', '.cache', '.vscode', '.idea']);

const failures = [];
const warnings = [];
const notices = [];
const fail = (check, where, msg) => failures.push({ check, where, msg });
const warn = (check, where, msg) => warnings.push({ check, where, msg });

const rel = (p) => {
  const r = path.relative(ROOT, p) || '.';
  return r.startsWith('..') ? p : r;
};
const exists = (p) => fs.existsSync(p);

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------- reserved routes

function readReservedPaths() {
  const file = path.join(ROOT, 'src/data/profile.ts');
  if (!exists(file)) {
    fail('reserved', rel(file), 'file not found, cannot read reservedPaths');
    return [];
  }
  const m = fs.readFileSync(file, 'utf8').match(/reservedPaths\s*=\s*\[([\s\S]*?)\]/);
  if (!m) {
    fail('reserved', rel(file), 'could not find the reservedPaths array');
    return [];
  }
  const names = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
  if (!names.length) fail('reserved', rel(file), 'reservedPaths is empty');
  return names;
}

function checkTopLevel(dir, reserved, { uppercase }) {
  if (!exists(dir)) return;
  const reservedLower = new Map(reserved.map((r) => [r.toLowerCase(), r]));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === '.DS_Store') continue;
    const stem = name.replace(/\.(html?|astro|md|mdx|ts|js)$/i, '');
    const hit = reservedLower.get(name.toLowerCase()) ?? reservedLower.get(stem.toLowerCase());
    if (hit) {
      fail('reserved', rel(path.join(dir, name)), `collides with the sibling project site "/${hit}/"`);
      continue;
    }
    if (uppercase && /[A-Z]/.test(name) && !UPPERCASE_OK.has(name)) {
      fail('lowercase', rel(path.join(dir, name)), 'top-level entry has uppercase letters (routes are lowercase)');
    }
  }
}

function checkNestedRouteCase(dir) {
  // A directory holding an index.html is a route. Skip Astro's asset folder.
  for (const file of walk(dir)) {
    if (path.basename(file) !== 'index.html') continue;
    const routeParts = path.relative(dir, path.dirname(file)).split(path.sep).filter(Boolean);
    if (routeParts.length < 2 || routeParts[0] === '_astro') continue;
    if (routeParts.slice(1).some((p) => /[A-Z]/.test(p))) {
      fail('lowercase', rel(path.dirname(file)), 'route has uppercase letters (routes are lowercase)');
    }
  }
}

// ---------------------------------------------------------------- text extraction

let pdftotextAvailable = null;
function hasPdftotext() {
  if (pdftotextAvailable === null) {
    try {
      execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
      pdftotextAvailable = true;
    } catch (err) {
      // `pdftotext -v` exits 0 or 99 depending on the build. ENOENT means it is missing.
      pdftotextAvailable = err.code !== 'ENOENT';
    }
  }
  return pdftotextAvailable;
}

/** Printable runs from a buffer, like strings(1). */
function printable(buf) {
  return (buf.toString('latin1').match(/[\x20-\x7e]{4,}/g) ?? []).join('\n');
}

/** Fallback PDF reader: raw strings plus strings from inflated streams. */
function pdfStrings(buf) {
  const parts = [printable(buf)];
  const marker = Buffer.from('stream');
  let pos = 0;
  while ((pos = buf.indexOf(marker, pos)) !== -1) {
    let start = pos + marker.length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf('endstream', start);
    if (end === -1) break;
    try {
      const inflated = zlib.inflateSync(buf.subarray(start, end));
      // Text operators: (..) Tj and [(..) -12 (..)] TJ
      const text = inflated.toString('latin1');
      const shown = [...text.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^)\\]|\\.)*)\)\s*Tj/g)]
        .map((m) => (m[1] !== undefined ? [...m[1].matchAll(/\(((?:[^)\\]|\\.)*)\)/g)].map((x) => x[1]).join('') : m[2]))
        .join(' ');
      parts.push(shown, printable(inflated));
    } catch {
      // not a deflate stream
    }
    pos = end;
  }
  return parts.join('\n');
}

function readPdf(file) {
  if (hasPdftotext()) {
    try {
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      // Metadata (author, title, producer) is not in the page text.
      return text + '\n' + printable(fs.readFileSync(file));
    } catch (err) {
      (STRICT_PDF ? fail : warn)('pdf', rel(file), `pdftotext failed (${err.message.split('\n')[0]}), used a weaker strings scan`);
    }
  } else {
    (STRICT_PDF ? fail : warn)('pdf', rel(file), 'pdftotext not installed, used a weaker strings scan (install poppler)');
  }
  return pdfStrings(fs.readFileSync(file));
}

/** Returns text for a file, or null when it is a binary we do not scan. */
function readText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return readPdf(file);
  const buf = fs.readFileSync(file);
  if (!TEXT_EXT.has(ext)) {
    // Unknown extension: scan it only when it looks like text.
    if (buf.subarray(0, 8192).includes(0)) return null;
  }
  return buf.toString('utf8');
}

// ---------------------------------------------------------------- privacy patterns

const normalize = (text) =>
  text
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&#(?:45|x2d);|&(?:hyphen|dash|ndash|mdash|minus);/gi, '-')
    .replace(/&#(?:64|x40);|&commat;/gi, '@')
    .replace(/&#(?:46|x2e);|&period;/gi, '.')
    .replace(/[  -  ]/g, ' ')
    .replace(/[‐-―−]/g, '-');

const NOT_BEFORE = '(?<![\\w./#=-])';
const NOT_AFTER = '(?![\\w-])';
const SEP = '[\\s.-]';
const PHONE_PATTERNS = [
  // (NNN) NNN-NNNN, with or without a +1 prefix
  new RegExp(`${NOT_BEFORE}(?:\\+?1${SEP}?)?\\(\\d{3}\\)${SEP}?\\d{3}${SEP}\\d{4}${NOT_AFTER}`, 'g'),
  // NNN-NNN-NNNN or NNN.NNN.NNNN
  new RegExp(`${NOT_BEFORE}(?:\\+?1${SEP}?)?\\d{3}[.-]\\d{3}[.-]\\d{4}${NOT_AFTER}`, 'g'),
  // +1 followed by ten digits, any separators
  new RegExp(`(?<![\\w])\\+1${SEP}?\\d{3}${SEP}?\\d{3}${SEP}?\\d{4}${NOT_AFTER}`, 'g'),
  // Any San Francisco (415) number, with spaces, dashes, dots or nothing between the groups.
  new RegExp(`${NOT_BEFORE}(?:\\+?1${SEP}?)?\\(?415\\)?${SEP}{0,2}\\d{3}${SEP}{0,2}\\d{4}${NOT_AFTER}`, 'g'),
  // tel: links are phone numbers by definition.
  /\btel:\+?[\d().\s-]{7,}/gi,
];

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi;
const NOT_A_TLD = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'js', 'mjs', 'css', 'json', 'map', 'woff', 'woff2', 'ttf', 'mp4', 'webm', 'html', 'astro', 'ts', 'md']);
const NON_PERSONAL_LOCAL = /^(?:no-?reply|do-?not-?reply|git|noreply\+.*|.*\+noreply|actions?|github-actions(?:\[bot\])?|bot|example|user|username|name|you|me|someone|email|test|foo|bar)$/i;
const NON_PERSONAL_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|users\.noreply\.github\.com|noreply\.github\.com|sentry\.io|localhost\.localdomain|domain\.com|email\.com|w3\.org)$/i;

const maskPhone = (s) => (REVEAL ? s : s.replace(/\d(?=(?:\D*\d){0,6}\D*$)/g, 'x'));
const maskEmail = (s) => {
  if (REVEAL) return s;
  const [local, domain] = s.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * @param {string} file absolute path
 * @param {{phrases: boolean, generated: boolean}} mode
 *   phrases: also look for job-application text
 *   generated: file is a bundler asset (unknown emails are warnings, not failures)
 */
function scanFile(file, mode) {
  const raw = readText(file);
  if (raw === null) return false;
  const text = normalize(raw);
  const where = (index) => `${rel(file)}:${lineOf(text, index)}`;

  // Phone numbers.
  const seenPhone = new Set();
  for (const re of PHONE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const key = `${m.index}`;
      if (PHONE_ALLOW.has(m[0]) || [...seenPhone].some((k) => Math.abs(Number(k) - m.index) < 6)) continue;
      seenPhone.add(key);
      fail('phone', where(m.index), `phone-number-like string "${maskPhone(m[0])}"`);
    }
  }

  // Emails.
  const refDomains = REFEREE_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|');
  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].replace(/\.$/, '');
    const [local, domain] = [email.slice(0, email.lastIndexOf('@')), email.slice(email.lastIndexOf('@') + 1).toLowerCase()];
    const tld = domain.split('.').pop();
    if (NOT_A_TLD.has(tld)) continue; // logo@2x.png and friends
    if (email.toLowerCase() === OWNER_EMAIL) continue;
    const refDomain = new RegExp(`(?:^|\\.)(?:${refDomains})$`).test(domain);
    if (!refDomain && (NON_PERSONAL_LOCAL.test(local) || NON_PERSONAL_DOMAIN.test(domain))) {
      notices.push(`${where(m.index)}  allowed non-personal address ${email}`);
      continue;
    }
    if (mode.generated && !refDomain) {
      warn('email', where(m.index), `address in a generated asset: ${maskEmail(email)} (check it is not personal)`);
      continue;
    }
    fail('email', where(m.index), `email other than the site owner's: ${maskEmail(email)}`);
  }

  // A "References" heading followed closely by a referee-domain address.
  const refBlock = new RegExp(`\\bRefere(?:nces?|es?)\\b[\\s\\S]{0,400}?@(?:[a-z0-9-]+\\.)*(?:${refDomains})\\b`, 'gi');
  for (const m of text.matchAll(refBlock)) {
    fail('references', where(m.index), 'a "References" section with referee contact details');
  }

  // Job-application text.
  if (mode.phrases) {
    const lower = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      let at = -1;
      while ((at = lower.indexOf(phrase.toLowerCase(), at + 1)) !== -1) {
        fail('phrase', where(at), `banned phrase "${phrase}"`);
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------- run

const reserved = readReservedPaths();
let scanned = 0;
let skippedBinary = 0;
const scanTree = (dir, mode) => {
  for (const file of walk(dir)) {
    const generated = mode.generated ?? false;
    const isBundle = generated && /[\\/]_astro[\\/]/.test(file) && /\.(js|mjs|css|map)$/i.test(file);
    if (scanFile(file, { phrases: mode.phrases, generated: isBundle })) scanned++;
    else skippedBinary++;
  }
};

// Source side: routes, then privacy.
checkTopLevel(path.join(ROOT, 'src/pages'), reserved, { uppercase: true });
checkTopLevel(path.join(ROOT, 'public'), reserved, { uppercase: true });
scanTree(path.join(ROOT, 'src'), { phrases: true });
scanTree(path.join(ROOT, 'public'), { phrases: true });
// The rest of the public repo: contact details only (tooling may name the phrases it filters).
for (const dir of ['scripts', '.github']) scanTree(path.join(ROOT, dir), { phrases: false });
if (exists(ROOT)) {
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'package-lock.json' || entry.name === '.DS_Store') continue;
    if (scanFile(path.join(ROOT, entry.name), { phrases: false, generated: false })) scanned++;
    else skippedBinary++;
  }
}

// Build output.
if (!SRC_ONLY) {
  if (!exists(DIST)) {
    fail('dist', rel(DIST), 'build output not found. Run `npm run build` first, or pass --src-only');
  } else {
    checkTopLevel(DIST, reserved, { uppercase: true });
    checkNestedRouteCase(DIST);
    scanTree(DIST, { phrases: true, generated: true });
  }
}

// ---------------------------------------------------------------- report

const scope = SRC_ONLY ? 'source only' : `source + ${rel(DIST)}`;
console.log(`guard: ${scope}, ${scanned} files scanned, ${skippedBinary} binaries skipped`);
console.log(`guard: reserved paths: ${reserved.join(', ') || '(none)'}`);
if (notices.length) {
  console.log(`\nAllowed addresses (${notices.length}):`);
  for (const n of [...new Set(notices)].slice(0, 40)) console.log(`  ${n}`);
}
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  [${w.check}] ${w.where}  ${w.msg}`);
}
if (failures.length) {
  console.error(`\nFAIL: ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
  for (const f of failures) console.error(`  [${f.check}] ${f.where}  ${f.msg}`);
  if (!REVEAL) console.error('\nMatches are masked. Re-run locally with --reveal to see them in full.');
  process.exit(1);
}
console.log('\nPASS: no reserved-route collisions, no privacy findings');
