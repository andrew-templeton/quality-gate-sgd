# quality-gate-sgd

> Deterministic quality gates for stochastic gradient descent behavior from LLM agents

--

## 📄 Academic Paper (WORKING DRAFT)

**⚠️ DRAFT STATUS: Not peer-reviewed. Novel claims await empirical validation.**

The theoretical foundations of this work are documented in a LaTeX paper:

- **[paper/quality-gate-sgd.tex](paper/quality-gate-sgd.tex)** - Full academic treatment

The paper covers:
- Quality Geometry (formal framework)
- Convergence Theorem (proof of finite expected convergence)
- Discrete Differentiability (target-space gradients)
- Metric Topology (classification by SGD suitability)
- Empirical Validation Plan (research questions RQ1-RQ6)

**Claim Status**: All claims are explicitly inventoried in [docs/theory/CLAIMS.md](docs/theory/CLAIMS.md) with markers:
- `[MATH]` - Mathematical definitions (self-supporting)
- `[NOVEL]` - Our contributions (require experimental validation)
- `[CITED]` - Established results (citations being compiled)

--

## The Core Insight

**The way to get deterministic results from a stochastic work unit (like an LLM) is to make the exit gate on the process (more) deterministic.**

This package provides quality gates that create **gradient descent-like behavior** for LLM coding agents. When an agent iteratively fixes code to pass quality gates, it naturally descends toward higher quality solutions-without explicit optimization algorithms.

## Why This Works

For gradient descent behavior to emerge from deterministic gates, three properties must hold:

1. **Quantitative Measurement** - Metrics must be numeric with a clear "good" direction
   - Coverage: higher is better
   - Bug count: lower is better

2. **Pure Function** - Same code state → same metric values
   - No randomness in measurement
   - Reproducible results

3. **Local Continuity** - Small code changes → small metric changes
   - No discontinuous cliffs
   - Following feedback improves scores

When these properties hold, an LLM agent iterating against quality gates exhibits **stochastic gradient descent** behavior-the agent's inherent randomness provides exploration, while the deterministic gates provide the descent direction.

## Installation

```bash
npm install quality-gate-sgd
```

## Quick Start

### 1. Create Rules Configuration

```bash
# Copy the template
cp node_modules/quality-gate-sgd/templates/rules.template.json rules.json
```

Edit `rules.json` for your project:

```json
{
  "version": "1.0.0",
  "description": "My Project Quality Rules",
  "rules": {
    "floors": {
      "coverage.unit.branches": 70
    },
    "ceilings": {
      "sonarqube.blocker": 0,
      "sonarqube.critical": 0
    },
    "monotonic": [
      { "direction": "up", "metrics": ["coverage.unit.branches"] },
      { "direction": "down", "metrics": ["sonarqube.bugs"] }
    ],
    "requiredScripts": ["test", "lint"]
  }
}
```

### 2. Run the Quality Gate

```bash
npx quality-gate-sgd
```

### 3. View SonarQube Issues

```bash
npx quality-gate-sgd list-issues -severity=MAJOR
```

## Rule Types

### Floors
Minimum thresholds that must be met:
```json
"floors": {
  "coverage.unit.branches": 70,
  "coverage.unit.statements": 80
}
```

### Ceilings
Maximum thresholds that must not be exceeded:
```json
"ceilings": {
  "sonarqube.blocker": 0,
  "sonarqube.critical": 0,
  "sonarqube.major": 10
}
```

### Monotonic (Ratcheting)
Metrics that must not regress:
```json
"monotonic": [
  { "direction": "up", "metrics": ["coverage.unit.branches"] },
  { "direction": "down", "metrics": ["sonarqube.bugs", "sonarqube.vulnerabilities"] }
]
```

### Required Scripts
npm scripts that must pass:
```json
"requiredScripts": ["test", "lint", "build"]
```

## Available Metrics

### Coverage Metrics
- `coverage.unit.*` - Unit test coverage
- `coverage.lambda.*` - Integration/Lambda test coverage
- `coverage.union.*` - Merged coverage from all suites

Each suite has: `branches`, `statements`, `functions`, `lines`

### SonarQube Metrics
- `sonarqube.bugs`, `sonarqube.vulnerabilities`, `sonarqube.codeSmells`
- `sonarqube.blocker`, `sonarqube.critical`, `sonarqube.major`, `sonarqube.minor`, `sonarqube.info`
- `sonarqube.coverage`, `sonarqube.duplications`

### TypeScript & ESLint
- `typescript.errors`, `typescript.warnings`
- `eslint.errors`, `eslint.warnings`

## The SGD Framework

### Metric Classification

Not all metrics are equal for gradient descent. We classify them by their role:

| Category | Creates Gradient? | Examples |
|-----|----------|-----|
| **Objective Metrics** | Yes | coverage, bugs, codeSmells |
| **Weighting Metrics** | No | impact, degree, severity |

**Objective metrics** are what you optimize-they form the loss function.

**Weighting metrics** focus the optimization-they tell you *where* to optimize first.

### Smoothness Ranking

Metrics with higher granularity create smoother gradients:

| Tier | Metric | Why |
|---|----|---|
| 1 | `coverage.lines` | N=thousands, ~0.03% per line |
| 1 | `duplications %` | Gradual refactoring |
| 2 | `coverage.branches` | N=hundreds, ~0.5% per branch |
| 3 | `sonarqube.blocker` | N<10, discrete cliffs |

Prefer percentage-based metrics with large denominators for smoother descent.

### Priority Function

For LLM agent guidance, we compute file priority as:

```
priority = w_cov × coverageGap + w_ease × easeOfTesting + w_impact × importance + w_sev × severityScore
```

Where:
- **coverageGap** = 1 - coverage (needs more tests)
- **easeOfTesting** = 1 / (1 + degree) (leaf nodes are easier)
- **importance** = indirectDependents / max (critical code)
- **severityScore** = weighted sum of violations

This creates a unified priority that balances what needs testing, what's easy to test, and what's most important to test.

## Programmatic API

```typescript
import {
  loadRules,
  evaluateRules,
  extractAllMetrics,
  buildDependencyGraph,
  prioritizeFiles,
} from 'quality-gate-sgd';

// Run quality gate
const rules = loadRules();
const metrics = extractAllMetrics(['test', 'lint']);
const result = evaluateRules(rules, metrics);

console.log(result.status); // 'pass' or 'fail'
console.log(result.failedRules); // Array of failures

// Analyze dependencies for test prioritization
const graph = buildDependencyGraph();
const prioritized = prioritizeFiles(graph, result.failedRules);

console.log(prioritized[0].file.path); // Highest priority file
console.log(prioritized[0].priority);  // Priority score
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|-----|-----|-------|
| `SONARQUBE_URL` | `http://localhost:9000` | SonarQube server |
| `SONARQUBE_PROJECT_KEY` | Auto-detected | Project key |
| `QUALITY_RULES_FILE` | `rules.json` | Rules file path |
| `QUALITY_CODE_PATHSPECS` | `src/,tests/,scripts/` | Paths for cache hashing |
| `QUALITY_CACHE_FILE` | `.quality-gate-cache.json` | Cache file |

### SonarQube Setup

1. Start SonarQube (Docker recommended):
   ```bash
   docker-compose -f docker-compose.sonarqube.yml up -d
   ```

2. Create a project and generate a token

3. Save token:
   ```bash
   echo "your-token" > .sonarqube-token
   ```

4. Create `sonar-project.properties`:
   ```properties
   sonar.projectKey=my-project
   sonar.sources=src
   sonar.tests=tests
   sonar.javascript.lcov.reportPaths=coverage/lcov.info
   ```

## Caching

The quality gate uses intelligent caching:

- **Clean working tree**: Cache key = commit hash
- **Uncommitted changes**: Cache key = `wip:` + SHA256 of code diffs
- **Rules change**: Cache invalidated when rules.json changes

Cache stores metrics and evaluation results to avoid redundant runs.

## For LLM Agent Authors

If you're building an LLM coding agent, this package provides:

1. **Deterministic gates** that create gradient direction
2. **Priority computation** to guide which files to work on
3. **Dependency analysis** to understand code structure
4. **Severity weights** to prioritize violations

The key insight: *Your agent's inherent stochasticity provides exploration; our gates provide the descent direction.*

See [docs/CONCEPT.md](docs/CONCEPT.md) for the full mathematical framework.

## License

Apache-2.0
