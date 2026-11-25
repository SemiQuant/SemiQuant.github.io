import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';

/** Load one top-level key of src/data/cv.yaml as a collection. */
const cvSection = (key: string) =>
  file('src/data/cv.yaml', {
    parser: (text) => (parseYaml(text)?.[key] ?? []) as Record<string, unknown>[],
  });

const url = z.url();

const publications = defineCollection({
  loader: file('src/data/publications.yaml'),
  schema: z.object({
    /** Stable slug, e.g. "limberis-2024-turbolysis". */
    id: z.string(),
    type: z.enum(['article', 'preprint', 'chapter', 'software']),
    /** Verbatim title. Wrap species and gene names in *asterisks* for italics. */
    title: z.string(),
    /** Authors in citation order, e.g. "Limberis JD". May include "et al." or "…". */
    authors: z.array(z.string()).min(1),
    role: z.enum(['first', 'joint-first', 'middle']),
    journal: z.string().optional(),
    year: z.number().int(),
    /** Volume, issue and pages as printed, e.g. "19:e00576". */
    citation: z.string().optional(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
    /** Link of last resort when there is no DOI or PMID. */
    url: url.optional(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    /** False for items shown on the site but not in the CV list. */
    inCv: z.boolean().default(true),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      kind: z.enum(['method', 'tool', 'pipeline', 'webapp', 'hardware', 'game', 'side', 'failed']),
      /** One sentence, shown on cards. */
      tagline: z.string(),
      /** Short status label, e.g. "Published", "In validation", "Live". */
      status: z.string().optional(),
      year: z.number().int().optional(),
      featured: z.boolean().default(false),
      /** Lower sorts first. */
      order: z.number().default(100),
      /** True for flagships that get a page at /software/<slug>/. */
      detail: z.boolean().default(false),
      links: z
        .object({
          repo: url.optional(),
          web: url.optional(),
          pypi: url.optional(),
          bioconda: url.optional(),
          paper: url.optional(),
          protocol: url.optional(),
          video: url.optional(),
          appstore: url.optional(),
        })
        .default({}),
      publications: z.array(reference('publications')).default([]),
      /** Authors in citation order, only when the owner is not the sole author. Used in JSON-LD. */
      authors: z.array(z.string()).optional(),
      grant: reference('grants').optional(),
      stats: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      /** For kind "failed": what was learned. */
      lesson: z.string().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

const builds = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/builds' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      tagline: z.string(),
      /** Approximate build cost as text, e.g. "~$30". */
      cost: z.string().optional(),
      order: z.number().default(100),
      images: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      /** poster: local thumbnail (src/assets/builds/yt-<id>.jpg), so no request goes to YouTube before a click. */
      youtube: z.array(z.object({ id: z.string(), title: z.string(), poster: image() })).default([]),
      /** Self-hosted clips under public/video/. */
      videos: z
        .array(
          z.object({
            src: z.string(),
            poster: z.string().optional(),
            title: z.string(),
            /** Pixel size of the clip, so portrait clips keep their shape. */
            width: z.number().optional(),
            height: z.number().optional(),
          }),
        )
        .default([]),
      links: z.object({ files: url.optional(), repo: url.optional() }).default({}),
    }),
});

const grants = defineCollection({
  loader: file('src/data/grants.yaml'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    funder: z.string(),
    start: z.number().int(),
    end: z.number().int(),
    /** Short role label, e.g. "Laboratory lead". */
    role: z.string(),
    summary: z.string(),
  }),
});

const experience = defineCollection({
  loader: cvSection('experience'),
  schema: z.object({
    id: z.string(),
    role: z.string(),
    org: z.string(),
    place: z.string(),
    start: z.string(),
    end: z.string(),
    points: z.array(z.string()).default([]),
  }),
});

const education = defineCollection({
  loader: cvSection('education'),
  schema: z.object({
    id: z.string(),
    degree: z.string(),
    org: z.string(),
    place: z.string(),
    start: z.string(),
    end: z.string(),
    note: z.string().optional(),
  }),
});

const skills = defineCollection({
  loader: cvSection('skills'),
  schema: z.object({ id: z.string(), label: z.string(), body: z.string() }),
});

const awards = defineCollection({
  loader: cvSection('awards'),
  schema: z.object({ id: z.string(), year: z.number().int(), title: z.string(), org: z.string() }),
});

const training = defineCollection({
  loader: cvSection('training'),
  schema: z.object({ id: z.string(), title: z.string(), provider: z.string() }),
});

const patents = defineCollection({
  loader: cvSection('patents'),
  schema: z.object({
    id: z.string(),
    year: z.number().int(),
    status: z.string(),
    title: z.string(),
    inventors: z.string(),
    detail: z.string(),
    url: url.optional(),
  }),
});

const protocols = defineCollection({
  loader: cvSection('protocols'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    authors: z.string(),
    url: url.optional(),
  }),
});

export const collections = {
  publications,
  projects,
  builds,
  grants,
  experience,
  education,
  skills,
  awards,
  training,
  patents,
  protocols,
};
