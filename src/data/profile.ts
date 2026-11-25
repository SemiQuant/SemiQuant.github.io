/** Hand-edited profile facts used across the site. */
export const profile = {
  name: 'Jason D. Limberis',
  shortName: 'Jason Limberis',
  brand: 'SemiQuant',
  role: 'Infectious disease researcher',
  focus: ['Molecular diagnostics', 'Mycobacterium tuberculosis genomics', 'Computational biology'],
  affiliation: {
    title: 'Assistant Researcher',
    unit: 'Division of Pulmonary and Critical Care Medicine',
    org: 'University of California, San Francisco',
    orgShort: 'UCSF',
  },
  location: 'San Francisco, California',
  email: 'JasonLimberis@gmail.com',
  /** Typed by hand from the CV. Publication counts are computed from data. */
  metrics: { hIndex: 16, citations: 1507, asOf: '2026-10' },
  /** Optional: path under src/assets, or null for no photo. */
  headshot: null as string | null,
  links: [
    { label: 'GitHub', url: 'https://github.com/SemiQuant', me: true },
    { label: 'PubMed', url: 'https://www.ncbi.nlm.nih.gov/myncbi/jason.limberis.2/bibliography/public/', me: false },
    { label: 'protocols.io', url: 'https://www.protocols.io/researchers/jason-limberis1', me: true },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/jason-limberis-aba448144/', me: true },
    { label: 'ResearchGate', url: 'https://www.researchgate.net/profile/Jason_Limberis', me: true },
    { label: 'DrDx.Me', url: 'https://drdx.ucsf.edu/', me: false },
    // Add when available:
    // { label: 'ORCID', url: 'https://orcid.org/0000-0000-0000-0000', me: true },
    // { label: 'Google Scholar', url: 'https://scholar.google.com/citations?user=', me: true },
  ],
  cvPdf: '/files/Jason-Limberis-CV.pdf',
} as const;

export const nav = [
  { label: 'Research', href: '/research/' },
  { label: 'Methods & software', href: '/software/' },
  { label: 'Publications', href: '/publications/' },
  { label: 'Builds', href: '/builds/' },
  { label: 'Side projects', href: '/side-projects/' },
  { label: 'CV', href: '/cv/' },
  { label: 'Contact', href: '/contact/' },
] as const;

/**
 * Repos under github.com/SemiQuant that publish their own Pages site.
 * They are served from semiquant.com/<name>/, so no route here may use
 * these names (compared case-insensitively). Add new ones as they appear.
 */
export const reservedPaths = ['PPE', 'who-catalogue-tool', 'floJAY', 'SpringSmith', 'RNAseq_pipeline'] as const;
