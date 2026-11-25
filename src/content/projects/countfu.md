---
title: CountFU
kind: method
tagline: Counts *Mycobacterium tuberculosis* by qPCR instead of plating colonies, with results the same day.
status: Published
year: 2025
featured: true
order: 70
detail: true
links:
  web: https://drdx.ucsf.edu/CountFU.html
  paper: https://doi.org/10.1016/j.tube.2025.102709
publications: [limberis-2025-countfu]
stats:
  - label: Hands-on time for plating, over 3 to 4 days
    value: 3 h
  - label: Agreement with plating (ICC)
    value: "0.92"
  - label: Bias
    value: 0.08 log10 CFU/ml
tags: [qpcr, tb]
---

## The problem

Counting colony-forming units (CFU) is how most labs measure how many *Mycobacterium tuberculosis* are in a sample. Plating costs three hours of hands-on work spread over 3 to 4 days, then about a month of incubation, and plates get contaminated. qPCR is faster, but DNA extraction from *M. tuberculosis* has been slow enough that few researchers use it for this.

## What it does

CountFU is a qPCR assay that replaces plating. Samples are heat inactivated, bead beaten, spun down, and the supernatant goes straight into a qPCR for *atpE*, an essential gene with one copy per genome. A genomic DNA standard curve in each run converts the result to an expected CFU count.

## How it performs

We collected samples from researchers who were plating tissue from infected mice, across different strains, media, plate types and homogenization methods. CountFU agreed closely with their CFU counts (intraclass correlation 0.92, 95% CI 0.88 to 0.95), with a bias of 0.08 log10 CFU/ml toward overcounting.

It has limits. qPCR may count dead bacteria, so it needs validation where the number of dead bacteria differs a lot between conditions. We have only tested it on tissue samples.

## Status and where to get it

Published in Tuberculosis (2025). The CountFU page on DrDx.Me has plate templates, turns exported qPCR results into counts, and links to an Opentrons protocol generator.
