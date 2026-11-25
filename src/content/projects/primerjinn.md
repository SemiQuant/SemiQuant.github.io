---
title: primerJinn
kind: method
tagline: Designs multiplex PCR primer sets for amplicon sequencing and runs in silico PCR against input genomes.
status: Published
year: 2023
featured: true
order: 10
detail: true
links:
  repo: https://github.com/SemiQuant/PrimerJinn
  pypi: https://pypi.org/project/primerJinn/
  bioconda: https://anaconda.org/bioconda/primerjinn
  paper: https://doi.org/10.1186/s12859-023-05609-1
publications: [limberis-2023-primerjinn]
cover: ../../assets/projects/primerjinn.png
coverAlt: The primerJinn web app after a pool design, showing the number of amplicons and pools, the annealing temperature, PCR advice and the primer order table.
tags: [primers, pcr, sequencing, tb]
---

## The problem

Multiplex PCR amplifies many targets in one tube, and most targeted sequencing of pathogens starts with it. Even so, few tools exist for designing a whole multiplex primer set.

## What it does

primerJinn has two jobs. It designs a multiplex primer set for the target regions of a FASTA sequence, and it runs in silico PCR on a list of primers against one or many input genomes. It checks primer interactions, has settings for NEB Q5 hot start polymerase, and can add Illumina partial adapters.

A newer designer, `primerjinn-multiplex`, starts from a genome name and a list of positions. It fetches the genome from NCBI, covers every position, matches primers on binding at the annealing temperature, checks specificity across the genome, splits the amplicons into pools and suggests PCR conditions. After a sequencing run it takes the read counts per amplicon, rebalances primer concentrations and redesigns only the amplicons that failed. A local web app does the same as the command line.

## How it performs

In the paper we used primerJinn to design a multiplex PCR for the drug resistance regions of *Mycobacterium tuberculosis*. The amplicons sequenced successfully.

## Status and where to get it

Published in BMC Bioinformatics (2023) and open source under GPL-3.0. Install it with `pip install primerJinn` or from bioconda. A hosted version runs on [DrDx.Me](https://drdx.ucsf.edu/).
