#!/usr/bin/env node
/**
 * Check every entry in src/data/publications.yaml against Crossref, PubMed
 * and doi.org, and fill in missing DOIs and PMIDs.
 *
 * Usage:
 *   node scripts/enrich-pubs.mjs                 # report only, changes nothing
 *   node scripts/enrich-pubs.mjs --write         # also add confirmed missing ids
 *   node scripts/enrich-pubs.mjs --only <id>     # one entry
 *
 * Rules:
 *   - Only a missing doi or pmid is ever added. Titles, authors and anything
 *     already in the file are never changed; disagreements are reported.
 *   - A found id is "confirmed" when the remote title matches the CV title
 *     (similarity >= 0.9) and the year is within one of the CV year.
 *   - No contact email or name is sent to any API. Calls are spaced out and
 *     failures are tolerated (reported, then skipped).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'src/data/publications.yaml');
const UA = 'Mozilla/5.0';
const DELAY_MS = 400;
const MIN_SIM = 0.9;
const FIELD_ORDER = ['id', 'type', 'title', 'authors', 'role', 'journal', 'year', 'citation', 'doi', 'pmid', 'url', 'tags', 'featured', 'inCv'];

/** DOIs that the CV text leaves out (taken from the old site). Still verified below. */
const KNOWN_DOIS = {
  'limberis-2024-cartridge': '10.5588/ijtldopen.24.0124',
  'limberis-2023-primerjinn': '10.1186/s12859-023-05609-1',
  'limberis-2023-selseq': '10.1371/journal.pone.0289442',
  'limberis-2023-hisspcr': '10.1371/journal.pone.0288687',
  'jaumdally-2024-sars-cov-2-bioaerosols': '10.1038/s41467-024-45400-1',
  'derendinger-2023-bedaquiline': '10.1016/S2666-5247(23)00172-6',
};

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/* ---------------------------- helpers ----------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

async function getJson(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    const wait = lastCall + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return { notFound: true };
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return { data: await res.json() };
    } catch (err) {
      if (i === tries - 1) return { error: err.name === 'TimeoutError' ? 'timeout' : String(err.message ?? err) };
      await sleep(1500 * (i + 1));
    }
  }
  return { error: 'gave up after retries' };
}

export const normTitle = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\u03b1-\u03c9]+/g, ' ').trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
export function similarity(a, b) {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
const sameDoi = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const crossrefYear = (m) =>
  (m['published-print'] ?? m['published-online'] ?? m.published ?? m.posted ?? m.issued)?.['date-parts']?.[0]?.[0];
const crossrefYears = (m) =>
  ['published-print', 'published-online', 'published', 'posted', 'issued'].map((k) => m[k]?.['date-parts']?.[0]?.[0]).filter(Boolean);
const yearOk = (cvYear, years) => years.some((y) => Math.abs(y - cvYear) <= 1);

/* ----------------------------- lookups ---------------------------- */

async function crossrefByDoi(doi) {
  const r = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  return r.data ? { work: r.data.message } : r;
}

async function crossrefSearch(pub) {
  const first = pub.authors[0].replace(/\s+[A-Z]{1,3}$/, '');
  const q = new URLSearchParams({
    'query.bibliographic': `${pub.title.replace(/\*/g, '')} ${first}`,
    rows: '5',
    select: 'DOI,title,type,issued,published-print,published-online,published,posted,container-title',
  });
  const r = await getJson(`https://api.crossref.org/works?${q}`);
  if (!r.data) return r;
  const wantPreprint = pub.type === 'preprint';
  const hits = (r.data.message.items ?? [])
    .filter((it) => (it.type === 'posted-content') === wantPreprint)
    .map((it) => ({ doi: it.DOI, title: it.title?.[0] ?? '', sim: similarity(pub.title, it.title?.[0]), years: crossrefYears(it) }))
    .sort((a, b) => b.sim - a.sim);
  return { hit: hits[0] };
}

async function doiResolves(doi) {
  const r = await getJson(`https://doi.org/api/handles/${encodeURIComponent(doi)}`);
  if (r.notFound) return false;
  if (r.data) return r.data.responseCode === 1;
  return null; // unknown
}

async function pubmedSearch(term) {
  const q = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '5', term });
  const r = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${q}`);
  return r.data ? { ids: r.data.esearchresult?.idlist ?? [] } : r;
}

async function pubmedSummary(pmid) {
  const q = new URLSearchParams({ db: 'pubmed', retmode: 'json', id: pmid });
  const r = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${q}`);
  const rec = r.data?.result?.[pmid];
  if (!rec || rec.error) return r.data ? { notFound: true } : r;
  return {
    summary: {
      title: rec.title,
      year: Number(String(rec.pubdate ?? '').slice(0, 4)) || undefined,
      epubYear: Number(String(rec.epubdate ?? '').slice(0, 4)) || undefined,
      doi: rec.articleids?.find((a) => a.idtype === 'doi')?.value,
      journal: rec.source,
    },
  };
}

/** Has a bioRxiv / medRxiv preprint been published in a journal? */
async function preprintPublished(doi, work) {
  const rel = work?.relation?.['is-preprint-of']?.[0]?.id;
  if (rel) return rel;
  for (const server of ['biorxiv', 'medrxiv']) {
    const r = await getJson(`https://api.biorxiv.org/details/${server}/${doi}`);
    const rec = r.data?.collection?.at(-1);
    if (rec) return rec.published && rec.published !== 'NA' ? rec.published : null;
  }
  return null;
}

/* ------------------------------ main ------------------------------ */

async function checkOne(pub) {
  const notes = [];
  const add = {};
  const out = { id: pub.id, notes, add };

  if (pub.type === 'chapter' || (pub.type === 'software' && !pub.doi)) {
    notes.push('skipped (book chapter or software without a DOI)');
    return out;
  }

  // 1. DOI: from the file, the known list, or a Crossref title search.
  let doi = pub.doi;
  let source = 'file';
  if (!doi && KNOWN_DOIS[pub.id]) { doi = KNOWN_DOIS[pub.id]; source = 'known list'; }
  if (!doi) {
    const s = await crossrefSearch(pub);
    if (s.error) notes.push(`Crossref search failed: ${s.error}`);
    else if (s.hit && s.hit.sim >= MIN_SIM && yearOk(pub.year, s.hit.years)) { doi = s.hit.doi; source = 'Crossref title search'; }
    else if (s.hit) notes.push(`no confident DOI (best Crossref hit ${s.hit.doi}, title similarity ${s.hit.sim.toFixed(2)})`);
  }

  // 2. Verify the DOI.
  let doiConfirmed = false;
  let work;
  if (doi) {
    const c = await crossrefByDoi(doi);
    if (c.work) {
      work = c.work;
      const sim = similarity(pub.title, work.title?.[0]);
      const years = crossrefYears(work);
      if (sim < MIN_SIM) notes.push(`TITLE MISMATCH with Crossref for ${doi} (similarity ${sim.toFixed(2)}): "${normTitle(work.title?.[0])}"`);
      if (!years.includes(pub.year)) notes.push(`year: CV ${pub.year}, Crossref ${[...new Set(years)].join('/') || 'none'}${yearOk(pub.year, years) ? ' (within one year)' : ' YEAR MISMATCH'}`);
      doiConfirmed = sim >= MIN_SIM && yearOk(pub.year, years);
    } else if (c.notFound) {
      const ok = await doiResolves(doi);
      notes.push(ok ? `DOI ${doi} is not in Crossref but resolves at doi.org (title not checked)` : `DOI ${doi} NOT FOUND in Crossref or doi.org`);
    } else notes.push(`Crossref lookup failed for ${doi}: ${c.error}`);
    if (doiConfirmed) {
      const ok = await doiResolves(doi);
      if (ok === false) { notes.push(`DOI ${doi} does not resolve at doi.org`); doiConfirmed = false; }
    }
    if (!pub.doi && doiConfirmed) add.doi = doi;
    if (!pub.doi) notes.push(`doi missing in file: ${doi} from ${source}${doiConfirmed ? ' (confirmed)' : ' (NOT confirmed)'}`);
  } else notes.push('MISSING DOI: none found');

  // 3. PMID: by DOI, then by title.
  let pmid = pub.pmid ? String(pub.pmid) : undefined;
  let found;
  if (doi) {
    const s = await pubmedSearch(`${doi}[AID]`);
    if (s.error) notes.push(`PubMed search failed: ${s.error}`);
    else if (s.ids?.length === 1) found = s.ids[0];
    else if (s.ids?.length > 1) notes.push(`PubMed returned ${s.ids.length} records for the DOI: ${s.ids.join(', ')}`);
  }
  if (!found && !pmid) {
    const s = await pubmedSearch(`${pub.title.replace(/\*/g, '').replace(/[[\]():]/g, ' ')}[Title]`);
    if (s.ids?.length === 1) found = s.ids[0];
  }
  if (pmid && found && pmid !== found) notes.push(`PMID CONFLICT: file has ${pmid}, PubMed finds ${found} for the DOI`);
  const candidate = pmid ?? found;
  if (candidate) {
    const s = await pubmedSummary(candidate);
    if (s.summary) {
      const sim = similarity(pub.title, s.summary.title);
      const years = [s.summary.year, s.summary.epubYear].filter(Boolean);
      const ok = sim >= MIN_SIM && yearOk(pub.year, years);
      if (sim < MIN_SIM) notes.push(`TITLE MISMATCH with PubMed ${candidate} (similarity ${sim.toFixed(2)}): "${normTitle(s.summary.title)}"`);
      if (!years.includes(pub.year)) notes.push(`year: CV ${pub.year}, PubMed ${years.join('/') || 'none'}${yearOk(pub.year, years) ? ' (within one year)' : ' YEAR MISMATCH'}`);
      if (doi && s.summary.doi && !sameDoi(doi, s.summary.doi)) notes.push(`DOI differs: ${doi} here, PubMed ${candidate} has ${s.summary.doi}`);
      if (!doi && s.summary.doi && ok) { notes.push(`doi from PubMed record: ${s.summary.doi}`); add.doi = s.summary.doi; }
      if (!pmid) {
        notes.push(`pmid missing in file: ${candidate}${ok ? ' (confirmed)' : ' (NOT confirmed)'}`);
        if (ok) add.pmid = candidate;
      }
    } else if (s.notFound) notes.push(`PMID ${candidate} NOT FOUND in PubMed`);
    else notes.push(`PubMed summary failed for ${candidate}: ${s.error}`);
  } else notes.push('no PMID (not found in PubMed)');

  // 4. Preprints: is there a published version now?
  if (pub.type === 'preprint' && doi) {
    const published = await preprintPublished(doi, work);
    if (published) notes.push(`PREPRINT NOW PUBLISHED as ${published}`);
    else notes.push('preprint: no published version registered');
  }
  return out;
}

function applyChanges(doc, results) {
  let n = 0;
  for (const item of doc.contents.items) {
    const res = results.find((r) => r.id === item.get('id'));
    if (!res) continue;
    for (const key of ['doi', 'pmid']) {
      if (res.add[key] === undefined || item.has(key)) continue;
      const before = FIELD_ORDER.slice(0, FIELD_ORDER.indexOf(key));
      let at = 0;
      item.items.forEach((pair, i) => { if (before.includes(pair.key.value)) at = i + 1; });
      item.items.splice(at, 0, doc.createPair(key, String(res.add[key])));
      n++;
    }
  }
  return n;
}

async function main() {
  const text = readFileSync(FILE, 'utf8');
  const doc = YAML.parseDocument(text);
  const pubs = doc.toJS().filter((p) => !ONLY || p.id === ONLY);
  if (!pubs.length) throw new Error(ONLY ? `No entry with id ${ONLY}` : 'No publications found');

  console.log(`Checking ${pubs.length} publications against Crossref, PubMed and doi.org${WRITE ? ' (--write)' : ' (report only)'}\n`);
  const results = [];
  for (const pub of pubs) {
    let res;
    try {
      res = await checkOne(pub);
    } catch (err) {
      res = { id: pub.id, notes: [`check failed: ${err.message}`], add: {} };
    }
    results.push(res);
    const flag = res.notes.some((n) => /MISMATCH|CONFLICT|NOT FOUND|MISSING|NOT confirmed|failed|NOW PUBLISHED/.test(n)) ? '!' : Object.keys(res.add).length ? '+' : ' ';
    console.log(`${flag} ${pub.id}`);
    for (const n of res.notes) console.log(`    ${n}`);
    for (const [k, v] of Object.entries(res.add)) console.log(`    ${WRITE ? 'adding' : 'would add'} ${k}: ${v}`);
  }

  const count = (re) => results.filter((r) => r.notes.some((n) => re.test(n))).map((r) => r.id);
  const section = (label, ids) => console.log(`${label}: ${ids.length}${ids.length ? `\n  ${ids.join('\n  ')}` : ''}`);
  console.log('\nSummary');
  section('Title mismatch', count(/TITLE MISMATCH/));
  section('Year mismatch (more than one year)', count(/YEAR MISMATCH/));
  section('Year differs by one (online vs print)', count(/within one year/));
  section('Id conflicts or not found', count(/CONFLICT|NOT FOUND|DOI differs/));
  section('Still no DOI', count(/MISSING DOI/));
  section('No PMID', count(/no PMID/));
  section('Preprints with a published version', count(/NOW PUBLISHED/));
  section('API failures', count(/failed/));
  section('Entries with ids to add', results.filter((r) => Object.keys(r.add).length).map((r) => `${r.id}: ${Object.entries(r.add).map(([k, v]) => `${k} ${v}`).join(', ')}`));

  if (WRITE) {
    const n = applyChanges(doc, results);
    if (n) writeFileSync(FILE, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
    console.log(`\nWrote ${n} field(s) to src/data/publications.yaml`);
  } else {
    console.log('\nNothing written. Re-run with --write to add the ids listed above.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
