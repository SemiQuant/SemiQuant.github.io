---
title: XpertNano
kind: method
tagline: Extraction, amplification, UMI tagging and nanopore library preparation inside a GeneXpert cartridge.
status: In development
year: 2023
featured: true
order: 80
detail: true
links:
  paper: https://doi.org/10.5588/ijtldopen.24.0124
publications: [limberis-2024-cartridge]
grant: nih-xpertnano
stats:
  - label: Hands-on time (target)
    value: 15 min
  - label: Depth (target)
    value: 1000x or more
  - label: Accuracy against whole-genome sequencing (target)
    value: 99% or more
tags: [sequencing, nanopore, umi, tb]
---

## The problem

Sequencing can read whole resistance genes, which a drug such as bedaquiline needs because its resistance variants are spread out. But extracting DNA from sputum is hard, and conventional library preparation takes many enzymatic steps, expensive equipment and skilled technicians. Both make sequencing costly and impractical in many settings.

## What it does

XpertNano moves extraction, amplification, UMI tagging and nanopore library preparation into a GeneXpert cartridge. GeneXpert runs in 182 countries, so the instruments are already in place.

## Targets

The project aims for 15 minutes of hands-on time, at least 1000x depth and at least 99% accuracy relative to whole-genome sequencing, with a pilot across South Africa.

## What we have shown so far

We have sequenced bedaquiline resistance genes from sputum on a cartridge workflow (IJTLD Open, 2024). A single in-cartridge PCR amplified full-length *rv0678* and *atpE* and added Illumina indexes and adapters, which removed more than 90% of the hands-on steps of the conventional workflow. All ten clinical sputum samples gave more than 1,000x coverage, enough to call variants at every position. The one sample with known phenotypic bedaquiline resistance carried a duplication of about 60 bp in *rv0678*.

## Status

In development. The work is funded by a National Institutes of Health R01 (2023 to 2028) and runs in collaboration with Cepheid. I am the laboratory lead: designing, optimizing and validating the sequencing strategies.
