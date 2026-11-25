---
title: genoSubSampler
kind: tool
tagline: Subsamples paired-end FASTQ files to fit under a file size limit.
status: Open source
year: 2026
order: 160
links:
  repo: https://github.com/SemiQuant/genoSubSampler
tags: [sequencing, tb]
---

Useful when a platform caps upload size. It reduces paired-end FASTQ files to a set size while keeping the read pairs intact, can first filter for reads that align to *Mycobacterium tuberculosis*, and writes a summary of read counts and retention. A fixed seed makes the subsampling reproducible.
