---
title: hissPCR
kind: method
tagline: Overlapping amplicons with Illumina indexes and adapters, generated in a single tube.
status: Published
year: 2023
order: 50
detail: true
links:
  repo: https://github.com/SemiQuant/hissPCR
  web: https://drdx.ucsf.edu/hissPCR_design.html
  paper: https://doi.org/10.1371/journal.pone.0288687
  protocol: https://www.protocols.io/view/hisspcr-a-simple-single-tube-overlapping-amplicon-q26g7yw79gwz/v1
publications: [limberis-2023-hisspcr]
cover: ../../assets/projects/hisspcr.png
coverAlt: Predicted hairpin structure of a hissPCR inner amplicon at 65 degrees Celsius, a long stem with a loop at one end, colored by equilibrium probability.
tags: [pcr, sequencing, illumina, primers]
---

## The problem

Targeted amplicon sequencing is used to identify pathogens, resistance mutations and strain types when diagnosing and treating infections. Illumina reads are short, so many applications split a limited clinical sample between two reactions to cover one target.

## What it does

hissPCR (hairpin Illumina single-tube sequencing PCR) generates overlapping amplicons in a single tube, each carrying Illumina indexes and adapters. This extends the effective Illumina read length while keeping reagent and sample input the same.

The repository has two parts. The primer designer takes a template sequence, the start and end of the region of interest and the Illumina read length, and returns primers for the reaction. It can also calculate the hairpin structure of the inner amplicon, which takes a while. The analysis script takes paired FASTQ files, a reference and a BED file of primer positions, trims the primers so they do not interfere with variant calling, plots the data and calls variants.

## Status and where to get it

Published in PLOS ONE (2023). The step-by-step protocol is on protocols.io, the code is on GitHub, and the primer designer also runs on DrDx.Me. [stilPCR](/software/stilpcr/) is the later hemi-nested design.
