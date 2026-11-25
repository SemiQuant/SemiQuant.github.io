---
title: stilPCR
kind: method
tagline: Raises the effective read length of Illumina targeted sequencing, in one tube.
status: Published
year: 2024
featured: true
order: 40
detail: true
links:
  repo: https://github.com/SemiQuant/stilPCR
  web: https://drdx.ucsf.edu/stilPCR.html
  paper: https://doi.org/10.1371/journal.pone.0314265
publications: [limberis-2024-stilpcr]
tags: [pcr, sequencing, illumina, tb]
---

## The problem

Targeted amplicon sequencing identifies pathogens, resistance mutations and strain types. Illumina reads are short, so many applications have to divide a limited clinical sample between reactions to cover one target.

## What it does

stilPCR (single-tube Illumina long read PCR) generates hemi-nested amplicons in a single tube, with Illumina indexes and adapters already attached. The effective read length goes up, and the reaction needs no more reagent or sample than before.

The repository holds the analysis pipeline. It takes paired FASTQ files, a reference and a BED file of primer positions, trims the primer sequences so they do not interfere with variant calling, plots the data and calls variants.

## How it performs

We used stilPCR on clinical sputum from tuberculosis patients to detect drug resistance mutations.

## Status and where to get it

Published in PLOS ONE (2024), with co-authors at Cepheid and Stellenbosch University. The analysis code is on GitHub, and the same pipeline runs on DrDx.Me: upload paired FASTQ files and pick the assay.

stilPCR follows [hissPCR](/software/hisspcr/), an earlier single-tube design that used overlapping amplicons.
