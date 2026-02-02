# Algebraic Completeness Quality Dimensions

## Dimension 6: Documentation Completeness (Syntactic)

### Purpose
Force explicit reasoning about every code modification to prevent implicit assumptions.

### Grading Criteria

```python
documentation_completeness = {
    "modified_functions": [
        {
            "function_name": str,
            "has_docstring": bool,
            "docstring_explains_purpose": bool,
            "new_parameters_documented": bool,
            "return_type_documented": bool
        }
    ],
    "new_variables": [
        {
            "variable_name": str,
            "has_inline_comment": bool,
            "comment_explains_purpose": bool,
            "type_is_clear": bool
        }
    ],
    "modified_files": [
        {
            "file_path": str,
            "changes_have_comments": bool,
            "complex_logic_explained": bool
        }
    ],
    "score": float  # 0-100
}
```

### Scoring Logic

```python
def score_documentation_completeness(diff, code_context):
    """
    Evaluate documentation for all touched code elements.

    Deductions:
    - -20 for each undocumented new function
    - -10 for each undocumented new variable
    - -5 for each modified function without updated docstring
    - -15 for each complex logic block (>5 lines) without comment
    """
    score = 100.0

    # Parse diff to extract:
    new_functions = extract_new_functions(diff)
    new_variables = extract_new_variables(diff)
    modified_functions = extract_modified_functions(diff)
    complex_blocks = extract_complex_logic(diff)

    for func in new_functions:
        if not has_docstring(func):
            score -= 20
        elif not docstring_explains_purpose(func):
            score -= 10

    for var in new_variables:
        if not has_inline_comment(var):
            score -= 10
        elif not comment_explains_purpose(var):
            score -= 5

    for func in modified_functions:
        if not docstring_updated(func):
            score -= 5

    for block in complex_blocks:
        if not has_explanatory_comment(block):
            score -= 15

    return max(0, score)
```

### Prompt for LLM Evaluation

```
Analyze the code diff for documentation completeness:

For each new function, variable, or modified logic block:
1. Does it have a comment/docstring?
2. Does the comment explain WHY, not just WHAT?
3. Are all parameters and return values documented?
4. Is complex logic (conditionals, loops, algorithms) explained?

Grade on 0-100 scale:
- 100: Every code element has clear, purposeful documentation
- 80: Most elements documented, minor gaps
- 60: Some documentation, significant gaps
- 40: Minimal documentation
- 0: No documentation on new/changed code

Return score and list of undocumented elements.
```

---

## Dimension 7: Algebraic Completeness (Semantic)

### Mathematical Foundation

#### Category Theory Representation

Code modifications operate in a category `Code`:
- Objects: Types (data structures, classes)
- Morphisms: Functions/operations

A **complete field** over type `T` requires:

```
Field(T) = {
    Operations: { op₁, op₂, ..., opₙ },
    Duality: ∀ op ∈ Operations, ∃ dual(op),
    Closure: ∀ op, op(T) ⊆ T,
    Identity: ∃ e ∈ T such that op(e) = e,
    Inverse: ∀ op, ∃ op⁻¹ such that op⁻¹ ∘ op ≈ id
}
```

#### Specific Pattern: I/O Duality

For serialization/deserialization over type `T`:

```
SerializationField(T) = {
    write: T → Serialized(T),
    read: Serialized(T) → T,

    Constraint: read ∘ write ≈ id_T (round-trip)
}
```

If diff modifies `write`, must also modify/verify `read`.

#### Generalized Operator Duality Patterns

| Pattern | Operation | Dual | Constraint |
|---------|-----------|------|------------|
| I/O | write | read | round-trip |
| CRUD | create | delete | lifecycle |
| Transform | encode | decode | bijection |
| State | get | set | consistency |
| Collection | add | remove | cardinality |
| Validation | check | fix | correctness |

### Implementation

```python
def score_algebraic_completeness(diff, codebase_context):
    """
    Evaluate algebraic completeness of code modifications.

    Checks:
    1. Operator duality (if write modified, is read also modified?)
    2. Type closure (do operations preserve type invariants?)
    3. Field completeness (are all required operations present?)
    """
    score = 100.0
    issues = []

    # Step 1: Identify modified operations
    modified_ops = extract_operations(diff)

    # Step 2: For each operation, identify its dual
    for op in modified_ops:
        dual_op = find_dual_operation(op, codebase_context)

        if dual_op is None:
            # No dual exists - check if one is needed
            if requires_dual(op):
                score -= 40
                issues.append({
                    "type": "missing_dual",
                    "operation": op.name,
                    "expected_dual": infer_dual_name(op),
                    "reason": f"{op.name} is a {op.category} operation requiring dual"
                })
        elif not is_modified(dual_op, diff):
            # Dual exists but wasn't modified
            if should_modify_dual(op, dual_op, diff):
                score -= 30
                issues.append({
                    "type": "unmodified_dual",
                    "operation": op.name,
                    "dual": dual_op.name,
                    "reason": "Dual operation likely needs corresponding changes"
                })

    # Step 3: Check type closure
    new_types = extract_new_types(diff)
    for typ in new_types:
        if not has_complete_operations(typ, codebase_context):
            score -= 20
            issues.append({
                "type": "incomplete_operations",
                "data_type": typ.name,
                "missing": list_missing_operations(typ)
            })

    # Step 4: Check field structure
    modified_types = extract_modified_types(diff)
    for typ in modified_types:
        field_check = verify_field_properties(typ, diff)
        if not field_check.is_complete:
            score -= 15
            issues.append({
                "type": "field_incomplete",
                "data_type": typ.name,
                "violations": field_check.violations
            })

    return {
        "score": max(0, score),
        "issues": issues,
        "algebraic_properties": analyze_algebraic_structure(diff)
    }
```

### Dual Operation Detection (Generic)

```python
def find_dual_operation(operation, codebase):
    """
    Generic dual operation finder using name patterns and type signatures.
    """
    # Pattern 1: Lexical duals
    dual_pairs = [
        ("write", "read"),
        ("encode", "decode"),
        ("serialize", "deserialize"),
        ("marshal", "unmarshal"),
        ("pack", "unpack"),
        ("create", "delete"),
        ("add", "remove"),
        ("insert", "extract"),
        ("push", "pop"),
        ("get", "set"),
        ("load", "save"),
        ("import", "export"),
        ("acquire", "release"),
        ("lock", "unlock"),
        ("open", "close"),
        ("begin", "end"),
        ("start", "stop"),
        ("enable", "disable"),
        ("validate", "sanitize")
    ]

    op_name = operation.name.lower()
    for op1, op2 in dual_pairs:
        if op1 in op_name:
            dual_name = op_name.replace(op1, op2)
            dual = find_function_by_name(dual_name, codebase)
            if dual:
                return dual
        if op2 in op_name:
            dual_name = op_name.replace(op2, op1)
            dual = find_function_by_name(dual_name, codebase)
            if dual:
                return dual

    # Pattern 2: Type signature duals
    # If op: A → B, look for dual: B → A
    if operation.return_type and operation.parameters:
        input_type = operation.parameters[0].type
        output_type = operation.return_type

        dual = find_function_with_signature(
            input_type=output_type,
            output_type=input_type,
            codebase=codebase
        )
        if dual:
            return dual

    # Pattern 3: Inverse operations (mathematical)
    # Look for operations that compose to identity
    candidates = find_operations_on_same_type(operation.type, codebase)
    for candidate in candidates:
        if is_inverse_operation(operation, candidate, codebase):
            return candidate

    return None
```

### Round-Trip Property Verification

```python
def verify_round_trip_property(write_op, read_op, test_cases):
    """
    Verify that read ∘ write ≈ id

    For I/O operations, this is the fundamental completeness check.
    """
    for test_input in test_cases:
        # Apply write then read
        serialized = write_op(test_input)
        reconstructed = read_op(serialized)

        # Check if approximately equal (allows for lossy conversions)
        if not approximately_equal(test_input, reconstructed):
            return False, f"Round-trip failed for {test_input}"

    return True, "Round-trip property verified"
```

### Type Algebra Completeness Check

```python
def verify_field_properties(type_def, operations):
    """
    Verify field-theoretic completeness for a type.

    Checks:
    1. Closure: All operations return same type or compatible types
    2. Identity: Neutral element operations exist
    3. Inverse: Reversible operations have inverses
    4. Associativity: Operation composition is associative
    """
    violations = []

    # Check closure
    for op in operations:
        if not type_compatible(op.return_type, type_def):
            violations.append(f"Operation {op.name} violates closure")

    # Check for identity operations
    identity_ops = find_identity_operations(type_def, operations)
    if not identity_ops:
        violations.append("No identity operation found")

    # Check for inverse operations
    for op in operations:
        if is_reversible(op):
            inverse = find_inverse(op, operations)
            if not inverse:
                violations.append(f"Reversible operation {op.name} missing inverse")

    return {
        "is_complete": len(violations) == 0,
        "violations": violations
    }
```

---

## Prompt Template for LLM Evaluation

```
You are evaluating a code diff for algebraic completeness.

## Mathematical Framework

Code modifications should respect **field algebra** over types:

1. **Duality**: Operations come in pairs (write/read, encode/decode, etc.)
2. **Closure**: Operations preserve type invariants
3. **Inverse**: Reversible operations must have inverses
4. **Round-trip**: For I/O, read(write(x)) ≈ x

## Evaluation Task

Given the diff:
{diff}

And codebase context:
{codebase_context}

Answer these questions:

### 1. Modified Operations
List all functions/methods modified in the diff.
For each, identify:
- Operation type (I/O, CRUD, Transform, State, etc.)
- Input type(s)
- Output type(s)

### 2. Dual Operations
For each modified operation, does its dual exist?

Examples:
- If `write(data, format="rst")` is modified, does `read(data, format="rst")` exist?
- If `encode(x)` is modified, does `decode(y)` exist?
- If `serialize(obj)` is modified, does `deserialize(bytes)` exist?

### 3. Completeness Check
For each modified operation WITHOUT a modified dual:
- Should the dual also be modified? (Yes/No)
- Why or why not? (Explain reasoning)
- If yes, what specific changes are needed?

### 4. Type Closure
Do all modified operations preserve type invariants?
- Are return types consistent?
- Are parameter types used correctly?

### 5. Round-Trip Property
For I/O operations, can you verify:
```
read(write(x, params), params) ≈ x
```

Does the diff maintain this property?

## Scoring
Based on your analysis, assign a score (0-100):
- 100: Complete algebraic structure, all duals present/modified
- 80: Minor gaps, dual operations exist but may need updates
- 60: Significant gap, important dual missing or unmodified
- 40: Multiple missing duals, type closure violations
- 0: Fundamental incompleteness

Return:
{
  "score": float,
  "modified_operations": [...],
  "missing_duals": [...],
  "unmodified_duals": [...],
  "type_closure_violations": [...],
  "recommendations": [...]
}
```

---

## Integration with Quality Gate System

```python
class AlgebraicCompletenessEvaluator:
    """
    Evaluates code changes for algebraic completeness.
    """

    def __init__(self, llm_client):
        self.llm = llm_client
        self.dual_patterns = self._load_dual_patterns()

    def evaluate(self, diff, codebase_context, problem_statement):
        """
        Run both documentation and algebraic completeness checks.
        """
        # Phase 1: Documentation completeness (blocking)
        doc_score = self._evaluate_documentation(diff)

        if doc_score < 70:
            return {
                "dimension": "documentation_completeness",
                "score": doc_score,
                "passed": False,
                "message": "Insufficient documentation. Add comments to all new/modified code.",
                "next_step": "improve_documentation"
            }

        # Phase 2: Algebraic completeness (after docs pass)
        alg_score = self._evaluate_algebraic_structure(
            diff,
            codebase_context,
            problem_statement
        )

        return {
            "dimensions": {
                "documentation_completeness": doc_score,
                "algebraic_completeness": alg_score["score"]
            },
            "passed": alg_score["score"] >= 70,
            "issues": alg_score["issues"],
            "recommendations": alg_score["recommendations"]
        }

    def _evaluate_algebraic_structure(self, diff, context, problem):
        """
        LLM-based algebraic completeness evaluation.
        """
        prompt = self._build_algebraic_prompt(diff, context, problem)
        response = self.llm.query(prompt)

        # Parse LLM response
        analysis = parse_algebraic_analysis(response)

        # Apply scoring logic
        score = 100.0
        issues = []

        for missing_dual in analysis["missing_duals"]:
            score -= 40
            issues.append({
                "severity": "high",
                "type": "missing_dual",
                "operation": missing_dual["operation"],
                "expected_dual": missing_dual["expected"]
            })

        for unmodified_dual in analysis["unmodified_duals"]:
            score -= 25
            issues.append({
                "severity": "medium",
                "type": "unmodified_dual",
                "operation": unmodified_dual["operation"],
                "dual": unmodified_dual["dual"],
                "recommendation": unmodified_dual["why_modify"]
            })

        return {
            "score": max(0, score),
            "issues": issues,
            "recommendations": self._generate_recommendations(analysis)
        }
```

---

## Example Application to astropy-14182

### Documentation Completeness Evaluation

```python
# Agent's original diff (without comments)
"""
def __init__(
    self,
    col_starts=None,
    col_ends=None,
    header_rows=None,
):
    super().__init__(
        col_starts=col_starts,
        col_ends=col_ends,
        delimiter_pad=None,
        bookend=False,
        header_rows=header_rows,
    )
"""

# Score: 60/100
# Issues:
# - No docstring update explaining new parameters (-20)
# - No inline comment explaining what header_rows does (-10)
# - write() method has complex logic without explanation (-10)
```

### Algebraic Completeness Evaluation

```python
analysis = {
    "modified_operations": [
        {
            "name": "__init__",
            "type": "constructor",
            "new_parameters": ["header_rows"]
        },
        {
            "name": "write",
            "type": "serialization",
            "input": "Table",
            "output": "str"
        }
    ],
    "missing_duals": [],  # __init__ doesn't need dual
    "unmodified_duals": [
        {
            "operation": "write",
            "dual": "read",
            "exists": True,
            "modified": False,
            "should_modify": True,
            "reason": "write() now supports header_rows parameter, but read() doesn't accept it. Round-trip property violated: read(write(table, header_rows=['name', 'unit'])) will fail."
        }
    ],
    "score": 75  # -25 for unmodified dual
}
```

---

## Why This Doesn't Overfit

This approach is generic because it operates on **universal algebraic structures**:

1. **Duality is fundamental** across all domains:
   - I/O: read/write
   - Network: send/receive
   - Graphics: project/unproject
   - Crypto: encrypt/decrypt
   - Compression: compress/decompress

2. **Type closure is universal**: Functions should preserve type invariants

3. **Field completeness**: Mathematical structures (groups, fields, categories) provide generic completeness criteria

4. **Pattern matching is extensible**: New dual pairs can be added without changing the framework

This works because **good software design mirrors mathematical structures**. The algebra isn't imposed—it's discovered from the code's inherent structure.
