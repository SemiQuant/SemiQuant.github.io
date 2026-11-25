#!/usr/bin/env node
/**
 * Add one publication to src/data/publications.yaml from its DOI.
 *
 * Usage:
 *   node scripts/add-pub.mjs <doi> [--dry-run] [--id <id>] [--not-in-cv] [--append]
 *
 *   --dry-run     print the entry, write nothing
 *   --id <id>     use this id instead of the generated one
 *   --not-in-cv   add "inCv: false" (shown on the site, not in the CV list)
 *   --append      add at the bottom instead of the top
 *
 * Metadata comes from Crossref (and the PMID from PubMed when it has one).
 * The entry is inserted as text, so the rest of the file, including comments
 * and formatting, is left exactly as it is. No contact details are sent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { publicationToYaml, slug, tagsFor } from './extract-cv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'src/data/publications.yaml');
const UA = 'Mozilla/5.0';
const OWNER = /^Limberis\s+JD?$/;
const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'from', 'by', 'using', 'at', 'is', 'are', 'as', 'its', 'their', 'new', 'novel']);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--id');

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const text = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Crossref titles carry <i> tags for species and gene names: keep them as *markdown*. */
const titleToMarkdown = (s) =>
  text(String(s ?? '').replace(/<\/?(i|em)>/gi, '*').replace(/<[^>]+>/g, ''))
    .replace(/\*\s+/g, (m, off, str) => ((str.slice(0, off).match(/\*/g) ?? []).length % 2 === 0 ? '*' : '* '))
    .replace(/\s+\*(?=[\s.,:;]|$)/g, '*')
    .replace(/\.$/, '');

/** "Jason D." -> "JD", "Jean-Pierre" -> "JP". */
const initials = (given) =>
  text(given).split(/[\s.-]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('');

function authorName(a) {
  if (a.family) return text(`${a.family} ${initials(a.given ?? '')}`);
  return text(a.name ?? '');
}

function keywordFor(plainTitle) {
  const lead = plainTitle.split(':')[0];
  if (plainTitle.includes(':') && lead.trim().split(/\s+/).length === 1) return slug(lead);
  return slug(plainTitle).split('-').filter((w) => !STOP.has(w)).slice(0, 2).join('-');
}

function citationFor(m) {
  const pages = (m.page ?? m['article-number'] ?? '').replace(/-/g, '–');
  let c = m.volume ?? '';
  if (m.issue) c += `(${m.issue})`;
  if (pages) c += c ? `:${pages}` : pages;
  return c || undefined;
}

async function findPmid(doi) {
  try {
    const q = new URLSearchParams({ db: 'pubmed', retmode: 'json', term: `${doi}[AID]` });
    const r = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${q}`);
    const ids = r.esearchresult?.idlist ?? [];
    return ids.length === 1 ? ids[0] : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const doi = (positional[0] ?? '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').trim();
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
    console.error('Usage: node scripts/add-pub.mjs <doi> [--dry-run] [--id <id>] [--not-in-cv] [--append]');
    process.exit(1);
  }

  const m = (await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)).message;
  const authors = (m.author ?? []).map(authorName).filter(Boolean);
  if (!authors.length) throw new Error('Crossref lists no authors for this DOI. Add the entry by hand.');
  const title = titleToMarkdown(m.title?.[0]);
  const plain = title.replace(/\*/g, '');
  const year = (m['published-print'] ?? m['published-online'] ?? m.published ?? m.posted ?? m.issued)?.['date-parts']?.[0]?.[0];
  if (!title || !year) throw new Error('Crossref record has no title or year. Add the entry by hand.');

  const type = m.type === 'posted-content' ? 'preprint' : /book/.test(m.type ?? '') ? 'chapter' : 'article';
  const journal = text(
    type === 'preprint'
      ? m.institution?.[0]?.name ?? m['group-title'] ?? m.publisher
      : m['short-container-title']?.[0] ?? m['container-title']?.[0],
  ) || undefined;
  const ownerIdx = authors.findIndex((a) => OWNER.test(a));
  const role = ownerIdx === 0 ? 'first' : 'middle';
  const surname = slug((m.author?.[0]?.family ?? authors[0]).trim());
  const id = opt('--id') ?? `${surname}-${year}-${keywordFor(plain)}`;

  const existingText = readFileSync(FILE, 'utf8');
  const existing = YAML.parse(existingText) ?? [];
  if (existing.some((p) => p.id === id)) throw new Error(`An entry with id "${id}" already exists. Pass --id to choose another.`);
  const clash = existing.find((p) => String(p.doi ?? '').toLowerCase() === doi.toLowerCase());
  if (clash) throw new Error(`This DOI is already in the file as "${clash.id}".`);

  const pub = { id, type, title, authors, role, journal, year, citation: type === 'preprint' ? undefined : citationFor(m), doi: m.DOI ?? doi, pmid: await findPmid(doi), tags: tagsFor(title, journal) };
  if (flag('--not-in-cv')) pub.inCv = false;
  const block = publicationToYaml(pub);

  console.log(block);
  console.log('Review before you commit:');
  console.log(`  role     "${role}" is a guess from author position (${ownerIdx < 0 ? 'Limberis not found in the author list' : `Limberis is author ${ownerIdx + 1} of ${authors.length}`}). Use joint-first if the paper marks shared first authorship.`);
  console.log(`  tags     [${pub.tags.join(', ')}] came from a keyword map. Edit them to fit.`);
  console.log('  italics  wrap species and gene names in *asterisks* if Crossref dropped them.');
  console.log('  journal  Crossref may give the full name. The other entries use the PubMed abbreviation.');
  if (!pub.pmid) console.log('  pmid     none found in PubMed yet. Run "npm run pubs:enrich" later.');

  if (flag('--dry-run')) {
    console.log('\n[dry run] nothing written.');
    return;
  }

  let next;
  if (flag('--append')) {
    next = `${existingText.replace(/\s*$/, '\n')}\n${block}`;
  } else {
    // Insert before the first list item, after any header comments.
    const at = existingText.search(/^- /m);
    next = at < 0 ? `${existingText.replace(/\s*$/, '\n')}\n${block}` : `${existingText.slice(0, at)}${block}\n${existingText.slice(at)}`;
  }
  YAML.parse(next); // make sure the file still parses before writing
  writeFileSync(FILE, next);
  console.log(`\nAdded ${id} to src/data/publications.yaml (${flag('--append') ? 'bottom' : 'top'}).`);
}

main().catch((err) => { console.error(`add-pub: ${err.message}`); process.exit(1); });
