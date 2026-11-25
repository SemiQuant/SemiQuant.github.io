/**
 * Small formatting helpers shared by components and pages.
 * Import from Astro components, pages or endpoints (the YAML import below
 * needs Vite, so plain Node scripts cannot load this file).
 */
import { parse as parseYaml } from 'yaml';
import pubsYaml from '../data/publications.yaml?raw';

type PubLike = { id: string; data: { year: number; role: 'first' | 'joint-first' | 'middle'; inCv?: boolean } };

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for safe use in HTML. */
export function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ESC[c]);
}

/**
 * Escape HTML, then turn *x* into <em>x</em>. Use with set:html for titles,
 * taglines and CV text that mark species and gene names with asterisks.
 */
export function mdInlineToHtml(text: string): string {
  return escapeHtml(text).replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '<em>$1</em>');
}

/** Same input as mdInlineToHtml, but returns plain text with the asterisks removed. */
export function mdInlineToText(text: string): string {
  return String(text).replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1');
}

/** True for the site owner in an author list ("Limberis J", "Limberis JD", with or without a trailing *). */
export function isOwner(author: string): boolean {
  return /^limberis\s+j/i.test(author.trim());
}

/** Ids in the order they appear in src/data/publications.yaml (hand-ordered, newest first). */
const YAML_ORDER: Map<string, number> = (() => {
  try {
    const rows = parseYaml(pubsYaml) as { id?: string }[] | null;
    return new Map((rows ?? []).map((r, i) => [String(r?.id), i]));
  } catch {
    return new Map();
  }
})();

/**
 * Newest first: year descending, then the order of entries in
 * publications.yaml. getCollection() does not guarantee order (the dev data
 * store keeps old positions when the file changes), so the YAML order is read
 * directly. Ids missing from the YAML keep their incoming order, after the rest.
 * Returns a new array.
 */
export function sortPubs<T extends PubLike>(pubs: readonly T[]): T[] {
  const pos = (id: string) => YAML_ORDER.get(id) ?? Number.MAX_SAFE_INTEGER;
  return pubs
    .map((pub, i) => ({ pub, i }))
    .sort((a, b) => b.pub.data.year - a.pub.data.year || pos(a.pub.id) - pos(b.pub.id) || a.i - b.i)
    .map((x) => x.pub);
}

/**
 * Sample-style numbers for a full publication list: the oldest entry is 1,
 * the newest is the count of CV entries. Entries with inCv false are extras:
 * they get no number, so the highest id always matches the CV count.
 * Pass the result to PubList as `numbers` when you render a subset and want
 * ids to match the full list.
 */
export function pubNumbers<T extends PubLike>(pubs: readonly T[]): Map<string, number> {
  const sorted = sortPubs(pubs).filter((p) => p.data.inCv !== false);
  return new Map(sorted.map((p, i) => [p.id, sorted.length - i]));
}

/** "P-036" */
export function pubLabel(n: number): string {
  return `P-${String(n).padStart(3, '0')}`;
}

/** Counts by authorship role for the pubs passed in (filter first if you only want CV items). */
export function pubCounts(pubs: readonly PubLike[]) {
  const first = pubs.filter((p) => p.data.role === 'first').length;
  const jointFirst = pubs.filter((p) => p.data.role === 'joint-first').length;
  return { total: pubs.length, first, jointFirst, firstOrJoint: first + jointFirst };
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
}

export function pmidUrl(pmid: string | number): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

const KIND_LABELS: Record<string, string> = {
  method: 'Method',
  tool: 'Tool',
  pipeline: 'Pipeline',
  webapp: 'Web app',
  hardware: 'Device',
  game: 'Game',
  side: 'Side project',
  failed: 'Did not work',
};

/** Display label for a project kind. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  preprint: 'Preprint',
  chapter: 'Book chapter',
  software: 'Software',
};

/** Display label for a publication type. */
export function pubTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10/2019" to "Oct 2019"; years and words such as "present" pass through. */
export function formatWhen(value: string | number): string {
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = MONTHS[Number(m[1]) - 1];
    return month ? `${month} ${m[2]}` : m[2];
  }
  return s;
}

/** "Oct 2019 – present", "2026 – 2027", or a single value when both ends match or end is missing. */
export function formatRange(start: string | number, end?: string | number | null): string {
  const a = formatWhen(start);
  if (end === undefined || end === null || String(end).trim() === '') return a;
  const b = formatWhen(end);
  return a === b ? a : `${a} – ${b}`;
}

/** Sortable number for "MM/YYYY", a year, or "present" (which sorts last). */
export function whenValue(value: string | number): number {
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return Number(m[2]) * 12 + Number(m[1]);
  const y = s.match(/(\d{4})/);
  if (y) return Number(y[1]) * 12;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Most recent first, for experience, education and grants. Current items
 * (end "present") lead; ties fall back to the start date.
 * getCollection() order is not guaranteed, so sort before rendering.
 */
export function sortByDateDesc<T extends { data: { start: string | number; end: string | number } }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => whenValue(b.data.end) - whenValue(a.data.end) || whenValue(b.data.start) - whenValue(a.data.start),
  );
}

/** Map a free-text project status to a StatusDot state. */
export function statusState(status?: string): 'ok' | 'warn' | 'idle' {
  if (!status) return 'idle';
  // Negatives first, so "Unpublished", "Inactive" or "Not maintained" do not read as ok.
  if (/\b(un\w+|inactive|not\s|no longer|did not)|archiv|retired|deprecated|abandon/i.test(status)) return 'idle';
  // In-progress wording, without catching the finished forms "Validated" and "Reviewed".
  if (/(in validation|validating|progress|develop|review(?!ed)|preprint|beta|pilot|prototype|draft|testing)/i.test(status)) return 'warn';
  if (/(validated|reviewed|live|publish|released|available|stable|active|maintained|shipped|funded)/i.test(status)) return 'ok';
  return 'idle';
}
