# Claims Inventory: Citation Requirements

> **Working Draft** — This inventory tracks all factual claims and their validation status. `[PENDING]` citations are being compiled. `[NOVEL]` claims require experimental validation before publication.

> Explicit enumeration of claims with citation status

This document inventories every factual claim in the quality-gate-sgd framework, marking each as:
- `[MATH]` — Mathematical definition or proof (self-supporting)
- `[CITED]` — Empirical or established claim (requires citation)
- `[NOVEL]` — Our contribution (requires experimental validation)
- `[PENDING]` — Needs citation, not yet found

---

## 1. Foundational Claims

### 1.1 Optimization Theory

| Claim | Type | Citation Status |
|-------|------|-----------------|
| SGD converges under convexity and bounded gradients | `[CITED]` | PENDING: Robbins & Monro 1951, Bottou 2010 |
| Random walks with drift converge to absorbing states | `[CITED]` | PENDING: Feller Vol 1, Ross "Stochastic Processes" |
| Discrete optimization can use priority ordering instead of gradients | `[CITED]` | PENDING: Combinatorial optimization literature |
| Smoothness of loss function affects convergence rate | `[CITED]` | PENDING: Optimization theory textbook |

### 1.2 LLM Behavior

| Claim | Type | Citation Status |
|-------|------|-----------------|
| LLM outputs are stochastic (temperature, sampling) | `[CITED]` | PENDING: GPT-3 paper, Claude technical docs |
| LLMs can follow instructions to modify code | `[CITED]` | PENDING: Codex paper, HumanEval benchmark |
| Feedback improves LLM task performance (RLHF) | `[CITED]` | PENDING: InstructGPT, Constitutional AI |
| LLMs understand code semantics (type errors, tests) | `[CITED]` | PENDING: CodeBERT, code understanding papers |

### 1.3 Software Quality

| Claim | Type | Citation Status |
|-------|------|-----------------|
| Test coverage correlates with defect detection | `[CITED]` | PENDING: SE empirical studies |
| Static analysis finds real bugs | `[CITED]` | PENDING: SonarQube validation studies |
| Code quality metrics are valid proxies for maintainability | `[CITED]` | PENDING: ISO/IEC 25010, empirical SE |

---

## 2. Framework Claims

### 2.1 Quality Function Properties

| Claim | Type | Citation Status |
|-------|------|-----------------|
| Quality functions map code to finite measurement space | `[MATH]` | Definition (self-supporting) |
| Finite measurement granularity induces equivalence classes | `[MATH]` | Definition (self-supporting) |
| Coverage % has higher smoothness than integer counts | `[MATH]` | Follows from granularity (N=3000 vs N=5) |

### 2.2 The Three Required Properties

| Claim | Type | Citation Status |
|-------|------|-----------------|
| Quantitative measurement enables comparison | `[MATH]` | Definition of partial order |
| Determinism required for consistent feedback | `[MATH]` | If Q(c) varies, signal is noise |
| Local continuity aids incremental improvement | `[NOVEL]` | Our design principle (needs validation) |

### 2.3 Metric Classification

| Claim | Type | Citation Status |
|-------|------|-----------------|
| Coverage.lines has ~0.03% granularity per line | `[MATH]` | Calculation: 1/3000 ≈ 0.03% |
| Integer counts create discontinuities when N is small | `[MATH]` | 1/N step size analysis |
| TypeScript errors can be non-deterministic | `[CITED]` | PENDING: Incremental compilation docs |

---

## 3. Novel Claims (Our Contributions)

### 3.1 Core Thesis

| Claim | Type | Validation Required |
|-------|------|---------------------|
| Quality gates create descent behavior in LLM agents | `[NOVEL]` | Experimental: SWE-bench comparison |
| LLMs are "biased proposers" (P(improvement) > 0.5) | `[NOVEL]` | Experimental: measure improvement rate |
| Iteration with rejection converges in finite expected time | `[NOVEL]` | Theorem + empirical validation |

### 3.2 Geometry/Topology Separation

| Claim | Type | Validation Required |
|-------|------|---------------------|
| Abstract quality space exists independent of metrics | `[NOVEL]` | Conceptual framework (argumentative) |
| Topology choice affects convergence rate | `[NOVEL]` | Experimental: compare topologies |
| Per-kSLOC normalization improves smoothness | `[NOVEL]` | Empirical: trajectory analysis |

### 3.3 Root-Cause Measurement

| Claim | Type | Validation Required |
|-------|------|---------------------|
| Cascading errors violate local continuity | `[MATH]` | Example demonstration |
| Root-cause grouping restores continuity | `[NOVEL]` | Implementation + validation |
| Symbol-path deduplication is a valid grouping | `[NOVEL]` | Empirical: measure granularity |

### 3.4 Discrete Differentiability (Target-Space Gradients)

| Claim | Type | Validation Required |
|-------|------|---------------------|
| Target-space gradients provide finer optimization guidance than dimension-space | `[NOVEL]` | Experimental: compare convergence rates |
| Cross-dimension correlation multiplicatively increases target value | `[MATH]` | Definition + example (see DIFFERENTIABILITY.md) |
| ΔQ is computable for discrete enumerable moves in target-space | `[MATH]` | Algorithm specification (implemented) |
| Finer granularity (symbol vs file) may improve convergence rate | `[NOVEL]` | Experimental: compare τ_symbol vs τ_file vs τ_dim |
| Location data is already extracted but discarded during aggregation | `[MATH]` | Analysis of coverage-final.json, TS/ESLint output |
| Total ΔQ = weighted sum across all affected dimensions | `[MATH]` | Definition (see DIFFERENTIABILITY.md Section 4.3) |

---

## 4. The Convergence Theorem

### 4.1 Theorem Statement

**Theorem**: Given biased proposer with p > 0.5, finite |M|, non-empty T, E[τ] < ∞.

| Component | Type | Citation Status |
|-----------|------|-----------------|
| Random walk convergence to absorbing state | `[CITED]` | PENDING: Feller, Ross |
| Geometric distribution of rejection count | `[MATH]` | Standard probability |
| Expected time bound E[τ] ≤ d_max/p | `[MATH]` | Derivation from above |

### 4.2 Assumptions

| Assumption | Type | Justification |
|------------|------|---------------|
| Finite |M| | `[MATH]` | Metric precision is bounded |
| Non-empty T | `[MATH]` | By construction of rules |
| Biased proposer (p > 0.5) | `[NOVEL]` | **Requires empirical validation** |
| No infinite descending chains | `[MATH]` | Quality metrics have natural bounds |

---

## 5. Citation Hierarchy Visualization

```
                    [NOVEL: Convergence Theorem]
                              ↑
                    [NOVEL: Biased Proposer Lemma]
                              ↑
            ┌─────────────────┼─────────────────┐
            ↓                 ↓                 ↓
    [CITED: RLHF]    [CITED: Random Walk]   [CITED: Code Quality]
            ↓                 ↓                 ↓
    InstructGPT           Feller            ISO 25010
    Constitutional AI     Ross              SonarQube studies

                [NOVEL: Discrete Differentiability]
                              ↑
            ┌─────────────────┼─────────────────┐
            ↓                 ↓                 ↓
    [MATH: ΔQ Formula]  [NOVEL: Convergence]  [MATH: Cross-Dim]
            ↓                 ↓                 ↓
    Fitness weights     Biased proposer    Weighted sums
```

**The Novel Contributions** sit at the apex, supported by:
1. Established optimization theory (random walks)
2. Established LLM behavior (RLHF effectiveness)
3. Established SE research (quality metrics validity)
4. Mathematical definitions (ΔQ computation, cross-dimension aggregation)

---

## 6. Outstanding Citation Needs

### High Priority (required for claims)

- [ ] Random walk convergence theorem (Feller or Ross)
- [ ] RLHF improves LLM behavior (InstructGPT)
- [ ] LLM code understanding (Codex, HumanEval)
- [ ] Code quality metrics validation (empirical SE)

### Medium Priority (strengthens argument)

- [ ] Combinatorial optimization literature
- [ ] TypeScript incremental compilation behavior
- [ ] SonarQube metric validation studies

### Low Priority (nice to have)

- [ ] Historical SGD papers (Robbins & Monro)
- [ ] Multi-objective optimization (Pareto)

---

## 7. Validation Experiments Required

| Claim | Experiment | Metrics |
|-------|------------|---------|
| Biased proposer (p > 0.5) | N=100 fix attempts, measure success rate | p̂, 95% CI |
| Convergence | SWE-bench with/without gates | iterations, success rate |
| Topology matters | Compare coverage-only vs full topology | convergence rate |
| Root-cause improves continuity | Measure trajectory smoothness | monotonicity ratio |
| Target granularity affects convergence | Compare dimension vs file vs symbol modes | τ_dim, τ_file, τ_symbol |
| Cross-dimension targets are more valuable | Rank targets by #dimensions affected | correlation with actual improvement |
| Discrete differentiability provides better guidance | A/B test dimension-level vs target-level suggestions | task completion rate, iterations |

---

*This document ensures every claim is either cited, proven, or explicitly marked for validation.*
