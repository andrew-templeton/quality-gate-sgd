# Changelog

> Timestamped ledger of development decisions for research transparency

This document serves as a pre-registration mechanism. By recording hypotheses, design decisions, and rationale *before* running experiments, we establish that our conclusions follow from a priori reasoning rather than post-hoc rationalization.

---

## 2025-01-14 — Initial Framework

### Package Creation
- Created `quality-gate-sgd` npm package from portable quality gate infrastructure
- Core functionality: floors, ceilings, monotonic rules, SonarQube integration
- Commit: `5b44d4a`

### Theoretical Framework Established
- **Core insight**: Deterministic gates + stochastic agents = descent behavior
- **Three properties required**: Quantitative, Deterministic, Locally Continuous
- **Key separation**: Quality Geometry (abstract) vs Quality Topology (instantiation)

### Metric Classification (A Priori)
Before running any experiments, we classify metrics by SGD suitability:

| Metric | SGD Grade | Rationale |
|--------|-----------|-----------|
| coverage.lines | A | Smooth (N≈3000) |
| coverage.branches | B+ | Good granularity (N≈200) |
| sonarqube.codeSmells | B- | Moderate (N≈100) |
| sonarqube.blocker | D- | Cliff-like (N≈0-3) |

**Hypothesis stated before experiments**: Coverage % metrics will show smoother descent curves than severity count metrics.

### Per-SLOC Normalization (A Priori Hypothesis)
We hypothesize that normalizing discrete counts to per-kSLOC densities will improve local continuity:
- `bugs_per_ksloc = bugs / (sloc / 1000)`

**Prediction**: Normalized metrics will show smoother trajectory curves than raw counts.

### Topology Selection Rationale
Our chosen topology prioritizes:
1. **Coverage.branches** — Primary objective (smoothest available)
2. **SonarQube severity counts** — Constraints via ceilings (not objectives)
3. **Dependency impact** — Weighting metric (focuses effort)

This is a *design choice*, not a claim of optimality. We explicitly note that alternative topologies may perform better and warrant future investigation.

---

## Format for Future Entries

```markdown
## YYYY-MM-DD — Title

### What Changed
- Description of change
- Commit hash if applicable

### Rationale (A Priori)
Why we made this decision *before* seeing results.

### Hypothesis
What we predict will happen, stated before experiments.

### Observations (Post Hoc)
What we actually observed. Clearly marked as after-the-fact.
```

---

*This changelog is part of our commitment to open science and pre-registration.*
