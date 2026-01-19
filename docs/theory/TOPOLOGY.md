# Quality Topology: Our Instantiation

> **Working Draft** - This document presents preliminary theoretical work. Claims marked `[NOVEL]` await empirical validation. Citations marked `[PENDING]` are being compiled. See [CLAIMS.md](./CLAIMS.md) for full status.

> The specific metric choices and rationale for quality-gate-sgd

## 1. Overview

This document describes our **topology**-the specific instantiation of the quality geometry framework. These are engineering choices, not theoretical claims. Alternative topologies may perform better for different contexts.

## 2. Design Principles

Based on the geometry framework, we apply these principles:

| Principle | Application |
|------|-------|
| Smooth objectives | Coverage % as primary optimization target |
| Discrete constraints | Severity counts as ceilings, not objectives |
| Normalization | Per-kSLOC for count metrics |
| Weighting | Dependency analysis for priority |

### 2.1 Addressing Scheme

Target-space gradients require a shared addressing scheme that all axes map into. This is a topology decision: it defines the coordinate system over which targets are enumerated and ranked.

We model the address space as A = (V, E, μ):
- V: addressable units (symbols, paragraphs, claims)
- E: optional adjacency relation for weighting/propagation
- μ: size measure for normalization (SLOC, tokens, span length)

**Quality coordinate space criteria**:
- Deterministic: same code state yields the same addresses
- Stable: unchanged units keep their address across small edits
- Shared: every axis can map its issues into V (or explicit fallback)
- Normalizable: μ exists for density/impact normalization
- Resolution: V is neither too coarse nor too fragmented
- Graphable (optional): E can be derived to support weighting

**Addressing fitness measures** (practical diagnostics):
- Mapping coverage: % of issues mapped into V without fallback
- Address churn: % of addresses that change under small edits
- Size distribution: median and tail of μ (avoid extreme skew)
- Call-graph resolution rate: % of call sites resolved to symbols (if graphable)
- Edge density (if graphable): average degree and connectivity

**TypeScript instantiation**:
- Nodes V: compiler symbols (functions, methods, classes, types)
- Edges E: calls, imports, extends/implements
- Measure μ: symbol span (SLOC or AST span)
- Fallback: file:line when symbol resolution fails

For prose or proof domains, V can be paragraph/sentence/word indices, topic graphs, or claim graphs. The key requirement is consistency across all metrics.

## 3. Metric Selection

### 3.1 Objective Metrics (Gradient Sources)

These create the descent direction:

| Metric | Type | Smoothness | Role |
|----|---|------|---|
| `coverage.branches` | % | High (N≈200) | Primary objective |
| `coverage.statements` | % | High (N≈3000) | Secondary objective |
| `coverage.lines` | % | High (N≈3000) | Secondary objective |
| `duplications` | % | High | Tertiary objective |

**Rationale**: Percentage-based metrics with large denominators create smooth gradients. Coverage is universally available and well-understood.

### 3.2 Constraint Metrics (Boundaries)

These define feasible regions via ceilings:

| Metric | Type | Smoothness | Role |
|----|---|------|---|
| `sonarqube.blocker` | count | Low (N≈0-3) | Hard ceiling (0) |
| `sonarqube.critical` | count | Low (N≈5) | Hard ceiling (0) |
| `sonarqube.major` | count | Medium (N≈20) | Soft ceiling |
| `sonarqube.bugs` | count | Low (N≈5-20) | Soft ceiling |

**Rationale**: These have poor smoothness but represent important quality thresholds. Using them as constraints (must be below X) rather than objectives (minimize) avoids gradient problems.

### 3.3 Normalized Metrics (Improved Continuity)

Transform discrete counts to continuous densities:

```
bugs_per_ksloc = bugs / (sloc / 1000)
smells_per_ksloc = codeSmells / (sloc / 1000)
vulnerabilities_per_ksloc = vulnerabilities / (sloc / 1000)
```

**Rationale**: As code grows, the denominator smooths the discrete numerator. This improves local continuity for count-based metrics.

### 3.4 Weighting Metrics (Focus, Not Gradient)

These don't create gradients-they focus optimization effort:

| Metric | Formula | Effect |
|----|-----|----|
| `impact` | indirectDependents / max | Prioritize critical code |
| `ease` | 1 / (1 + degree) | Prioritize testable code |
| `severity` | weighted sum | Prioritize severe violations |

**Rationale**: Not all files are equally important. Weighting focuses effort on high-value regions without changing what "better" means.

## 4. The Priority Function

Our composite priority for file-level guidance:

```
priority(file) =
    w_cov × coverageGap(file) +
    w_ease × easeOfTesting(file) +
    w_impact × importance(file) +
    w_sev × severityScore(file)
```

Where:
- `coverageGap = 1 - coverage.branches / 100`
- `easeOfTesting = 1 / (1 + degree)`
- `importance = indirectDependents / max`
- `severityScore = normalized weighted sum of violations`

**Default weights**: coverage=0.30, ease=0.25, impact=0.30, severity=0.15

## 5. Rule Configuration

### 5.1 Floors (Minimum Thresholds)

```json
{
  "floors": {
    "coverage.unit.branches": 70,
    "coverage.unit.statements": 80
  }
}
```

**Rationale**: Coverage floors ensure minimum quality. These are smooth metrics suitable as optimization targets.

### 5.2 Ceilings (Maximum Thresholds)

```json
{
  "ceilings": {
    "sonarqube.blocker": 0,
    "sonarqube.critical": 0,
    "sonarqube.major": 10
  }
}
```

**Rationale**: Severity ceilings act as hard constraints. Zero tolerance for blocker/critical; soft limit on major.

### 5.3 Monotonic Rules (Ratcheting)

```json
{
  "monotonic": [
    { "direction": "up", "metrics": ["coverage.unit.branches"] },
    { "direction": "down", "metrics": ["sonarqube.bugs"] }
  ]
}
```

**Rationale**: Prevents regression. Once quality improves, it can't go back.

### 5.4 Granularity Configuration

Our topology supports three target granularity levels:

| Mode | CLI Flag | Default | Information Density |
|---|-----|-----|-----------|
| Dimension | `-quick` | No | "improve coverage.branches" |
| File | (default) | Yes | "fix src/payment.ts (+0.73 ΔQ)" |
| Symbol | `-deep` | No | "fix processPayment() at line 45" |

**Usage**:
```bash
npx quality-gate-sgd suggest                 # File-level (default)
npx quality-gate-sgd suggest -quick         # Dimension-level
npx quality-gate-sgd suggest -deep          # Symbol-level
```

**Trade-offs**:

| Granularity | Pros | Cons |
|-------|---|---|
| Dimension | Fast, low overhead | Less specific guidance |
| File | Good balance | May miss intra-file priorities |
| Symbol | Most specific | Higher computation, may fragment |

**MCP Tool**:
```json
{
  "name": "quality_gate_suggest",
  "arguments": {
    "granularity": "file",  // or "dimension", "symbol"
    "limit": 5
  }
}
```

**See [DIFFERENTIABILITY.md](./DIFFERENTIABILITY.md)** for the theoretical foundation.

## 6. SGD Property Evaluation

How well does this topology satisfy the geometry requirements?

### 6.1 Property Matrix

| Metric | Quantitative | Deterministic | Continuous | Grade |
|----|:------:|:-------:|:-----:|:---:|
| coverage.lines | ✓ | ✓ | ✓✓ | **A** |
| coverage.branches | ✓ | ✓ | ✓ | **B+** |
| duplications | ✓ | ✓ | ✓ | **B+** |
| sonarqube.codeSmells | ✓ | ✓ | △ | **B-** |
| sonarqube.minor | ✓ | ✓ | △ | **C+** |
| sonarqube.major | ✓ | ✓ | △ | **C** |
| sonarqube.bugs | ✓ | ✓ | ✗ | **C-** |
| sonarqube.blocker | ✓ | ✓ | ✗ | **D-** |
| typescript.errors | ✓ | △* | ✗ | **D** |

*TypeScript errors can be flaky with incremental compilation.

### 6.2 Known Limitations

1. **Determinism asterisk**: TypeScript metrics require fresh `tsc` runs, not incremental compilation, for reproducibility.

2. **Continuity failures**: Blocker/critical counts violate local continuity. We mitigate by using them as constraints, not objectives.

3. **Cascading effects**: Fixing one issue sometimes fixes many (ESLint, TypeScript). This violates "small change = small improvement" but in the beneficial direction.

## 7. Alternative Topologies

This topology is not claimed to be optimal. Alternatives worth investigating:

### 7.1 Complexity-First
- Primary: Cyclomatic complexity, cognitive complexity
- Hypothesis: Simpler code is easier to test and fix

### 7.2 Security-First
- Primary: Vulnerability metrics, OWASP compliance
- Use case: Security-critical applications

### 7.3 Performance-First
- Primary: Bundle size, runtime metrics
- Use case: Performance-sensitive applications

### 7.4 Minimal (Coverage-Only)
- Primary: Coverage only, no SonarQube
- Use case: Lower barrier to adoption

## 8. Conclusion

This topology represents our best current understanding of how to instantiate quality geometry for general-purpose TypeScript/JavaScript projects. It prioritizes:

1. **Smoothness** - Coverage % as primary objective
2. **Practicality** - Widely available tools (SonarQube, Jest/Vitest)
3. **Safety** - Hard constraints on severe issues

We explicitly acknowledge this is a design choice open to empirical validation and improvement.

--

*See [GEOMETRY.md](./GEOMETRY.md) for the abstract framework.*
*See [../CHANGELOG.md](../CHANGELOG.md) for design decision history.*
