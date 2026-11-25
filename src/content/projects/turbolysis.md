---
title: turboLysis
kind: hardware
tagline: "A $40 device that lyses *Mycobacterium tuberculosis*. Commercial bead beaters cost more than $2,000."
status: In validation
year: 2024
featured: true
order: 60
detail: true
links:
  paper: https://doi.org/10.1016/j.ohx.2024.e00576
publications: [limberis-2024-turbolysis]
grant: gates-turbolysis
stats:
  - label: First build
    value: "$40"
  - label: Commercial bead beaters
    value: "$2,000+"
  - label: Second build, cost to produce
    value: "$12.50"
tags: [hardware, tb, 3d-printing]
---

## The problem

*Mycobacterium tuberculosis* has a sturdy cell wall, and getting DNA out of it usually means bead beating. Commercial bead beaters cost more than $2,000, and no instrument existed at the price the problem allows. So we built one.

## What it does

turboLysis is a small mechanical lysis device that uses small beads to break open tough cells such as *Mycobacterium*, *Saccharomyces* and *Arabidopsis*. I designed and built it end to end: the mechanics, which are 3D printed and CNC machined, the PCB, the firmware and the lysis chemistry. The first build costs $40.

## How it performs

We compared turboLysis with a BeadBug 6 across *M. tuberculosis* concentrations in the range seen in patient samples. It performed similarly at low bacterial loads and outperformed the commercial bead beater at high ones, above 200,000 CFU/ml (p < 0.005).

## The second build

A Gates Grand Challenges grant funds the current build. It is fully automated and battery-powered, heats the sample to render it biosafe before lysis, and costs $12.50 to produce. A new lysis buffer that removes PCR inhibitors was developed alongside it.

## Status and where to get it

The first build is published as open hardware in HardwareX (2024). The second build is in validation against commercial bead beating by qPCR, TapeStation, multiplex PCR with nanopore sequencing and Deeplex Myc-TB on Illumina. It is also being evaluated on sputum in parallel with the TSELiOT trial workflow.
