---
title: URAdime
kind: method
tagline: Works backwards from sequencing reads and names the primers that generate dimers and super-amplicons.
status: Preprint
year: 2025
featured: true
order: 20
detail: true
links:
  repo: https://github.com/SemiQuant/URAdime
  pypi: https://pypi.org/project/uradime/
  web: https://drdx.ucsf.edu/URAdime.html
  paper: https://doi.org/10.1101/2025.01.25.634870
publications: [limberis-2025-uradime]
tags: [primers, pcr, sequencing]
---

## The problem

Targeted sequencing of multiplex PCR amplicons is routine in research and clinical labs. Many tools optimize primers and reactions before a run. None looked at the reads afterwards to say which primers caused the trouble.

## What it does

URAdime (Universal Read Analysis of DIMErs) works backwards from the sequencing data. Give it a BAM file and a tab-separated primer table. It looks for the primer sequences in each read, checks whether the pair matches and whether the read is the size that pair should give, and reports the dimers and super-amplicons along with the primers that made them.

It tolerates mismatches in the primer sequence, can look only at unaligned reads, can downsample large files, and can write a filtered BAM that keeps only the correctly matched and sized reads. An option ignores amplicon size for short-read data, and overlapping primers such as those in hissPCR are supported.

## How it performs

In the preprint, URAdime detected these unwanted amplicons and attributed them to the specific primers that generated them.

## Status and where to get it

Preprint on bioRxiv (2025). Install the Python package with `pip install uradime` and use it from the command line or as a library, or upload a BAM file to the web server on DrDx.Me.
