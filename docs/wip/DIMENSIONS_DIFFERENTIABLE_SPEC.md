# Three New Quality Dimensions: Differentiable Formulation

## Core Principle: Smooth, Ratio-Based Scoring

All dimensions must be:
1. **Continuous**: No discrete jumps (no fixed -20 point deductions)
2. **Differentiable**: Smooth gradients for optimization
3. **Ratio-based**: 0 ≤ score ≤ 1 (not percentages, pure scalars)
4. **Composable**: Can measure within diff only OR entire codebase

## Dimension 6: Documentation Completeness (Syntactic)

### Formulation

```typescript
// For a given scope (diff only, or entire codebase)
interface DocumentationMetrics {
  declaredSymbols: number;      // Total const/let/var/function/class declarations
  documentedSymbols: number;    // Declarations with comments/docstrings
  files: number;                // Total files in scope
  documentedFiles: number;      // Files with header comments
  directories: number;          // Total directories touched
  documentedDirectories: number; // Directories with README/PURPOSE.md
}

// Hierarchical scoring
function documentationCompleteness(metrics: DocumentationMetrics): number {
  // Symbol-level completeness (finest granularity)
  const symbolRatio = metrics.documentedSymbols / metrics.declaredSymbols;

  // File-level completeness
  const fileRatio = metrics.documentedFiles / metrics.files;

  // Directory-level completeness
  const dirRatio = metrics.documentedDirectories / metrics.directories;

  // Weighted geometric mean (emphasizes weakest layer)
  // Weights: symbols (50%), files (30%), directories (20%)
  return Math.pow(
    Math.pow(symbolRatio, 0.5) *
    Math.pow(fileRatio, 0.3) *
    Math.pow(dirRatio, 0.2),
    1.0
  );
}
```

### Properties

- **Range**: [0, 1] where 0 = no documentation, 1 = complete documentation
- **Differentiable**: Smooth ratios at each level
- **Hierarchical**: Captures documentation at symbol → file → directory levels
- **Geometric mean**: Penalizes imbalance (can't have 100% symbols but 0% files)

### Scope Variants

**Diff-only mode** (for patch evaluation):
```typescript
const diffMetrics = extractDocumentationMetrics(diff);
const diffScore = documentationCompleteness(diffMetrics);
// Measures: "What % of new/modified code is documented?"
```

**Codebase mode** (for completeness analysis):
```typescript
const codebaseMetrics = extractDocumentationMetrics(entireCodebase);
const codebaseScore = documentationCompleteness(codebaseMetrics);
// Measures: "What % of entire codebase is documented?"
```

## Dimension 7: Algebraic Completeness (Category Theory)

### Formulation

```typescript
interface CategoryMetrics {
  definedOperations: Operation[];    // All operations in scope
  categories: OperationCategory[];   // Inferred categories (I/O, CRUD, Transform, etc.)
}

interface OperationCategory {
  name: string;                      // "I/O", "CRUD", "Serialization", etc.
  operations: Operation[];           // Operations in this category
  expectedDuals: number;             // Expected operations (pairs, triples, etc.)
  actualDuals: number;               // Actual operations present
}

// For each category, compute completeness
function categoryCompleteness(category: OperationCategory): number {
  // Ratio of actual vs expected operations
  return category.actualDuals / category.expectedDuals;
}

// Overall algebraic completeness
function algebraicCompleteness(metrics: CategoryMetrics): number {
  if (metrics.categories.length === 0) {
    // No categories detected → can't evaluate
    // Return 1.0 (neutral, no evidence of incompleteness)
    return 1.0;
  }

  // Arithmetic mean across all categories
  // (Could use geometric mean for stricter requirement)
  const categoryScores = metrics.categories.map(categoryCompleteness);
  return categoryScores.reduce((sum, s) => sum + s, 0) / categoryScores.length;
}
```

### Example: astropy-14182

```typescript
// Detected category: I/O (RestructuredText serialization)
const ioCategory = {
  name: "I/O",
  operations: [
    { name: "write", signature: "(self, lines, header_rows) -> List[str]", modified: true },
    { name: "read", signature: "(self, lines, header_rows) -> Table", modified: false }
  ],
  expectedDuals: 2,  // I/O always has read + write
  actualDuals: 2     // Both exist in codebase
};

// But only write() was modified
// Category completeness in DIFF scope:
const diffOperations = ioCategory.operations.filter(op => op.modified);
const diffExpectedDuals = 2;  // Still expect both for completeness
const diffActualDuals = 1;    // Only write() modified

const score = diffActualDuals / diffExpectedDuals;  // 1/2 = 0.5
// Score: 0.5 (50% complete in diff scope)
```

### Properties

- **Range**: [0, 1] where 0 = all categories incomplete, 1 = all complete
- **Differentiable**: Smooth ratio per category
- **Neutral on absence**: If no categories detected, return 1.0 (no evidence of problem)
- **Composable**: Can sum across all detected categories
- **Category detection**: LLM infers categories from operation patterns

### Category Detection Algorithm

```typescript
// Step 1: Extract operations from scope (diff or codebase)
const operations = extractOperations(scope);

// Step 2: Use LLM to infer categories and expected duals
const prompt = `
Given these operations:
${operations.map(op => `- ${op.name}: ${op.signature}`).join('\n')}

For each operation, identify:
1. Category (I/O, CRUD, Serialization, Transform, State, Collection, Resource, Validation)
2. Expected dual operations (e.g., write → read, encode → decode)
3. Whether dual exists in the provided operations

Return JSON:
{
  "categories": [
    {
      "name": "I/O",
      "operations": ["write", "read"],
      "expectedDuals": 2,
      "actualDuals": 2,
      "missingDuals": []
    }
  ]
}
`;

// Step 3: Compute completeness per category
// Step 4: Average across categories
```

### Scoring Variants

**Diff-only** (strict):
- Only count modified operations
- Expected duals = all duals in category
- Measures: "Did the diff update all related operations?"

**Diff + Context** (lenient):
- Count modified + existing operations in same category
- Expected duals = all duals in category
- Measures: "Are all duals present in codebase (even if not modified)?"

**Codebase-wide**:
- All operations in codebase
- Measures: "Is the entire codebase categorically complete?"

## Dimension 8: Bijective Requirements Alignment (Logic)

### Formulation

```typescript
interface ClaimGraph {
  imperativeClaims: LogicTuple[];    // From "I want X to Y"
  declarativeClaims: LogicTuple[];   // Rephrased as specifications
  testClaims: LogicTuple[];          // From test plan
  codeClaims: LogicTuple[];          // From code implementation
}

type LogicTuple = {
  subject: string;    // "write", "header_rows", "RST"
  predicate: string;  // "supports", "accepts", "outputs"
  object: string;     // "parameter", "format", "header"
  source: string;     // Where this came from (imperative, spec, test, code)
};

// Phase 1: Imperative → Declarative completeness
function imperativeToDeclarative(graph: ClaimGraph): number {
  // Every imperative claim should be addressed in declarative spec
  const imperativeMapped = graph.imperativeClaims.filter(impClaim =>
    graph.declarativeClaims.some(decClaim => semanticMatch(impClaim, decClaim))
  );

  const forward = imperativeMapped.length / graph.imperativeClaims.length;

  // Every declarative claim should trace to imperative
  const declarativeMapped = graph.declarativeClaims.filter(decClaim =>
    graph.imperativeClaims.some(impClaim => semanticMatch(impClaim, decClaim))
  );

  const backward = declarativeMapped.length / graph.declarativeClaims.length;

  // Bijection = both directions complete
  return Math.sqrt(forward * backward);  // Geometric mean
}

// Phase 2: Declarative → Test completeness
function declarativeToTest(graph: ClaimGraph): number {
  const declarativeMapped = graph.declarativeClaims.filter(decClaim =>
    graph.testClaims.some(testClaim => semanticMatch(decClaim, testClaim))
  );

  const forward = declarativeMapped.length / graph.declarativeClaims.length;

  const testMapped = graph.testClaims.filter(testClaim =>
    graph.declarativeClaims.some(decClaim => semanticMatch(decClaim, testClaim))
  );

  const backward = testMapped.length / graph.testClaims.length;

  return Math.sqrt(forward * backward);
}

// Phase 3: Test → Code completeness
function testToCode(graph: ClaimGraph): number {
  const testMapped = graph.testClaims.filter(testClaim =>
    graph.codeClaims.some(codeClaim => semanticMatch(testClaim, codeClaim))
  );

  const forward = testMapped.length / graph.testClaims.length;

  const codeMapped = graph.codeClaims.filter(codeClaim =>
    graph.testClaims.some(testClaim => semanticMatch(testClaim, codeClaim))
  );

  const backward = codeMapped.length / graph.codeClaims.length;

  return Math.sqrt(forward * backward);
}

// Overall bijective alignment
function bijectiveRequirements(graph: ClaimGraph): number {
  const impToDecl = imperativeToDeclarative(graph);
  const declToTest = declarativeToTest(graph);
  const testToCode = testToCode(graph);

  // Three-way geometric mean
  return Math.pow(impToDecl * declToTest * testToCode, 1/3);
}
```

### Example: astropy-14182

```typescript
const graph: ClaimGraph = {
  imperativeClaims: [
    { subject: "RST output", predicate: "supports", object: "header_rows", source: "imperative" }
  ],
  declarativeClaims: [
    // LLM expands "support header_rows" to both read and write
    { subject: "write", predicate: "accepts", object: "header_rows", source: "declarative" },
    { subject: "read", predicate: "accepts", object: "header_rows", source: "declarative" }
  ],
  testClaims: [
    { subject: "write", predicate: "works_with", object: "header_rows", source: "test" },
    { subject: "read", predicate: "works_with", object: "header_rows", source: "test" }
  ],
  codeClaims: [
    { subject: "write", predicate: "implements", object: "header_rows", source: "code" }
    // read is missing!
  ]
};

// Phase 1: Imperative → Declarative
// 1 imperative claim → 2 declarative claims (LLM expanded correctly)
// Forward: 1/1 = 1.0 (imperative mapped)
// Backward: 2/2 = 1.0 (declarative mapped)
// Score: sqrt(1.0 * 1.0) = 1.0 ✓

// Phase 2: Declarative → Test
// 2 declarative → 2 test claims (write + read)
// Forward: 2/2 = 1.0
// Backward: 2/2 = 1.0
// Score: sqrt(1.0 * 1.0) = 1.0 ✓

// Phase 3: Test → Code
// 2 test claims → 1 code claim (only write)
// Forward: 1/2 = 0.5 (only write implemented)
// Backward: 1/1 = 1.0 (write is tested)
// Score: sqrt(0.5 * 1.0) = 0.707

// Overall: (1.0 * 1.0 * 0.707)^(1/3) = 0.891
// Score: 0.891 (missing read implementation detected)
```

### Properties

- **Range**: [0, 1] where 0 = no alignment, 1 = perfect bijection
- **Differentiable**: Smooth ratios at each phase
- **Three-phase**: Imperative → Declarative → Test → Code
- **Geometric mean**: Requires all phases to be complete
- **Semantic matching**: LLM determines if tuples are equivalent

### LLM Prompts for Claim Extraction

**Extract imperative claims**:
```
From this issue description, extract all imperative claims as logic tuples.

Issue: "Please support header_rows in RestructuredText output"

Return JSON array of tuples:
[
  { "subject": "RST output", "predicate": "supports", "object": "header_rows" }
]
```

**Expand to declarative specification**:
```
Given imperative claim: "RST output supports header_rows"

What operations are needed to fulfill this? Consider:
- I/O operations (read/write)
- Category completeness (if write is affected, is read also affected?)
- Implicit requirements from category theory

Return declarative claims as logic tuples:
[
  { "subject": "write", "predicate": "accepts", "object": "header_rows" },
  { "subject": "read", "predicate": "accepts", "object": "header_rows" }
]
```

**Extract test claims**:
```
From this test code, extract what is being validated as logic tuples.

Test: test_rst_with_header_rows() {
  table = QTable.read(lines, header_rows=[1, 2])
  output = table.write(format='ascii.rst', header_rows=[1, 2])
  assert ...
}

Return:
[
  { "subject": "read", "predicate": "works_with", "object": "header_rows" },
  { "subject": "write", "predicate": "works_with", "object": "header_rows" }
]
```

**Extract code claims**:
```
From this diff, extract what operations are implemented as logic tuples.

Diff:
+ def write(self, lines, header_rows=None):
+     # implementation

Return:
[
  { "subject": "write", "predicate": "implements", "object": "header_rows" }
]
```

## Integration: 8-Dimension Scoring

```typescript
interface ExtendedQualityScore {
  // Group A: Reasoning (80% weight)
  priorClarity: number;           // [0, 1]
  hypothesisCoherence: number;    // [0, 1]
  evidenceAlignment: number;      // [0, 1]
  solutionConsistency: number;    // [0, 1]
  outcomeObservability: number;   // [0, 1]

  // Group B: Implementation (20% weight)
  documentationCompleteness: number;  // [0, 1]
  algebraicCompleteness: number;      // [0, 1]
  bijectiveRequirements: number;      // [0, 1]
}

function computeOverallQuality(scores: ExtendedQualityScore): number {
  // Group A: Reasoning (weighted average)
  const reasoning = (
    0.15 * scores.priorClarity +
    0.20 * scores.hypothesisCoherence +
    0.20 * scores.evidenceAlignment +
    0.15 * scores.solutionConsistency +
    0.10 * scores.outcomeObservability
  ) / 0.80;  // Normalize to [0, 1]

  // Group B: Implementation (weighted average)
  const implementation = (
    0.10 * scores.documentationCompleteness +
    0.05 * scores.algebraicCompleteness +
    0.05 * scores.bijectiveRequirements
  ) / 0.20;  // Normalize to [0, 1]

  // Combined (80/20 split)
  const overall = 0.80 * reasoning + 0.20 * implementation;

  // All scores are [0, 1], so overall is [0, 1]
  return overall;
}

// Convert to percentage for display
function displayScore(score: number): number {
  return score * 100;  // [0, 100]
}
```

## Differentiability Properties

### Smooth Gradients

All dimensions use **division** (ratios), which is differentiable:

```
∂/∂x (a/b) = 1/b - a/b²  (when b is function of x)
```

Example: Documentation completeness
```
score = documented / total

∂score/∂documented = 1 / total
∂score/∂total = -documented / total²
```

### Geometric Mean Differentiability

```
f(x, y) = √(x · y)

∂f/∂x = (y / x)^(1/2) / 2
∂f/∂y = (x / y)^(1/2) / 2
```

Both are smooth and continuous for x, y > 0.

### Composition

Since all dimensions output [0, 1] and use smooth operations (multiplication, exponentiation with positive bases), the overall quality function is differentiable with respect to any input metric.

## Cache Key Computation (Unchanged)

```typescript
function computeCacheKey(inputs: {
  diff: string;
  codebaseContext: string;
  requirements: string;
  dimension: 'documentation' | 'algebraic' | 'bijective';
}): string {
  const diffHash = sha256(inputs.diff);
  const contextHash = sha256(inputs.codebaseContext);
  const reqHash = sha256(inputs.requirements);
  const version = DIMENSION_VERSIONS[inputs.dimension];

  return sha256(`${inputs.dimension}:v${version}:${diffHash}:${contextHash}:${reqHash}`);
}
```

## Summary of Changes from Fixed-Point System

| Aspect | Old (Fixed Points) | New (Ratio-Based) |
|--------|-------------------|-------------------|
| **Score range** | 0-100 with deductions | 0-1 (scalar) |
| **Documentation** | -20 for function, -10 for variable | documented / total symbols |
| **Algebraic** | -40 for missing dual | actual_duals / expected_duals |
| **Bijective** | -N points per missing claim | mapped_claims / total_claims |
| **Differentiability** | Discrete jumps | Smooth gradients |
| **Composability** | Hard to combine | Natural multiplication/averaging |
| **Display** | 98.0 | 0.98 (or 98% for UI) |

All dimensions now satisfy:
1. ✅ Continuous (no discrete jumps)
2. ✅ Differentiable (smooth gradients)
3. ✅ Ratio-based (0 ≤ score ≤ 1)
4. ✅ Composable (diff-only or codebase-wide)
5. ✅ Interpretable (ratios are intuitive)
