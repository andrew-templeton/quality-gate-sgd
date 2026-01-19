# Pre-Registration: Experimental Designs

> Pre-registered experimental plans for validating novel claims

This document separates **committed (confirmatory)** designs from **considered but rejected** ideas,
with explicit rationale. The goal is to reduce p-hacking risk by timestamping *what we intended to do*
vs. *what we chose not to do*.

## Status
- **Current status**: Draft (confirmatory plans not yet locked)
- **Last updated**: 2026-01-14
- **Anchoring commit**: TBD (fill with git commit hash when locked)

## Transparency Motivation & Planned Process
**Motivation**: Reduce p-hacking risk and increase trust by pre-registering designs,\nlogging deviations, and preserving the decision trail in public version control.\n\n**Planned process**\n1. Draft candidate designs in this document (clearly labeled).\n2. Move a subset into \"Confirmatory Designs\" once they are finalized.\n3. Record any deviations in the Deviations Log with date + rationale.\n4. Archive raw trajectories, configs, and metadata alongside the code.\n5. Link the preregistration in the eventual paper as a transparency artifact.

## Scope: Claims Under Test
Primary novel claims (see `docs/theory/CLAIMS.md`):
- Quality gates create descent-like behavior in LLM agents
- Biased proposer (p > 0.5) assumption holds for code quality tasks
- Metric topology choice affects convergence rate
- Addressing fitness predicts convergence speed and success rate

## Confirmatory Designs (Committed)

### Design A — Gate vs. No-Gate Convergence (RQ1/RQ2)
**Hypotheses**
- H1: Quality-gate agents converge in fewer iterations than no-gate agents.
- H2: Quality-gate agents achieve a higher pass rate within N iterations.

**Dataset**
- SWE-bench (or equivalent) tasks, stratified by difficulty.
- Target size: 50–100 tasks (minimum 50 for statistical power).

**Conditions**
- Baseline: LLM agent without quality feedback (no gate)
- Treatment: LLM agent with quality-gate-sgd feedback

**Protocol**
1. Reset task state
2. Run agent for `max_iterations` or until pass
3. Log trajectory: (iteration, metrics, pass/fail)
4. Store final code state

**Metrics**
- Iterations-to-pass (primary)
- Pass rate within N iterations (secondary)
- Final metric vector (exploratory)

**Analysis**
- Two-sample t-test (iterations-to-pass)
- Chi-squared test (pass rate)
- Effect sizes reported (Cohen’s d, risk difference)

**Stopping criteria**
- Max iterations N (fixed)
- No adaptive stopping

---

### Design B — Topology Sensitivity (RQ4)
**Hypotheses**
- H3: Smoother metric topologies reduce oscillations and improve monotonic improvement rate.

**Conditions**
- Topology 1: Coverage-only
- Topology 2: Coverage + SonarQube ceilings
- Topology 3: Full topology (coverage + ceilings + monotonic rules)

**Metrics**
- Monotonic improvement ratio
- Oscillation count (metric regressions)
- Iterations-to-pass

**Analysis**
- ANOVA across topologies
- Post-hoc pairwise comparisons with correction

---

### Design C — Addressing Fitness vs Convergence (RQ7)
**Hypotheses**
- H4: Higher mapping coverage correlates with fewer iterations to pass.
- H5: Higher call-graph resolution correlates with higher success rate.
- H6: Coarser address units (p90 SLOC above threshold) correlate with slower convergence.

**Dataset**
- Same tasks as Design A (SWE-bench or equivalent)
- Symbol-level guidance enabled to compute address fitness metrics

**Conditions**
- Treatment: quality-gate-sgd with symbol addressing (default scheme)
- No additional manipulation; address fitness varies across tasks/repos

**Metrics**
- Mapping coverage: overall + line-level mapping rates
- Address size distribution: median/p90 SLOC per address
- Call-graph resolution rate (% of call sites resolved to symbols)
- Iterations-to-pass, success rate

**Analysis**
- Regress iterations-to-pass on fitness metrics (linear or rank regression)
- Regress success rate on fitness metrics (logistic regression)
- Stratify by fit/mixed/unfit tiers and compare means (ANOVA or t-test)

## Exploratory Designs (Not Confirmatory)
These are recorded to avoid retrofitting later. Results from these should be labeled exploratory.

- Fine-grained per-metric smoothness estimation
- Root-cause grouping impact on continuity (pilot)
- Per-kSLOC normalization impact on convergence
- Address churn under small refactors (stability diagnostics)

## Considered But Rejected Designs (with rationale)
| Design | Rationale for rejection | Replacement/Note |
|---|---|---|
| Adaptive stopping based on metric plateau | Risks post-hoc selection bias and uneven exposure | Use fixed N only |
| Auto-curated task sampling | Hard to justify representativeness | Use stratified sampling |
| Hand-picked “known failing” tasks | Inflates effect sizes | Use benchmark tasks |
| Tuning weights mid-experiment | Confounds topology effect with tuning | Fix weights per design |

## Determinism Controls
- Disable incremental compilation in TypeScript metrics
- Clear caches between measurements
- Freeze dependency versions and tool versions

## Data Release Plan
- Publish raw trajectories and final code states
- Include config files, seeds, and run metadata

## Deviations Log
Any deviations from the committed designs must be recorded here with a timestamp and rationale.

- [ ] TBD

## Notes
This document is complementary to `docs/RESEARCH.md` and is intended as a hard
pre-registration ledger. It can be linked in the paper to show methodological discipline.
