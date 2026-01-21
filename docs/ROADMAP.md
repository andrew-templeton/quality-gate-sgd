# Engineering Roadmap

> Implementation plan for quality-gate-sgd

## Current Version: 0.1.1

Package complete with core functionality:
- Quality gate evaluation (floors, ceilings, monotonic)
- SonarQube integration
- Coverage metrics extraction
- Dependency graph analysis
- Priority-based file ranking

---

## Completed Milestones

### v0.1.1 - Discrete Differentiability ✓

**Goal**: Move beyond priority ordering to actual gradient computation.

- [x] Target-space gradient computation (ΔQ per target)
- [x] Cross-dimension value aggregation
- [x] Location-aware issue extraction from all sources
- [x] Granularity tiers: dimension, file, symbol
- [x] `-quick`, default, `-deep` CLI modes
- [x] Academic documentation (theory/DIFFERENTIABILITY.md)

### v0.1.2 - Symbol Infrastructure ✓

- [x] Symbol table with O(1) location lookup
- [x] Call graph extraction and in-degree weighting
- [x] Fixability estimation via LLM
- [x] Adjusted ΔQ prioritization

### v0.1.3 - Test Coverage ✓

- [x] Branch coverage ≥90% threshold achieved (90.17%)
- [x] 741 tests across 27 test files

### v0.1.4 - Experiment Infrastructure ✓

- [x] Trajectory logging (`src/experiments/logger.ts`)
- [x] Statistical analysis (`src/experiments/stats.ts`)
- [x] Hypothesis analysis for H1-H12 (`src/experiments/analyzer.ts`)
- [x] Visualization (`src/experiments/visualize.ts`)
- [x] 45 tests for experiment infrastructure

---

## In Progress: v0.2.0 - Experiment Execution

**Goal**: Run the pre-registered experiments (Designs A-F, H1-H12).

### Experiment Runner Components

| Component | Status | Description |
|-----------|--------|-------------|
| Trajectory logging | ✅ Done | `startExperimentRun()`, `logIteration()`, `endExperimentRun()` |
| Statistical tests | ✅ Done | t-test, Spearman, chi-squared, ANOVA |
| Hypothesis analyzer | ✅ Done | `analyzeBatch()` for H1-H12 |
| Visualization | ✅ Done | Sparklines, box plots, result tables |
| Condition factory | ✅ Done | `createConditions()`, `DESIGN_METADATA` for A-F |
| **Experiment runner** | ⬜ TODO | Orchestrate condition × task runs |
| **SWE-bench integration** | ⬜ TODO | Load tasks, apply patches, evaluate |
| **Agent harness** | ⬜ TODO | LLM agent wrapper with gate feedback toggle |
| **Batch runner** | ⬜ TODO | Run N tasks × M conditions with parallelization |

### Per-Design Requirements

#### Design A — Gate vs No-Gate (H1, H2)
- [ ] Agent harness that can toggle gate feedback on/off
- [ ] SWE-bench task loader
- [x] Baseline condition: no feedback
- [x] Treatment condition: gate feedback enabled

#### Design B — Topology Sensitivity (H3)
- [x] Condition factory for topology variants:
  - [x] Coverage-only
  - [x] Coverage + ceilings
  - [x] Full topology
- [ ] ANOVA analysis (3+ conditions)

#### Design C — Addressing Fitness (H4, H5, H6)
- [x] Fitness metric logging in run metadata:
  - [x] `mappingCoverage`
  - [x] `callGraphResolution`
  - [x] `p90AddressSloc`
- [ ] Regression analysis helpers

#### Design D — Call Graph Weighting (H7, H8)
- [x] Condition: weighted vs unweighted prioritization
- [ ] Paired comparison (same task, different weighting)

#### Design E — Fixability Validity (H9, H10)
- [x] Condition with fixability enabled
- [ ] Single-symbol fix attempt protocol
- [ ] Binary outcome logging (fixed/not fixed)
- [ ] ROC-AUC analysis

#### Design F — Adjusted Prioritization (H11, H12)
- [x] Conditions: raw vs adjusted ΔQ
- [ ] Wasted iteration tracking

---

## Future: v0.3.0 - Practical Adoption

**Goal**: Lower adoption barriers.

- [ ] Zero-config mode (embedded defaults)
- [ ] Coverage-only mode (no SonarQube required)
- [ ] GitHub Action (`action.yml`)
- [ ] Visual CLI output (progress bars, sparklines)

## Future: v1.0.0 - Research Release

**Goal**: Stable release for academic reproducibility.

- [ ] All v0.2 and v0.3 features complete
- [ ] SWE-bench experiment results published
- [ ] Paper-ready documentation
- [ ] Raw trajectory data release

---

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
- Location data already extracted by tools—we just stopped discarding it during aggregation
- Cross-dimension correlation: targets affecting multiple dimensions get multiplicative value
- Three granularity tiers to balance specificity vs computational cost

### 2026-01-21: Experiment Infrastructure
- JSONL streaming for crash-resilient logging
- Statistical functions implemented from scratch (no external deps)
- Hypothesis analyzer maps directly to PREREG.md designs

---

*See [PREREG.md](./PREREG.md) for pre-registered experimental designs.*
*See [RESEARCH.md](./RESEARCH.md) for academic direction.*
*See [theory/CLAIMS.md](./theory/CLAIMS.md) for claims inventory.*
