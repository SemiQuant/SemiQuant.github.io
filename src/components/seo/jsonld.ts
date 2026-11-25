/**
 * JSON-LD builders. Pass the result to the layout's `jsonLd` prop, e.g.
 *   <Base jsonLd={[personJsonLd(), websiteJsonLd()]}>
 */
import type { CollectionEntry } from 'astro:content';
import { profile } from '../../data/profile';

export type JsonLd = Record<string, unknown>;

export const SITE_URL = 'https://semiquant.com/';
export const PERSON_ID = `${SITE_URL}#person`;
export const WEBSITE_ID = `${SITE_URL}#website`;

const CONTEXT = 'https://schema.org';

/** Absolute URL for a root-relative path. Absolute URLs pass through. */
export const absoluteUrl = (path: string): string => new URL(path, SITE_URL).href;

/** Remove the *asterisk* italics markers used in titles. */
export const stripMarkers = (text: string): string => text.replace(/\*/g, '');

/** Drop keys whose value is undefined, null, an empty string or an empty array. */
function clean<T extends JsonLd>(obj: T): T {
  const out: JsonLd = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

const personRef = (): JsonLd => ({ '@type': 'Person', '@id': PERSON_ID, name: profile.name });

/**
 * schema.org Person for the site owner.
 * `image` is only emitted when profile.headshot is set; pass the built image
 * URL (for example from getImage) to override the raw path.
 */
export function personJsonLd(opts: { image?: string } = {}): JsonLd {
  const image = profile.headshot ? absoluteUrl(opts.image ?? profile.headshot) : undefined;
  return clean({
    '@context': CONTEXT,
    '@type': 'Person',
    '@id': PERSON_ID,
    name: profile.name,
    alternateName: profile.brand,
    jobTitle: profile.affiliation.title,
    description: `${profile.role} at ${profile.affiliation.orgShort}.`,
    affiliation: {
      '@type': 'Organization',
      name: profile.affiliation.org,
      alternateName: profile.affiliation.orgShort,
      department: { '@type': 'Organization', name: profile.affiliation.unit },
    },
    url: SITE_URL,
    email: `mailto:${profile.email}`,
    image,
    sameAs: profile.links.map((l) => l.url),
    knowsAbout: [...profile.focus],
  });
}

export function websiteJsonLd(): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: profile.name,
    alternateName: profile.brand,
    inLanguage: 'en',
    author: { '@id': PERSON_ID },
    publisher: { '@id': PERSON_ID },
  };
}

const NOT_A_NAME = /^(et al\.?|…|\.\.\.)$/i;

function authorList(authors: readonly string[]): JsonLd[] {
  return authors
    .map((a) => a.replace(/[*†‡§#]+/g, '').trim())
    .filter((a) => a && !NOT_A_NAME.test(a))
    .map((a) => (/^Limberis\s+J/i.test(a) ? personRef() : { '@type': 'Person', name: a }));
}

const PUB_TYPE: Record<CollectionEntry<'publications'>['data']['type'], string> = {
  article: 'ScholarlyArticle',
  preprint: 'ScholarlyArticle',
  chapter: 'Chapter',
  software: 'SoftwareSourceCode',
};

/** One publication as a schema.org node (no @context). */
export function publicationNode(pub: CollectionEntry<'publications'>): JsonLd {
  const d = pub.data;
  const doiUrl = d.doi ? `https://doi.org/${d.doi}` : undefined;
  const pmidUrl = d.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${d.pmid}/` : undefined;
  const sameAs = [doiUrl, pmidUrl, d.url].filter((u): u is string => Boolean(u));
  const container = d.type === 'chapter' ? 'Book' : d.type === 'software' ? undefined : 'Periodical';
  return clean({
    '@type': PUB_TYPE[d.type],
    name: stripMarkers(d.title),
    headline: d.type === 'article' || d.type === 'preprint' ? stripMarkers(d.title) : undefined,
    author: authorList(d.authors),
    datePublished: String(d.year),
    isPartOf: d.journal && container ? { '@type': container, name: d.journal } : undefined,
    publisher: d.journal && !container ? { '@type': 'Organization', name: d.journal } : undefined,
    identifier: d.doi ? { '@type': 'PropertyValue', propertyID: 'DOI', value: d.doi } : undefined,
    url: sameAs[0],
    sameAs,
  });
}

/** ItemList of publications, in the order given. */
export function publicationsJsonLd(pubs: CollectionEntry<'publications'>[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name: `Publications by ${profile.name}`,
    numberOfItems: pubs.length,
    itemListElement: pubs.map((pub, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: publicationNode(pub),
    })),
  };
}

const APP_KINDS = new Set<CollectionEntry<'projects'>['data']['kind']>(['webapp', 'game']);

/**
 * SoftwareSourceCode for a project with a repo, SoftwareApplication for web
 * apps, games and projects without one. Pass the resolved publication entries
 * to add them as citations.
 */
export function softwareJsonLd(
  project: CollectionEntry<'projects'>,
  pubs: CollectionEntry<'publications'>[] = [],
): JsonLd {
  const d = project.data;
  const links = d.links;
  const isApp = APP_KINDS.has(d.kind) || !links.repo;
  const page = d.detail ? absoluteUrl(`/software/${project.id}/`) : undefined;
  const url = page ?? links.web ?? links.repo ?? links.appstore ?? links.pypi ?? links.bioconda;
  const sameAs = [links.repo, links.web, links.pypi, links.bioconda, links.appstore, links.protocol].filter(
    (u): u is string => Boolean(u) && u !== url,
  );
  return clean({
    '@context': CONTEXT,
    '@type': isApp ? 'SoftwareApplication' : 'SoftwareSourceCode',
    name: d.title,
    description: d.tagline,
    url,
    codeRepository: isApp ? undefined : links.repo,
    installUrl: isApp ? links.appstore : undefined,
    applicationCategory: isApp ? (d.kind === 'game' ? 'GameApplication' : 'WebApplication') : undefined,
    author: personRef(),
    keywords: d.tags.join(', '),
    sameAs,
    citation: pubs.map(publicationNode),
  });
}

/** Breadcrumb trail. `href` may be root-relative; the last item is the current page. */
export function breadcrumbJsonLd(items: { name: string; href: string }[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}
