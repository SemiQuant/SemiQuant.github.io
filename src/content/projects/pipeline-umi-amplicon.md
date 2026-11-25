---
title: pipeline-umi-amplicon
kind: pipeline
tagline: Generates high-accuracy single-molecule reads from nanopore amplicon data using unique molecular identifiers.
status: Open source
year: 2021
order: 140
links:
  repo: https://github.com/SemiQuant/pipeline-umi-amplicon
publications: [rudd-2020-pipeline-umi-amplicon]
tags: [umi, nanopore, sequencing]
---

Co-authored with Oxford Nanopore Technologies. The pipeline maps nanopore reads to a reference, separates them by amplicon, extracts the UMI from each read, clusters reads that share a UMI and computes a high-accuracy consensus read for each original molecule. Variant calling on the consensus reads is optional.
