# Feedback Improvements: Intent Comments + Enhanced Bijective

## Summary

Created two major improvements to make quality feedback actually actionable for Claude:

1. **Intent Documentation** (vs docstrings) - Comments explaining WHY/HOW
2. **Enhanced Bijective Feedback** - Specific missing operations with code examples

---

## 1. Intent Documentation vs Docstrings

### The Problem

**Docstrings** (what we were detecting):
```python
def calculate_sum(a, b):
    """Calculate the sum of two numbers."""  # ← API documentation
    return a + b
```

**Intent Comments** (what you actually want):
```python
def calculate_sum(a, b):
    # Intent: Provide addition operation for numeric types
    # Why: Core arithmetic needed by calculator module
    # Note: Preserves input types (int+int=int, float+float=float)
    return a + b
```

### The Solution

New `IntentDocumentationEvaluator` that detects:

**1. Intent keywords**:
- `intent:`, `why:`, `because`, `reason:`
- `note:`, `important:`, `caveat:`
- `handles`, `ensures`, `guarantees`
- `workaround`, `hack:`, `edge case`

**2. Substantial comments** (>30 chars explaining logic)

**3. Purpose comments** before:
- Complex blocks (if/for/while/try)
- Functions/methods
- Files (file-level purpose)

### Examples of Good Intent Comments

**Python**:
```python
# Intent: Validate input before processing
# Why: Prevents downstream errors in calculation pipeline
if not isinstance(x, (int, float)):
    raise TypeError("Expected numeric type")

# Note: This handles the edge case where divisor is zero
# Workaround: Return infinity instead of raising exception
result = numerator / divisor if divisor != 0 else float('inf')
```

**TypeScript**:
```typescript
// Intent: Debounce search to prevent API spam
// Why: User typing triggers too many requests
// Important: 300ms delay balances UX and server load
const debouncedSearch = debounce(handleSearch, 300);
```

### Feedback Format

**Before** (useless):
```
🔴 DOCUMENTATION: 0.00 (missing)
```

**After** (actionable):
```
🔴 INTENT DOCUMENTATION: 0.35 (needs improvement)

Gaps identified:
  - 3 functions without intent comments
  - 5 complex blocks without explanation
  - 1 file without purpose comment

Example: Add intent comment before calculate_header_rows() at rst.py:45
  # Intent: Convert table metadata to RST header format
  # Why: Tests expect specific header row syntax
  # Handles: Multi-row headers and column spanning
```

---

## 2. Enhanced Bijective Feedback

### The Problem

**Before** (too vague):
```
🔴 BIJECTIVE: 0.00 (room for improvement: 1.0000)
  → Test-code alignment weak
  → Ensure all test requirements are implemented
```

**What Claude needs**:
- WHAT operation is missing
- WHERE to add it
- CODE EXAMPLE of what to add

### The Solution

New `EnhancedBijectiveFeedbackGenerator` that:

1. **Extracts operations from test code**
   - Method calls: `obj.write_header_rows()`
   - Function calls: `read_table()`
   - Attributes: `obj.header_rows`

2. **Extracts operations from patch**
   - Function definitions: `def write(...)`
   - Method definitions: `def read(self, ...)`

3. **Identifies gaps**
   - **Missing**: Test expects operation, code doesn't provide it
   - **Mismatch**: Similar names but don't match (write_headers vs write_header)
   - **Incomplete**: Operation exists but doesn't match test signature

4. **Generates specific suggestions**
   - What to add
   - Where to add it
   - Code example

### Example Output

**Scenario**: astropy-14182 (missing read() operation)

**Before** (vague):
```
🔴 BIJECTIVE: 0.00 (weak test-code alignment)
  → Ensure all test requirements are implemented
```

**After** (specific):
```
⚠️ TEST-CODE ALIGNMENT WEAK

Found 2 gap(s) in test-code alignment:

1. 🔴 MISSING: read_header_rows
   Test expects: read_header_rows
   Code provides: NOTHING (missing)
   → Add read_header_rows() method to RST class - test expects this operation

2. 🟡 MISMATCH: write_headers
   Test expects: write_header_rows
   Code provides: write_headers
   → Rename write_headers() to write_header_rows() to match test expectation

CONCRETE ACTIONS:
1. Add to RST: def read_header_rows(self, table): ...
2. Rename write_headers() → write_header_rows()
3. Ensure both methods handle header_rows parameter
```

### Code Examples in Feedback

For missing operations, provide **actual code templates**:

```python
# Missing: read_header_rows()
# Add this to RST class:
def read_header_rows(self, table):
    """Read header rows from table.

    Intent: Extract header information during table parsing
    Why: Enables round-trip consistency (write → read → write)
    Returns: List of header row indices
    """
    # Implementation here
    pass
```

---

## Implementation Details

### Intent Documentation Evaluator

**File**: `python/quality_gate/dimension_documentation_intent.py`

**Key methods**:
```python
class IntentDocumentationEvaluator:
    def evaluate(self, diff, file_contents):
        # Returns score based on:
        # - Complex blocks with intent comments (weight: 0.5)
        # - Functions with intent comments (weight: 0.3)
        # - Files with purpose comments (weight: 0.2)

    def _is_intent_comment(self, line):
        # Checks for:
        # 1. Intent keywords (why, because, intent, etc.)
        # 2. Substantial comments (>30 chars)
        # 3. Not just code description
```

**Scoring**:
```
score = (block_ratio^0.5 * function_ratio^0.3 * file_ratio^0.2)
```

Emphasizes complex blocks (most important for understanding).

### Enhanced Bijective Feedback Generator

**File**: `python/quality_gate/feedback_bijective_enhanced.py`

**Key methods**:
```python
class EnhancedBijectiveFeedbackGenerator:
    def generate_feedback(self, bijective_result, test_code, diff, requirements):
        # 1. Extract test operations
        # 2. Extract code operations
        # 3. Identify gaps (missing, mismatch, incomplete)
        # 4. Generate specific suggestions with code examples

    def _identify_gaps(self, bijective_result, test_code, diff):
        # Returns List[BijectiveGap] with:
        # - test_operation: What test expects
        # - code_operation: What code provides
        # - gap_type: missing/mismatch/incomplete
        # - severity: 0-1 (how important)
        # - suggestion: Specific action to fix
```

**Gap types**:
- **Missing** (severity 0.8): Test expects operation, code doesn't have it
- **Mismatch** (severity 0.5): Similar names but don't match exactly
- **Incomplete** (severity 0.6): Operation exists but wrong signature

---

## Integration

### Update Iterative Solver

Replace generic feedback with enhanced versions:

**Before**:
```python
if result.quality.documentation_completeness < 0.70:
    feedback += "🔴 DOCUMENTATION missing\n"

if result.quality.bijective_requirements < 0.70:
    feedback += "🔴 BIJECTIVE weak - test-code alignment issues\n"
```

**After**:
```python
from python.quality_gate.dimension_documentation_intent import IntentDocumentationEvaluator
from python.quality_gate.feedback_bijective_enhanced import generate_enhanced_bijective_feedback

# Intent documentation feedback
if result.quality.documentation_completeness < 0.70:
    intent_eval = IntentDocumentationEvaluator()
    intent_result = intent_eval.evaluate(diff, file_contents)
    feedback += "\n".join(intent_result.suggestions) + "\n"

# Enhanced bijective feedback
if result.quality.bijective_requirements < 0.70:
    bijective_feedback = generate_enhanced_bijective_feedback(
        result.bijective_result,
        test_code,
        diff,
        requirements
    )
    feedback += bijective_feedback + "\n"
```

---

## Expected Impact

### Intent Documentation

**Before**: 0.00 on all tasks (no docstrings)

**After**: Higher scores (0.30-0.60 expected) because:
- Claude naturally adds inline comments
- Intent keywords are common in Claude's style
- Purpose comments are good practice

**Feedback improvement**:
- Was: "Documentation missing" (useless)
- Now: "Add intent comment before calculate_header_rows() explaining why" (actionable)

### Enhanced Bijective

**Before**: 0.00 on astropy-14182, stayed 0.00 across iterations

**After**: Should improve because:
- Specific operations identified: "Add read_header_rows()"
- Code examples provided
- Concrete actions listed

**Feedback improvement**:
- Was: "Test-code alignment weak" (vague)
- Now: "Add to RST: def read_header_rows(self, table): ..." (specific)

---

## Testing Plan

### 1. Test Intent Documentation

Run on existing patches to see new scores:

```bash
python test_intent_documentation.py
```

Expected results:
- astropy-14182: 0.00 → 0.40 (Claude adds some comments)
- django-11999: 0.00 → 0.35 (minimal comments)
- sympy-13647: 0.00 → 0.45 (more complex, more comments)

### 2. Test Enhanced Bijective Feedback

Re-run iterative solver with enhanced feedback:

```bash
python run_iterative_swe_bench_enhanced.py
```

Expected results for astropy-14182:
```
Iteration 1: Bij=0.00
  Feedback: "Add to RST: def read_header_rows(self, table): ..."

Iteration 2: Bij=0.50 (Claude added read_header_rows skeleton)
  Feedback: "Complete read_header_rows() implementation"

Iteration 3: Bij=1.00 (Claude completed implementation)
  ✓ Converged
```

### 3. Compare Before vs After

Run 3 tasks with both feedback versions:

| Task | Old Feedback (Bij) | New Feedback (Bij) | Improvement |
|------|-------------------|-------------------|-------------|
| astropy-14182 | 0.00 → 0.00 → 0.00 | 0.00 → 0.50 → 1.00 | ✅ +1.00 |
| django-11999 | 1.00 → 1.00 → 1.00 | 1.00 → 1.00 → 1.00 | = (already perfect) |
| sympy-13647 | 1.00 → 1.00 → 1.00 | 1.00 → 1.00 → 1.00 | = (already perfect) |

---

## Examples: Before vs After

### Example 1: astropy-14182 (Missing read())

**Before**:
```
🔴 DOCUMENTATION: 0.0000 (room for improvement: 1.0000)
🔴 BIJECTIVE: 0.0000 (room for improvement: 1.0000)
  → Test-code alignment weak
  → Ensure all test requirements are implemented
🟢 ALGEBRAIC: 1.0000 (room for improvement: 0.0000)
```

**After**:
```
🔴 INTENT DOCUMENTATION: 0.35 (needs improvement)
  - Add intent comment before write_header_rows() at rst.py:67
    Example: # Intent: Format table header rows for RST output
  - Add purpose comment to rst.py explaining file's role

⚠️ TEST-CODE ALIGNMENT WEAK
Found 1 gap in test-code alignment:

1. 🔴 MISSING: read_header_rows
   Test expects: read_header_rows
   Code provides: NOTHING (missing)
   → Add read_header_rows() method to RST class

CONCRETE ACTION:
Add to RST class:
```python
def read_header_rows(self, table):
    # Intent: Extract header row information during parsing
    # Why: Enables round-trip consistency with write_header_rows()
    # Returns: List of indices indicating header rows
    pass
```

🟢 ALGEBRAIC: 1.00 (complete)
```

### Example 2: Complex Function Needing Intent

**Before**:
```
🔴 DOCUMENTATION: 0.00
```

**After**:
```
🔴 INTENT DOCUMENTATION: 0.40

Missing intent comments:
  - Function calculate_optimal_width() at layout.py:145
    → Add comment explaining HOW the calculation works
    → Explain WHY this specific formula is used

  - For-loop at layout.py:156
    → Add comment explaining edge cases handled
    → Clarify intent of nested iteration

Example:
# Intent: Calculate column widths that minimize table height
# Why: Wide tables wrap poorly in terminal output
# Algorithm: Dynamic programming with greedy column selection
# Edge cases: Single column (no wrapping), very wide content (force wrap)
def calculate_optimal_width(columns, max_width):
    ...
```

---

## Recommendations

### 1. Use Intent Documentation Everywhere

Replace docstring detector with intent comment detector:

```python
# Old
from python.quality_gate.dimension_documentation import DocumentationCompletenessEvaluator

# New
from python.quality_gate.dimension_documentation_intent import IntentDocumentationEvaluator
```

**Benefit**: Actually measures useful documentation (WHY/HOW) not just API docs.

### 2. Always Use Enhanced Bijective Feedback

For bijective dimension < 0.70, generate enhanced feedback:

```python
if bijective_score < 0.70:
    feedback = generate_enhanced_bijective_feedback(
        bijective_result,
        test_code,
        diff,
        requirements
    )
```

**Benefit**: Claude gets specific operations to add, not vague suggestions.

### 3. Weight Intent Documentation Higher

Since intent comments are more actionable:

**Old weights**:
- Documentation (docstrings): 0.10
- Algebraic: 0.05
- Bijective: 0.05

**New weights**:
- Intent Documentation: 0.15 (higher - more valuable)
- Algebraic: 0.05
- Bijective: 0.10 (higher - more actionable with enhanced feedback)

---

## Next Steps

1. **Integrate into run_iterative_swe_bench.py**
   - Replace feedback generation with enhanced versions
   - Re-run on 3 tasks
   - Measure improvement in bijective scores

2. **Test on astropy-14182 specifically**
   - Verify enhanced feedback identifies missing read()
   - Check if Claude adds the method in iteration 2

3. **Run on 10 tasks with new feedback**
   - Measure: bijective improvement rate
   - Measure: intent documentation scores
   - Compare: old vs new feedback effectiveness

4. **Tune weights based on results**
   - If intent documentation scores well, keep 0.15
   - If bijective improves with feedback, keep 0.10
   - Adjust based on correlation with test success

---

## Conclusion

**Intent Documentation** fixes the "useless documentation dimension" problem by detecting comments that actually explain WHY/HOW, not just API documentation.

**Enhanced Bijective Feedback** fixes the "vague feedback" problem by providing specific missing operations with code examples.

**Expected result**: Claude should now be able to act on feedback and improve bijective scores across iterations, especially on astropy-14182 where it should add the missing read() operation.

**Ready to test**: Both improvements are implemented and ready for integration into the iterative solver.
