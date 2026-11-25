# semiquant.com

Source for [semiquant.com](https://semiquant.com), the research site of Jason D. Limberis. It is a static site built with [Astro](https://astro.build) and published to GitHub Pages.

## Local development

Needs Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev      # http://127.0.0.1:4321
npm run build    # writes dist/
npm run preview  # serves dist/
```

Content lives in three places:

- `src/data/publications.yaml`, `src/data/grants.yaml` and `src/data/cv.yaml`: publications, funded projects and the CV sections.
- `src/content/projects/*.md`: methods, software, side projects and things that did not work.
- `src/content/builds/*.md`: lab builds. Photos go in `src/assets/builds/`, clips in `public/video/`.

`src/data/profile.ts` holds the name, affiliation, links, navigation and metrics.

## Add a publication

```sh
npm run pubs:add -- <doi>            # add --dry-run to preview
npm run pubs:add -- <doi> --not-in-cv
npm run pubs:enrich                  # report missing DOIs and PMIDs
```

The entry is written to the top of `src/data/publications.yaml` from Crossref and PubMed. Check the title, the `role` field (`first`, `joint-first` or `middle`) and the tags, then run `npm run audit`. If the CV count changed, update `CV_COUNTS` in `src/pages/publications.astro`.

## Regenerate data from the CV

`cv.yaml` and `grants.yaml` are generated from a private `cv.html`, which is never committed (it is in `.gitignore`). Edit the CV, then:

```sh
CV_SRC=/path/to/cv.html npm run cv:extract
git diff src/data
```

The script reads only the public sections. It leaves out the contact block, the profile text and the references. It also puts prose in American spelling and marks species and gene names for italics. Both tables are at the top of `scripts/extract-cv.mjs`.

## Regenerate the CV PDF

The PDF at `public/files/Jason-Limberis-CV.pdf` is printed from the `/cv/` page with headless Chrome.

```sh
npm run build
npx astro preview --port 4322 --host 127.0.0.1 &
npm run cv:pdf -- http://127.0.0.1:4322
```

Stop the preview, read the PDF, then build again so `dist/` picks it up. Set `CHROME` if Chrome is not in the default macOS location.

## Checks

```sh
npm run verify
```

This runs the type check, the build, the route and privacy guard, the content audit, the copy lint and the internal link check, in that order. The same steps run in CI. Each one can be run alone: `npm run check`, `npm run guard`, `npm run audit`, `npm run lint:copy`, `npm run links`. `npm run links:external` also checks outbound links.

The guard reads PDFs with `pdftotext` (poppler). CI runs it with `--strict-pdf`.

`npm run icons` and `npm run og` rebuild the favicons and the social card. `og` needs Chrome.

## Reserved paths

Some repositories under github.com/SemiQuant publish their own Pages site, and those sites share this domain (`semiquant.com/<repo>/`). No page here and no entry in `public/` may use one of those names, in any letter case:

`PPE`, `who-catalogue-tool`, `floJAY`, `SpringSmith`, `RNAseq_pipeline`

The list is `reservedPaths` in `src/data/profile.ts`. Add a name there when a new project site goes live. The guard and the build both fail on a collision.

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`. It runs the checks, builds the site and deploys it to GitHub Pages. Pull requests and other branches run the checks only (`.github/workflows/ci.yml`).

In the repository settings, Pages must use "GitHub Actions" as its source.
