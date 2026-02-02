# Objectivity and Determinism Analysis of Quality Dimensions

## Question: Are these dimensions stable, objective, and deterministic across different LLMs?

**Goal**: Maximize inter-model agreement so that dimensions measure ground truth properties of code, not model biases.

## Dimension 6: Documentation Completeness

### Deterministic Components (Model-Independent)

**Symbol counting** (100% deterministic):
```typescript
// AST-based extraction (no LLM needed)
const symbols = parseAST(code).filter(node =>
  node.type === 'VariableDeclaration' ||
  node.type === 'FunctionDeclaration' ||
  node.type === 'ClassDeclaration'
);

const documented = symbols.filter(symbol => hasComment(symbol));
const ratio = documented.length / symbols.length;  // [0, 1]
```

**File/directory checking** (100% deterministic):
```typescript
const files = getFilesInDiff(diff);
const documentedFiles = files.filter(f => hasHeaderComment(f));
const fileRatio = documentedFiles.length / files.length;

const dirs = getDirectoriesInDiff(diff);
const documentedDirs = dirs.filter(d => hasREADME(d));
const dirRatio = documentedDirs.length / dirs.length;
```

**Scoring** (100% deterministic):
```typescript
score = Math.pow(
  Math.pow(symbolRatio, 0.5) *
  Math.pow(fileRatio, 0.3) *
  Math.pow(dirRatio, 0.2),
  1.0
);
```

### Optional LLM Component (If Enabled)

**Comment quality validation** (model-dependent):
- "Is this comment accurate and informative?"
- Different models may disagree on comment quality
- **Mitigation**: Make this OPTIONAL (default: OFF)
- **Alternative**: Simple heuristics (length > 10 chars, contains verbs, etc.)

### Objectivity Score: **9/10**

- Core measurement is deterministic (AST parsing)
- Optional LLM validation adds subjectivity
- **Recommendation**: Use purely deterministic version by default

---

## Dimension 7: Algebraic Completeness

### Deterministic Components (Partial)

**Lexical pattern matching** (80% deterministic):
```typescript
// Detect common dual patterns without LLM
const dualPatterns = [
  ['read', 'write'],
  ['encode', 'decode'],
  ['serialize', 'deserialize'],
  ['create', 'delete'],
  ['get', 'set'],
  ['add', 'remove'],
  ['open', 'close'],
  ['acquire', 'release']
];

// Check if both members of pair are present
function detectDualsByLexicon(operations: string[]): number {
  let detected = 0;
  for (const [op1, op2] of dualPatterns) {
    if (operations.includes(op1) || operations.includes(op2)) {
      const hasBoth = operations.includes(op1) && operations.includes(op2);
      detected += hasBoth ? 1 : 0.5;  // Partial credit
    }
  }
  return detected;
}
```

**Type signature analysis** (70% deterministic):
```typescript
// For typed languages (TypeScript, Python with types)
// Check if inverse type signatures exist
function hasInverseSignature(
  op1: {params: Type[], return: Type},
  op2: {params: Type[], return: Type}
): boolean {
  // write: (Data) -> String
  // read: (String) -> Data
  return (
    op1.return === op2.params[0] &&
    op2.return === op1.params[0]
  );
}
```

### LLM-Dependent Components (Model-Dependent)

**Category inference** (model-dependent):
- Given operations: `write()`, `read()`, `validate()`
- Model must infer: "This is I/O category with duals: read ↔ write"
- Different models may categorize differently
- **Inter-model agreement**: Unknown (needs empirical test)

**Domain-specific duals** (model-dependent):
- Lexicon only covers common patterns
- Domain-specific duals need LLM inference
- Example: In crypto code, `encrypt ↔ decrypt` obvious, but what about `hash`? (No dual)
- Models may disagree on what operations SHOULD have duals

### Objectivity Score: **6/10**

**Problems**:
1. Category inference is subjective
2. "Expected duals" count is model-dependent
3. Domain-specific knowledge varies by model

**Improvements to Increase Objectivity**:

#### Option A: Hybrid Deterministic + LLM (Recommended)

```typescript
function algebraicCompleteness(operations: Operation[]): number {
  // Step 1: Deterministic lexical matching (weight: 60%)
  const lexicalScore = checkLexicalDuals(operations);

  // Step 2: Type signature analysis (weight: 20%)
  const typeScore = checkTypeInverses(operations);

  // Step 3: LLM inference for domain-specific (weight: 20%)
  const llmScore = await llmInferDuals(operations);

  return 0.6 * lexicalScore + 0.2 * typeScore + 0.2 * llmScore;
}
```

**Benefits**:
- 80% of score is deterministic
- LLM only fills gaps for domain-specific patterns
- Reduces model dependence

#### Option B: Multi-Model Consensus (High Confidence)

```typescript
async function algebraicCompletenessWithConsensus(
  operations: Operation[]
): Promise<number> {
  // Query multiple models
  const models = ['gpt-5-mini', 'gpt-5-nano', 'claude-sonnet-4'];
  const scores = await Promise.all(
    models.map(model => evaluateWithModel(operations, model))
  );

  // Check inter-model agreement
  const variance = computeVariance(scores);

  if (variance < 0.1) {
    // High agreement → trustworthy
    return mean(scores);
  } else {
    // Low agreement → fall back to deterministic only
    return deterministicAlgebraicScore(operations);
  }
}
```

**Benefits**:
- Detects when models disagree
- Falls back to deterministic when uncertain
- Confidence metric included

#### Option C: Ground Truth Annotation (Most Objective)

```typescript
// Precompute category mappings for common libraries
const categoryGroundTruth = {
  'File I/O': {
    operations: ['read', 'write', 'open', 'close'],
    dualPairs: [['read', 'write'], ['open', 'close']],
    expectedDuals: 4
  },
  'Serialization': {
    operations: ['serialize', 'deserialize', 'encode', 'decode'],
    dualPairs: [['serialize', 'deserialize'], ['encode', 'decode']],
    expectedDuals: 4
  },
  // ... precomputed for stdlib/common libraries
};

function algebraicCompletenessGroundTruth(
  operations: Operation[]
): number {
  // Match against ground truth first
  for (const [category, spec] of Object.entries(categoryGroundTruth)) {
    if (matches(operations, spec.operations)) {
      return countDuals(operations, spec.dualPairs) / spec.expectedDuals;
    }
  }

  // Fall back to LLM for unknown categories
  return await llmInferDuals(operations);
}
```

**Benefits**:
- 100% deterministic for common patterns
- LLM only for rare/novel code
- Can be improved over time with more annotations

---

## Dimension 8: Bijective Requirements Alignment

### Deterministic Components (Minimal)

**Claim counting** (only after extraction):
```typescript
// Once claims are extracted, counting is deterministic
const imperativeClaims = [...];  // From LLM
const declarativeClaims = [...];  // From LLM
const testClaims = [...];  // From LLM
const codeClaims = [...];  // From LLM

// Matching is deterministic (exact string match)
const matches = imperativeClaims.filter(ic =>
  declarativeClaims.some(dc => ic.subject === dc.subject &&
                                ic.predicate === dc.predicate &&
                                ic.object === dc.object)
);

const score = matches.length / imperativeClaims.length;  // [0, 1]
```

### LLM-Dependent Components (Highly Model-Dependent)

**Claim extraction** (highly subjective):
```
Issue: "Please support header_rows in RestructuredText output"

Model A extracts:
  - { subject: "RST", predicate: "supports", object: "header_rows" }

Model B extracts:
  - { subject: "output", predicate: "accepts", object: "header_rows" }
  - { subject: "write", predicate: "uses", object: "header_rows" }

Model C extracts:
  - { subject: "write", predicate: "accepts", object: "header_rows" }
  - { subject: "read", predicate: "accepts", object: "header_rows" }  // Inferred!
```

**Problems**:
1. Different granularity (1 vs 2 vs 3 claims)
2. Different vocabulary (supports vs accepts vs uses)
3. Different inference depth (explicit vs implicit requirements)

**Semantic matching** (model-dependent):
```typescript
// Are these semantically equivalent?
claim1 = { subject: "RST", predicate: "supports", object: "header_rows" }
claim2 = { subject: "write", predicate: "accepts", object: "header_rows" }

// Model must decide if "RST supports X" ≈ "write accepts X"
// Models may disagree!
```

### Objectivity Score: **3/10**

**This is the LEAST objective dimension.**

**Improvements to Increase Objectivity**:

#### Option A: Structured Requirements (Recommended)

**Instead of extracting from natural language, require structured input:**

```typescript
// Developer provides structured requirements (or generated once, cached)
interface StructuredRequirement {
  imperative: LogicTuple[];
  declarative: LogicTuple[];
  acceptance_criteria: LogicTuple[];
}

const requirement: StructuredRequirement = {
  imperative: [
    { subject: "write", predicate: "accepts", object: "header_rows" },
    { subject: "read", predicate: "accepts", object: "header_rows" }
  ],
  declarative: [
    { subject: "RSTWriter.write", predicate: "implements", object: "header_rows_param" },
    { subject: "RSTReader.read", predicate: "implements", object: "header_rows_param" }
  ],
  acceptance_criteria: [
    { subject: "test_rst_header_rows", predicate: "validates", object: "write_with_header_rows" },
    { subject: "test_rst_header_rows", predicate: "validates", object: "read_with_header_rows" }
  ]
};

// Now matching is 100% deterministic (exact tuple matching)
function bijectiveAlignment(req: StructuredRequirement, code: CodeClaims): number {
  // Deterministic tuple matching
  const impToDecl = matchTuples(req.imperative, req.declarative);
  const declToTest = matchTuples(req.declarative, req.acceptance_criteria);
  const testToCode = matchTuples(req.acceptance_criteria, code.tuples);

  return Math.pow(impToDecl * declToTest * testToCode, 1/3);
}
```

**Benefits**:
- 100% deterministic matching
- No model dependence
- Clear, unambiguous requirements
- **Cost**: Requires upfront structuring

#### Option B: Multi-Model Consensus + Semantic Embeddings

```typescript
async function bijectiveAlignmentWithConsensus(
  requirements: string,
  tests: string,
  code: string
): Promise<number> {
  // Extract claims from multiple models
  const models = ['gpt-5-mini', 'claude-sonnet-4', 'gpt-5-nano'];

  const extractions = await Promise.all(
    models.map(m => extractClaims(requirements, tests, code, m))
  );

  // Use semantic embeddings for fuzzy matching (more stable)
  const claim1 = { subject: "RST", predicate: "supports", object: "header_rows" };
  const claim2 = { subject: "write", predicate: "accepts", object: "header_rows" };

  const sim = cosineSimilarity(
    embed(claim1),  // Deterministic embedding
    embed(claim2)
  );

  const match = sim > 0.85;  // Threshold

  // Aggregate across models
  return aggregateScores(extractions);
}
```

**Benefits**:
- Semantic embeddings more stable than LLM judgments
- Multi-model reduces single-model bias
- **Cost**: More expensive (3x LLM calls)

#### Option C: Test-Code Alignment Only (Most Objective)

**Skip natural language requirements entirely:**

```typescript
// Only measure Test ↔ Code alignment (objective)
function testCodeAlignment(tests: Test[], diff: Diff): number {
  // Extract operations from tests (deterministic parsing)
  const testOperations = parseTestCalls(tests);
  // Examples: ["write(header_rows=...)", "read(header_rows=...)"]

  // Extract operations from code (deterministic parsing)
  const codeOperations = parseDiffOperations(diff);
  // Examples: ["write(header_rows)"]

  // Deterministic matching
  const testToCoverage = testOperations.filter(top =>
    codeOperations.some(cop => operationMatches(top, cop))
  );

  const codeToCoverage = codeOperations.filter(cop =>
    testOperations.some(top => operationMatches(cop, top))
  );

  const forward = testToCoverage.length / testOperations.length;
  const backward = codeToCoverage.length / codeOperations.length;

  return Math.sqrt(forward * backward);
}
```

**Benefits**:
- 100% deterministic (no LLM)
- Directly measures test-code consistency
- Fast and cheap
- **Tradeoff**: Doesn't verify requirements alignment

---

## Summary Table

| Dimension | Objectivity | Inter-Model Agreement (Est.) | Deterministic Component | Recommendation |
|-----------|-------------|------------------------------|-------------------------|----------------|
| **Dimension 6: Documentation** | 9/10 | 95%+ | AST parsing, comment detection | ✅ Use purely deterministic version |
| **Dimension 7: Algebraic** | 6/10 | 70-80% | Lexical patterns, type signatures | ⚠️ Use hybrid (80% deterministic + 20% LLM) |
| **Dimension 8: Bijective** | 3/10 | 50-60% | Minimal (only counting) | ❌ Replace with structured requirements OR test-code alignment only |

## Recommendations for Maximizing Objectivity

### High Priority (Implement Now)

1. **Dimension 6**: Make LLM validation OPTIONAL and OFF by default
   - Use pure AST-based symbol/file/directory counting
   - 100% deterministic, 0% model-dependent

2. **Dimension 7**: Use hybrid approach
   ```typescript
   score = 0.6 * lexicalDuals + 0.2 * typeInverses + 0.2 * llmInference
   ```
   - 80% deterministic
   - LLM only for domain-specific edge cases

3. **Dimension 8**: **Two options**

   **Option A - Pragmatic**: Test-code alignment only (no requirements)
   ```typescript
   score = testCodeAlignmentDeterministic(tests, code)  // 100% deterministic
   ```

   **Option B - Comprehensive**: Structured requirements (one-time LLM, then cached)
   ```typescript
   // Generate structured requirement ONCE with LLM, cache it
   const structured = await generateStructuredRequirement(issueText);
   cache.set(issueId, structured);

   // Then all future evaluations are deterministic
   score = bijectiveAlignmentDeterministic(structured, tests, code);
   ```

### Medium Priority (Validate Later)

4. **Multi-model consensus testing**
   - Run 10 tasks through gpt-5-mini, gpt-5-nano, claude-sonnet-4
   - Measure inter-model agreement (Cohen's κ)
   - If κ < 0.6, fall back to deterministic only

5. **Ground truth annotation**
   - Build library of common operation categories
   - Start with stdlib (file I/O, serialization, CRUD, etc.)
   - Expand over time based on usage

---

## Empirical Validation Plan

### Experiment: Measure Inter-Model Agreement

**Protocol**:
1. Select 20 diverse SWE-bench tasks
2. Evaluate each task with 3 different models:
   - gpt-5-mini
   - gpt-5-nano
   - claude-sonnet-4
3. Compute scores for each dimension with each model
4. Measure:
   - **Spearman ρ** between model pairs (should be > 0.8)
   - **Cohen's κ** for pass/fail decisions (should be > 0.6)
   - **Mean absolute difference** (should be < 0.1 on [0,1] scale)

**Success Criteria**:
- **Dimension 6**: ρ > 0.95 (deterministic, should be near-perfect)
- **Dimension 7**: ρ > 0.75 (hybrid, expect some variation)
- **Dimension 8**: ρ > 0.60 (LLM-heavy, expect more variation)

**If criteria not met**:
- Fall back to more deterministic versions
- Use multi-model consensus
- Add structured requirement input

---

## Final Recommendation

**Maximize objectivity by using this configuration:**

```typescript
const config = {
  // Dimension 6: Pure deterministic (no LLM)
  documentationCompleteness: {
    useLLM: false,  // ← Force deterministic
    method: 'ast_based'
  },

  // Dimension 7: Hybrid (80% deterministic)
  algebraicCompleteness: {
    lexicalWeight: 0.6,    // Deterministic pattern matching
    typeWeight: 0.2,       // Deterministic type analysis
    llmWeight: 0.2,        // LLM for edge cases
    groundTruthLibrary: true  // Use precomputed categories when available
  },

  // Dimension 8: Test-code only (100% deterministic)
  bijectiveRequirements: {
    mode: 'test_code_only',  // Skip requirements extraction
    method: 'ast_based'
  }
};
```

**With this configuration**:
- Overall objectivity: **8/10**
- Inter-model agreement: **85%+**
- Deterministic component: **85%+**
- LLM dependence: **15%** (only for Dimension 7 edge cases)

**Tradeoff**:
- We lose the "requirements → test" traceability in Dimension 8
- But we gain stability and objectivity
- Can add structured requirements later as enhancement
