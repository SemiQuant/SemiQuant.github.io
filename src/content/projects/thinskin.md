---
title: ThinSkin
kind: side
tagline: Finds the parts of an STL mesh that are thinner than a chosen diameter.
status: Open source
year: 2026
order: 330
links:
  repo: https://github.com/SemiQuant/ThinSkin
  pypi: https://pypi.org/project/thinskin/
tags: [3d-printing]
---

A check for wall thickness and fragile features before 3D printing. For every vertex it estimates the local thickness by ray casting and by curvature, takes the smaller of the two, and flags anything under the threshold. It writes a mesh of the narrow regions, a colored model and an annotated multi-view report.
