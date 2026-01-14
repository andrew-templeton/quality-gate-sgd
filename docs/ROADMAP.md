# Engineering Roadmap

> Implementation plan for quality-gate-sgd

## Current Version: 0.1.1

Package complete with core functionality:
- Quality gate evaluation (floors, ceilings, monotonic)
- SonarQube integration
- Coverage metrics extraction
- Dependency graph analysis
- Priority-based file ranking

### v0.1.1 - Discrete Differentiability ✓

**Goal**: Move beyond priority ordering to actual gradient computation.

- [x] Target-space gradient computation (ΔQ per target)
- [x] Cross-dimension value aggregation
- [x] Location-aware issue extraction from all sources
- [x] Granularity tiers: dimension, file, symbol
- [x] `-quick`, default, `-deep` CLI modes
- [x] Academic documentation (theory/DIFFERENTIABILITY.md)

### Files Added
- `src/targets/types.ts` - LocatedIssue, OptimizationTarget types
- `src/targets/extract.ts` - Issue extraction with locations
- `src/targets/aggregate.ts` - ΔQ computation algorithm
- `src/targets/format.ts` - Output formatting
- `docs/theory/DIFFERENTIABILITY.md` - Theoretical foundation

## v0.2.0 - Trajectory Analysis

**Goal**: Prove descent behavior through cache analysis.

### Features
- [ ] SLOC extraction for metric normalization
- [ ] Per-kSLOC normalized metrics (bugs/kSLOC, smells/kSLOC)
- [ ] Trajectory analysis from cache history
- [ ] Convergence detection
- [ ] `npx quality-gate-sgd trajectory` command

### Files
- `src/trajectory.ts` - Trajectory building and analysis
- `src/metrics.ts` - Add SLOC extraction, normalization

## v0.3.0 - Practical Adoption

**Goal**: Lower adoption barriers.

### Features
- [ ] Zero-config mode (embedded defaults)
- [ ] Coverage-only mode (no SonarQube required)
- [ ] GitHub Action (`action.yml`)
- [ ] Visual CLI output (progress bars, sparklines)

## v1.0.0 - Research Release

**Goal**: Stable release for academic reproducibility.

### Requirements
- [ ] All v0.2 and v0.3 features complete
- [ ] Comprehensive test suite
- [ ] SWE-bench experiment harness
- [ ] Paper-ready documentation

--

## Design Decisions Log

### 2024-01-14: Package Structure
- Chose ESM modules (`"type": "module"`) for modern Node.js compatibility
- Apache-2.0 license for permissive use in academic/commercial contexts

### 2024-01-14: Metric Architecture
- Separated **objective metrics** (what to optimize) from **weighting metrics** (where to focus)
- Coverage % as primary objective (smoothest gradient)
- Severity counts as constraints (ceilings) not objectives

### 2026-01-14: Discrete Differentiability
- Extended from dimension-space to target-space gradients
- Location data already extracted by tools-we just stopped discarding it during aggregation
- Cross-dimension correlation: targets affecting multiple dimensions get multiplicative value
- Three granularity tiers to balance specificity vs computational cost
- Addresses key limitation: gradient computation, not just priority ordering

--

*See [RESEARCH.md](./RESEARCH.md) for academic direction.*
*See [theory/GEOMETRY.md](./theory/GEOMETRY.md) for theoretical framework.*
*See [theory/DIFFERENTIABILITY.md](./theory/DIFFERENTIABILITY.md) for target-space gradients.*
