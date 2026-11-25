import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// User site at SemiQuant.github.io, served from the apex domain.
// Project Pages repos share this origin (semiquant.com/<repo>/), so their
// names are reserved: see scripts/guard.mjs.
export default defineConfig({
  site: 'https://semiquant.com',
  trailingSlash: 'always',
  integrations: [sitemap()],
  // Keep whitespace between inline elements (author lists, citations).
  compressHTML: false,
});
