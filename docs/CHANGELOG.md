# Changelog

> Timestamped ledger of development decisions for research transparency

This document serves as a pre-registration mechanism. By recording hypotheses, design decisions, and rationale *before* running experiments, we establish that our conclusions follow from a priori reasoning rather than post-hoc rationalization.

--

## 2025-01-14 - Initial Framework

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
|----|------|------|
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
1. **Coverage.branches** - Primary objective (smoothest available)
2. **SonarQube severity counts** - Constraints via ceilings (not objectives)
3. **Dependency impact** - Weighting metric (focuses effort)

This is a *design choice*, not a claim of optimality. We explicitly note that alternative topologies may perform better and warrant future investigation.

--

## 2025-01-21 - Experiment Infrastructure

### What Changed
- Added complete experiment infrastructure for validating hypotheses H1-H12
- New `src/experiments/` module with:
  - `types.ts`: Type definitions for experiments, trajectories, and statistical tests
  - `logger.ts`: Crash-resilient trajectory logging with JSONL streaming
  - `stats.ts`: Statistical functions (t-test, Spearman correlation, chi-squared)
  - `analyzer.ts`: Hypothesis analysis for all 12 pre-registered hypotheses
  - `visualize.ts`: ASCII visualization (sparklines, box plots, result tables)
- Added 45 new tests for experiment infrastructure

### Modules Created

| Module | Purpose |
|--------|---------|
| `types.ts` | Experiment, trajectory, and statistical test types |
| `logger.ts` | `startExperimentRun()`, `logIteration()`, `endExperimentRun()` |
| `stats.ts` | `tTest()`, `spearmanCorrelation()`, `chiSquaredTest()`, `describe()` |
| `analyzer.ts` | `analyzeBatch()` for H1-H12 validation |
| `visualize.ts` | `sparkline()`, `boxPlot()`, `visualizeResults()` |

### Rationale (A Priori)
Before running validation experiments, we need robust infrastructure to:
1. **Log trajectories** - Record every iteration for reproducibility
2. **Compute statistics** - Validate hypotheses with standard tests
3. **Visualize results** - Present findings clearly for the paper

The infrastructure is designed to support the 6 experimental designs (A-F) documented in `docs/PREREG.md`.

### Statistical Tests Implemented
- **Welch's t-test**: For comparing means between conditions (H1, H7, H11)
- **Paired t-test**: For within-subject comparisons (same task, different conditions)
- **Spearman correlation**: For H4, H5, H6, H9 (non-linear relationships)
- **Chi-squared test**: For H2, H10 (comparing success rates)
- **Cohen's d**: Effect size for all comparisons
- **95% CIs**: Confidence intervals via Fisher's z or t-distribution

--

## 2025-01-21 - Test Coverage Threshold Achieved

### What Changed
- Added comprehensive tests across 14 test files (+2,987 lines)
- Branch coverage improved from 89.54% to 90.17%, meeting 90% threshold
- Commit: `3ab40ea`

### Coverage Achieved
| Metric | Before | After |
|--------|--------|-------|
| Branches | 89.54% | 90.17% |

### New Test Coverage Areas
- `aggregate.test.ts`: All-symbols-have-parents case, aggregation scenarios
- `call-graph.test.ts`: Constructor calls, dynamic methods, fallback resolution
- `cache.test.ts`: Cache expiry, validation, persistence edge cases
- `config.test.ts`: Config loading, environment variable handling
- `custom.test.ts`: Custom dimension evaluation edge cases
- `dependency-graph.test.ts`: `@/` alias import resolution
- `extract.test.ts`: Symbol extraction corner cases, coverage data handling
- `fitness.test.ts`: Metric computation scenarios
- `mapper.test.ts`: Column-based symbol resolution, path matching heuristics
- `optimizer.test.ts`: Statements fallback when branches undefined
- `rules.test.ts`: Rule configuration parsing and validation
- `severity.test.ts`: Partial path matching by last segment
- `table.test.ts`: `mergeSymbolTables` byFile/lineIndex handling
- `trajectory.test.ts`: Converged/stagnating state classification

### Rationale (A Priori)
High branch coverage ensures the quality gate system itself meets the quality standards it enforces. The 90% threshold provides confidence that edge cases and error handling paths are exercised, reducing the risk of false positives/negatives in quality evaluations.

--

## 2025-01-20 - Documentation Completeness

### What Changed
- Achieved bijective completeness between markdown theory docs and LaTeX paper
- Updated `docs/theory/DIFFERENTIABILITY.md` with new sections:
  - Section 6: Symbol Tables and O(1) Location Mapping
  - Section 7: Call Graph Weighting (Eq 2: ΔQ_weighted)
  - Section 8: Fixability Estimation (Eq 3: ΔQ_adj)
  - Renumbered subsequent sections (9-13)
- Updated `docs/theory/CLAIMS.md` with new claim sections:
  - Section 3.6: Symbol Tables and O(1) Location Mapping
  - Section 3.7: Call Graph Weighting (H7, H8)
  - Section 3.8: Fixability Estimation (H9-H12)
  - Added H7-H12 to validation experiments table
- Updated `docs/PREREG.md` with experimental designs D, E, F for RQ8-RQ10

### Rationale (A Priori)
All theoretical concepts must be documented in both the paper and the markdown documentation to ensure:
1. Reproducibility - future researchers can understand the full theory
2. Transparency - claims are explicitly enumerated with validation requirements
3. Pre-registration - hypotheses are recorded before experiments

### Hypotheses Added
- H7: Call graph in-degree weighting reduces iterations-to-pass
- H8: Weighted prioritization yields higher monotonic improvement rate
- H9: LLM fixability scores correlate with actual fix success (Spearman ρ > 0.5)
- H10: High-fixability symbols (φ > 0.7) have higher fix success rate
- H11: Adjusted ΔQ (ΔQ_adj = ΔQ_weighted × φ) outperforms raw ΔQ
- H12: Adjusted prioritization reduces wasted iterations

--

## 2025-01-20 - Test Infrastructure and Cache Improvements

### What Changed
- Added comprehensive test suite with 567 tests covering all major modules
- Improved `isCacheValid` to re-extract metrics when floor metrics were previously missing
- Added `check-coverage.sh` script for CI integration
- Fixed lint errors across test files
- Commits: `706cfa2`, `8d960db`

### Coverage Achieved
| Metric | Coverage |
|--------|----------|
| Statements | 88.82% |
| Branches | 80.48% |
| Functions | 93.14% |
| Lines | 89.22% |

### Rationale (A Priori)
Cache invalidation when floor metrics are missing addresses a real-world scenario: initial runs may fail to connect to SonarQube or other metric sources. Without this fix, the cache would permanently mark the evaluation as failed even after the metric source becomes available.

### Modules Tested
- `cache.ts` - Cache read/write operations
- `config.ts` - Configuration loading and environment handling
- `metrics.ts` - All metric extraction (coverage, TypeScript, ESLint, SonarQube)
- `rules.ts` - Rule evaluation, hash computation, cache validation
- `optimizer.ts` - Priority scoring and file ranking
- `fitness.ts` - Fitness function computation
- `severity.ts` - Severity weight calculations
- `trajectory.ts` - Quality score trajectories and sparklines
- `symbols/*` - Symbol extraction, call graphs, tables
- `targets/*` - Issue extraction, aggregation, formatting
- `dimensions/*` - Custom dimension registration and building

--

## 2025-01-19 - Unified Symbol Addressing and Fixability Estimation

### What Changed
- Added unified symbol addressing system for precise code targeting
- Implemented fixability estimation via LLM analysis
- Enhanced symbol table with call graph statistics
- Commit: `706cfa2`

### Rationale (A Priori)
Symbol-level addressing enables finer-grained gradient descent. Instead of file-level "fix this file", we can specify "fix function X at line Y". This improves local continuity by making the optimization surface smoother - small changes to specific symbols yield proportionally small changes in quality metrics.

### Hypotheses

**H1 (Symbol Granularity):** Symbol-level targeting will reduce fix iteration cycles compared to file-level targeting because:
1. Smaller change surface reduces risk of introducing new issues
2. More precise feedback loop enables faster convergence

**H2 (Call Graph Weighting):** Prioritizing symbols by call graph in-degree will improve convergence rate because:
1. High in-degree symbols affect more dependent code
2. Fixing central symbols has multiplicative quality impact
3. Prediction: $\tau_{\text{weighted}} < \tau_{\text{unweighted}}$

**H3 (Fixability Estimation):** LLM-estimated fixability scores will correlate with actual fix success rates because:
1. Code complexity is visible to the LLM
2. Issue interdependence can be inferred from context
3. Prediction: Spearman $\rho > 0.5$ between $\phi(t)$ and observed fix rate

**H4 (Adjusted Prioritization):** Using $\Delta Q_{\text{adj}} = \Delta Q \cdot \phi(t)$ will outperform raw $\Delta Q$ for prioritization because:
1. It deprioritizes high-value but low-fixability targets
2. Reduces wasted iterations on intractable issues
3. Prediction: $\mathbb{E}[\tau_{\text{adj}}] < \mathbb{E}[\tau_{\text{raw}}]$

--

## Format for Future Entries

```markdown
## YYYY-MM-DD - Title

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

--

*This changelog is part of our commitment to open science and pre-registration.*
