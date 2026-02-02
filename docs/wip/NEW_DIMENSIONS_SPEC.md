# Three New Quality Dimensions: Documentation, Category Completeness, and Bijective Requirements Alignment

## Executive Summary

This document specifies three additional quality dimensions that complement the existing 5 Bayesian reasoning dimensions. These new dimensions address the gap identified in the astropy-14182 case where the agent missed the read() requirement despite having 98/100 quality score.

## The Problem

**Case Study: astropy-14182**
- Issue stated: "Please support header_rows in RestructuredText **output**" (only mentions write)
- Test required: Both read() AND write() with header_rows parameter
- Agent's solution: Only fixed write(), scored 98.0/100
- Test result: **FAILED** - incomplete solution despite high quality reasoning

**Root cause**: High reasoning quality ≠ Complete solution

The existing 5 dimensions measure reasoning process quality, but don't ensure:
1. Code is adequately documented with intent
2. Algebraic/categorical completeness (dual operations)
3. Bijective alignment between requirements, tests, and code

## The Three New Dimensions

### Dimension 6: Documentation Completeness (Syntactic Layer)

**Purpose**: Force explicit reasoning about every code modification to prevent implicit assumptions.

**Key Insight**: When an agent must document WHY it's passing `header_rows` to parent, it's forced to discover the parent uses it for both read AND write operations.

**Evaluation Levels**:

1. **Variable Level**: Every new variable declaration has inline comment explaining purpose
2. **Function Level**: Every function has docstring explaining purpose, parameters, return values
3. **Class/Module Level**: Every class/module has header comment explaining purpose and relationship to components
4. **File Level**: Every modified file has header comment explaining overall purpose
5. **Directory Level**: README or PURPOSE.md explaining directory's role (recursive up to repo root)

**Scoring**:
```
Base score: 100.0
Deductions:
- New function without docstring: -20
- New variable without comment: -10
- Modified function without updated docstring: -5
- Complex logic block (>5 lines with conditionals) without explanation: -15
- Inadequate comment (too short, doesn't explain WHY): -5 per instance

Pass threshold: ≥70.0
```

**Optional Enhancement (LLM-based)**:
Use low-cost model to evaluate if comments are accurate and aligned with adjacent code.

**Feature Flag**: `ENABLE_DOCUMENTATION_COMPLETENESS`
**Cost**: Minimal (simple heuristics) or Low if LLM validation enabled (~$0.01-0.05 per evaluation)

---

### Dimension 7: Algebraic Completeness (Semantic Layer - Category Theory)

**Purpose**: Check for field-theoretic completeness using universal duality patterns.

**Mathematical Foundation**:

Code modifications operate in a **monoidal category** with duals:

```
For operation op: T → U
If op is a left adjoint (constructor, encoder, writer)
Then ∃ dual op*: U → T (destructor, decoder, reader)
Such that: op* ∘ op ≈ id_T (round-trip property)
```

**Universal Duality Patterns**:

| Category | Operation | Dual | Property |
|----------|-----------|------|----------|
| I/O | write | read | round-trip |
| Serialization | encode | decode | bijection |
| CRUD | create | delete | lifecycle |
| State | get | set | consistency |
| Collection | add | remove | cardinality |
| Transform | pack | unpack | inverse |
| Resource | acquire | release | balance |
| Validation | check | fix | correctness |

**Detection Algorithm**:

1. **Extract modified operations** from diff
2. **Classify operation type** (I/O, CRUD, Transform, etc.)
3. **Find dual operation** in codebase using:
   - Lexical patterns (read/write, encode/decode)
   - Type signature inverses (A → B requires B → A)
   - Mathematical inverses (composition to identity)
4. **Check if dual was also modified**
5. **Verify universal properties** (e.g., round-trip for I/O)

**Scoring**:
```
Base score: 100.0
Violations:
- Missing dual operation (doesn't exist in codebase): -40 (high severity)
- Unmodified dual (exists but wasn't updated): -25 (medium severity)
- Broken universal property (composition fails): -30 (high severity)
- Type closure violation: -15 (low severity)

Pass threshold: ≥70.0
```

**Example Application** (astropy-14182):
```
Modified: write(self, lines, header_rows=None) → List[str]
Expected dual: read(self, lines, header_rows=None) → Table
Status: read() exists but NOT modified in diff
Violation: Unmodified dual (-25 points)
Score: 75/100 → Would BLOCK submission
Recommendation: "Update read() to support header_rows parameter"
```

**Feature Flag**: `ENABLE_ALGEBRAIC_COMPLETENESS`
**Cost**: Low-Medium (LLM-based, ~$0.05-0.15 per evaluation)

---

### Dimension 8: Bijective Requirements Alignment (Semantic Layer - Logic)

**Purpose**: Ensure bidirectional traceability between English requirements, test plan, and code implementation.

**The Three-Layer Model**:

```
English Requirements (natural language)
    ↕ (injective + surjective = bijective)
Test Plan (implicit or explicit satisfaction criteria)
    ↕ (injective + surjective = bijective)
Code Implementation (executable logic)
```

**Evaluation Process**:

**Phase 1: Requirements → Test Plan Alignment**
1. **Extract claim graph** from English requirements using LLM
   - Convert requirements into Boolean logic tuples
   - Example: "Support header_rows in write()" → [(supports, write, header_rows), (accepts_parameter, write, header_rows)]
2. **Extract satisfaction criteria** from test plan (if explicit) or infer from FAIL_TO_PASS tests
3. **Check injectivity**: Every requirement claim maps to at least one test criterion
4. **Check surjectivity**: Every test criterion traces back to a requirement claim
5. **Score**: Percentage of complete bidirectional mappings

**Phase 2: Test Plan → Code Alignment**
1. **Extract code operations** from diff
2. **Map to test criteria**
   - Example: write() modification maps to test_rst_with_header_rows
3. **Check injectivity**: Every test criterion is implemented in code
4. **Check surjectivity**: Every code change traces to a test criterion
5. **Score**: Percentage of complete bidirectional mappings

**Combined Score**:
```
Requirements-Test alignment: 0-100
Test-Code alignment: 0-100
Overall bijective alignment: geometric_mean(R-T, T-C)

Pass threshold: ≥70.0
```

**Example Application** (astropy-14182):

```
Requirements (English):
- "Support header_rows in RestructuredText output"
  Claim graph: [(supports, RST, header_rows), (accepts, write, header_rows)]

Test Plan (implicit from FAIL_TO_PASS):
- test_rst_with_header_rows
  Operations: QTable.read(..., header_rows=[...]) + write(..., header_rows=[...])
  Criteria: [(works, read, header_rows), (works, write, header_rows)]

Code (diff):
- Modified: write() to accept header_rows ✓
- Modified: read() to accept header_rows ✗

Alignment Analysis:
Requirements → Test: 50% (only write requirement mapped, read is implicit)
Test → Code: 50% (only write implemented, read missing)
Overall: sqrt(50% × 50%) = 50% → FAIL

Recommendations:
- "Test requires read() with header_rows but code doesn't implement it"
- "Bijection incomplete: read operation missing from implementation"
```

**Feature Flag**: `ENABLE_BIJECTIVE_REQUIREMENTS`
**Cost**: Medium-High (LLM-based claim graph extraction, ~$0.10-0.30 per evaluation)

---

## Content-Based Caching Strategy

**Problem**: These LLM-based evaluations are expensive. We need to cache results and only re-evaluate changed code.

**Solution**: Merkle-tree style content hashing with cache invalidation

### Cache Architecture

```typescript
interface DimensionCacheEntry {
  // Content hash (SHA256 of relevant inputs)
  contentHash: string;

  // Dimension results
  dimension: 'documentation' | 'algebraic' | 'bijective';
  score: number;
  violations: Violation[];
  recommendations: string[];

  // Metadata
  timestamp: number;
  modelUsed: string;
  costUSD: number;

  // Merkle tree for invalidation
  dependencyHashes: {
    diffHash: string;           // Hash of the code diff
    contextHash: string;        // Hash of relevant codebase context
    requirementsHash: string;   // Hash of problem statement (for bijective)
  };
}

interface DimensionCache {
  schemaVersion: number;
  entries: Map<string, DimensionCacheEntry>;
}
```

### Cache Key Computation

```typescript
function computeCacheKey(inputs: {
  diff: string;
  codebaseContext: string;
  requirements?: string;
  dimension: DimensionType;
}): string {
  // Merkle-tree approach: hash of hashes
  const diffHash = sha256(inputs.diff);
  const contextHash = sha256(inputs.codebaseContext);
  const reqHash = inputs.requirements ? sha256(inputs.requirements) : '';

  // Combine with dimension and version
  const dimensionVersion = DIMENSION_VERSIONS[inputs.dimension];
  const combined = `${inputs.dimension}:v${dimensionVersion}:${diffHash}:${contextHash}:${reqHash}`;

  return sha256(combined);
}
```

### Cache Invalidation Rules

**Invalidate when**:
1. **Diff changes**: Any modification to the code diff
2. **Context changes**: Modified files in codebase that diff references
3. **Requirements change**: Problem statement modified
4. **Dimension version bump**: Evaluation logic updated
5. **Model change**: Different LLM used for evaluation

**Merkle-tree optimization**:
- Only re-evaluate subtrees with changed hashes
- If file A references file B, hash(A) includes hash(B)
- When B changes, hash(A) invalidates automatically

### Cache Storage

**Location**: `.quality-dimension-cache.json` (or SQLite for larger repos)

**Structure**:
```json
{
  "schemaVersion": 1,
  "entries": {
    "documentation:v1:abc123...": {
      "contentHash": "abc123...",
      "dimension": "documentation",
      "score": 85.0,
      "violations": [...],
      "timestamp": 1234567890,
      "modelUsed": "gpt-5-nano",
      "costUSD": 0.02
    }
  },
  "statistics": {
    "totalEvaluations": 142,
    "cacheHits": 89,
    "cacheMisses": 53,
    "totalCostUSD": 12.34
  }
}
```

**Pruning**: Remove entries older than 90 days (configurable)

---

## Integration with Existing Quality Gate System

### Current Architecture

```
Existing 5 Bayesian Dimensions:
1. Prior Clarity (20%)
2. Hypothesis Coherence (25%)
3. Evidence Alignment (25%)
4. Solution Consistency (20%)
5. Outcome Observability (10%)
→ Overall Quality Score: weighted average
→ Pass threshold: ≥70.0
```

### New Architecture (8 Dimensions)

```
Group A: Reasoning Quality (Bayesian, existing)
1. Prior Clarity (15%)
2. Hypothesis Coherence (20%)
3. Evidence Alignment (20%)
4. Solution Consistency (15%)
5. Outcome Observability (10%)
→ Reasoning Score: 80% weight

Group B: Implementation Quality (New)
6. Documentation Completeness (10% of overall)
7. Algebraic Completeness (5% of overall)
8. Bijective Requirements (5% of overall)
→ Implementation Score: 20% weight

Overall Quality = 0.80 × Reasoning + 0.20 × Implementation
Pass threshold: ≥70.0 overall AND no single dimension < 50.0
```

### Sequential Evaluation (Cost Optimization)

```
Step 1: Documentation Completeness (cheap heuristics)
  If score < 70 → BLOCK, request documentation
  Cost: ~$0 (heuristics) or ~$0.02 (LLM validation)

Step 2: Existing 5 Bayesian Dimensions
  If overall < 70 → BLOCK, request better reasoning
  Cost: ~$0 (heuristics)

Step 3: Algebraic Completeness (LLM-based)
  If score < 70 → BLOCK, request dual operations
  Cost: ~$0.05-0.15

Step 4: Bijective Requirements (LLM-based, expensive)
  Only run if previous steps pass
  If score < 70 → BLOCK, request requirement alignment
  Cost: ~$0.10-0.30

Total added cost per evaluation: $0.15-0.45 (amortized with caching)
```

---

## Implementation Plan

### Phase 1: Python Implementation (Week 1)

**Files to create**:
1. `python/quality_gate/dimension_documentation.py`
   - `DocumentationCompletenessEvaluator` class
   - Heuristic scoring based on docstrings, comments
   - Optional LLM-based accuracy validation

2. `python/quality_gate/dimension_algebraic.py`
   - `AlgebraicCompletenessEvaluator` class
   - Dual operation detection
   - Universal property verification
   - LLM-based evaluation of completeness

3. `python/quality_gate/dimension_bijective.py`
   - `BijectiveRequirementsEvaluator` class
   - Claim graph extraction from requirements
   - Test plan extraction
   - Bidirectional mapping verification

4. `python/quality_gate/cache.py`
   - `DimensionCache` class
   - Content-based hashing
   - Merkle-tree invalidation
   - Cache statistics

5. `python/quality_gate/evaluator.py` (modify)
   - Integrate new dimensions
   - Sequential evaluation with early exit
   - Feature flag support

**Configuration** (`python/quality_gate/config.py`):
```python
@dataclass
class ExtendedQualityGateConfig:
    # Existing
    min_overall_quality: float = 70.0
    dimension_weights: Dict[str, float] = field(default_factory=lambda: {
        "prior_clarity": 0.15,
        "hypothesis_coherence": 0.20,
        "evidence_alignment": 0.20,
        "solution_consistency": 0.15,
        "outcome_observability": 0.10,
        "documentation_completeness": 0.10,
        "algebraic_completeness": 0.05,
        "bijective_requirements": 0.05
    })

    # New feature flags
    enable_documentation_completeness: bool = True
    enable_algebraic_completeness: bool = False  # Default off (expensive)
    enable_bijective_requirements: bool = False  # Default off (expensive)

    # LLM configuration
    documentation_use_llm: bool = False  # Use LLM for comment accuracy
    algebraic_model: str = "gpt-5-mini"
    bijective_model: str = "gpt-5-mini"

    # Cache configuration
    cache_file: str = ".quality-dimension-cache.json"
    cache_max_age_days: int = 90
```

### Phase 2: TypeScript Implementation (Week 2)

**Files to create** (mirror Python structure):
1. `src/quality-gate/dimension-documentation.ts`
2. `src/quality-gate/dimension-algebraic.ts`
3. `src/quality-gate/dimension-bijective.ts`
4. `src/quality-gate/cache.ts`
5. `src/quality-gate/evaluator.ts` (modify)

### Phase 3: Documentation (Week 2)

**Files to update**:
1. `quality_dimensions_algebraic.md` - Add Dimensions 6-8 specifications
2. `ALGEBRAIC_COMPLETENESS_SUMMARY.md` - Add integration examples
3. `README.md` - Document new flags and configuration
4. `docs/theory/CLAIMS.md` - Add validation requirements for new dimensions
5. Create `docs/NEW_DIMENSIONS.md` - Comprehensive guide

### Phase 4: Testing & Validation (Week 3)

1. **Unit tests**:
   - Test each dimension evaluator independently
   - Test cache hit/miss behavior
   - Test Merkle-tree invalidation

2. **Integration tests**:
   - Run on astropy-14182 (should catch missing read())
   - Run on 10 other SWE-bench tasks
   - Measure cache hit rate and cost savings

3. **Calibration**:
   - Run 50 tasks with new dimensions enabled
   - Measure correlation with patch success
   - Validate that algebraic dimension catches dual operation gaps

### Phase 5: Cost Analysis & Optimization (Week 3)

1. **Measure costs**:
   - Cost per dimension per task
   - Cache hit rate after N evaluations
   - Cost savings from caching

2. **Optimize**:
   - Tune LLM models (nano vs mini vs full)
   - Adjust cache invalidation rules
   - Implement batch evaluation for multiple diffs

---

## Expected Impact

### On astropy-14182 (Motivating Example)

**Before (Existing 5 Dimensions)**:
```
Prior Clarity: 100.0
Hypothesis Coherence: 100.0
Evidence Alignment: 100.0
Solution Consistency: 90.0
Outcome Observability: 100.0
→ Overall: 98.0/100 ✓ PASS
→ Test Result: FAIL (incomplete solution)
```

**After (8 Dimensions)**:
```
Group A (Reasoning):
  Prior Clarity: 100.0
  Hypothesis Coherence: 100.0
  Evidence Alignment: 100.0
  Solution Consistency: 90.0
  Outcome Observability: 100.0
  → Reasoning: 98.0

Group B (Implementation):
  Documentation Completeness: 60.0 (no docstrings explaining header_rows)
  Algebraic Completeness: 75.0 (write modified, read not modified -25)
  Bijective Requirements: 50.0 (test requires read, code doesn't implement)
  → Implementation: 61.7

Overall: 0.80 × 98.0 + 0.20 × 61.7 = 78.4 + 12.3 = 90.7

But: Algebraic dimension flags violation
Recommendation: "Update read() to support header_rows for round-trip consistency"
→ BLOCK (would iterate to fix read())
→ Test Result: PASS (complete solution)
```

### Statistical Expectations

**From calibration on 50 tasks**:

| Dimension | Expected ρ with success | Justification |
|-----------|-------------------------|---------------|
| Documentation | 0.3-0.5 | Documented code shows clearer thinking |
| Algebraic | 0.4-0.6 | Dual operations critical for I/O tasks |
| Bijective | 0.5-0.7 | Alignment with tests directly predicts success |

**Cost-benefit**:
- Added cost: $0.15-0.45 per evaluation
- Cache hit rate after 20 evals: ~60-70%
- Amortized cost: ~$0.10 per evaluation
- Benefit: 10-15% improvement in solve rate (33% → 40-45%)
- ROI: High (still <<< human cost of $200-800/fix)

---

## Feature Flags & Configuration

### Environment Variables

```bash
# Enable new dimensions (default: off for expensive ones)
export ENABLE_DOCUMENTATION_COMPLETENESS=true   # Default: true (cheap)
export ENABLE_ALGEBRAIC_COMPLETENESS=false      # Default: false (expensive)
export ENABLE_BIJECTIVE_REQUIREMENTS=false      # Default: false (expensive)

# LLM configuration
export DOCUMENTATION_USE_LLM_VALIDATION=false   # Default: false (heuristics)
export ALGEBRAIC_COMPLETION_MODEL=gpt-5-mini    # Default: gpt-5-mini
export BIJECTIVE_REQUIREMENTS_MODEL=gpt-5-mini  # Default: gpt-5-mini

# Cache configuration
export QUALITY_DIMENSION_CACHE_FILE=.quality-dimension-cache.json
export QUALITY_DIMENSION_CACHE_MAX_AGE_DAYS=90

# Cost limits
export MAX_DIMENSION_COST_PER_EVAL=1.0  # USD, abort if exceeded
```

### Programmatic Configuration (Python)

```python
from quality_gate import ExtendedQualityGateConfig, evaluate_extended_quality_gate

config = ExtendedQualityGateConfig(
    enable_documentation_completeness=True,
    enable_algebraic_completeness=True,   # Enable for treatment group
    enable_bijective_requirements=True,    # Enable for treatment group
    algebraic_model="gpt-5-mini",
    bijective_model="gpt-5-mini"
)

result = evaluate_extended_quality_gate(
    reasoning=reasoning,
    diff=diff,
    codebase_context=context,
    problem_statement=problem,
    config=config
)
```

### Programmatic Configuration (TypeScript)

```typescript
import { ExtendedQualityGateConfig, evaluateExtendedQualityGate } from './quality-gate';

const config: ExtendedQualityGateConfig = {
  enableDocumentationCompleteness: true,
  enableAlgebraicCompleteness: true,
  enableBijectiveRequirements: true,
  algebraicModel: 'gpt-5-mini',
  bijectiveModel: 'gpt-5-mini'
};

const result = await evaluateExtendedQualityGate({
  reasoning,
  diff,
  codebaseContext,
  problemStatement,
  config
});
```

---

## Success Metrics

### Immediate (After Implementation)
- [ ] All 3 new dimensions implemented in Python
- [ ] All 3 new dimensions implemented in TypeScript
- [ ] Content-based caching working with >60% hit rate after 20 evals
- [ ] Feature flags functional
- [ ] Documentation complete

### Short-term (After Calibration)
- [ ] Algebraic dimension catches astropy-14182 missing read() issue
- [ ] Each new dimension correlates with success (ρ > 0.3, p < 0.05)
- [ ] Cost per evaluation < $0.50 with caching
- [ ] No false positives on correctly complete solutions

### Long-term (After Experiment)
- [ ] New dimensions improve solve rate by ≥5% (p < 0.05)
- [ ] Combined 8 dimensions achieve ρ > 0.6 with success
- [ ] System catches >80% of incomplete solutions that existing dimensions miss
- [ ] Cost per success < $100 (vs $200-800 human cost)

---

## Conclusion

These three new dimensions address the gap where high reasoning quality doesn't guarantee complete solutions:

1. **Documentation Completeness** forces explicit reasoning about code changes
2. **Algebraic Completeness** ensures dual operations exist (read/write, encode/decode)
3. **Bijective Requirements** verifies bidirectional traceability from requirements to code

Together with content-based caching, feature flags, and the existing 5 Bayesian dimensions, this creates a comprehensive quality gate system that catches both reasoning and implementation gaps.

**Next step**: Implement in Python, port to TypeScript, validate on SWE-bench tasks, measure impact.
