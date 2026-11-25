---
title: spotPCR
kind: method
tagline: Tags individual template molecules with unique molecular identifiers in a single nested PCR.
status: Preprint
year: 2024
featured: true
order: 30
detail: true
links:
  repo: https://github.com/SemiQuant/spotPCR
  web: https://drdx.ucsf.edu/spotPCR.html
  paper: https://doi.org/10.1101/2024.12.11.627791
publications: [limberis-2024-spotpcr]
tags: [umi, pcr, sequencing]
---

## The problem

Low-frequency mutations matter for drug resistance, cancer and infectious disease research. Tagging each template molecule with a unique molecular identifier (UMI) before deep sequencing makes mutation detection more sensitive and more specific. Conventional UMI workflows pay for that with several labor-intensive steps: ligation, cleanup and exonuclease digestion.

## What it does

spotPCR (Specific Primer Limited Unique Molecular Identifier Tagging PCR) tags individual template molecules with UMIs in a single nested PCR. The ligation, cleanup and digestion steps are no longer needed.

The repository holds the analysis side. One script identifies the UMIs, aligns the reads, deduplicates them and calls variants, using bwa, UMI-tools and freebayes. A second script summarizes UMI counts across a whole sample set. Example data and expected outputs are included.

## Status and where to get it

Preprint on bioRxiv (2024), written with colleagues at Cepheid. The analysis code is on GitHub. If you would rather not install anything, upload a reference FASTA and your FASTQ files to the spotPCR tool on DrDx.Me.
