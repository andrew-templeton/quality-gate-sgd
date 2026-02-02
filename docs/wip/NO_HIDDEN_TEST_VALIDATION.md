# Validation: Quality Dimensions Without Hidden Test Data

## Summary

Successfully removed all hidden test data (`test_patch`) from the quality evaluation system. The system now evaluates patches using ONLY visible data:
- Problem statement (requirements)
- Code diff
- File contents

**Key Achievement**: No overfitting to hidden FAIL_TO_PASS tests.

## Changes Made

### 1. Removed `test_code` Parameter
- **File**: `python/quality_gate/evaluator_extended.py`
- **Change**: Removed `test_code` parameter from `evaluate_extended_quality_gate()`
- **Rationale**: Prevent overfitting to hidden acceptance criteria

### 2. Updated Iterative Solver
- **File**: `run_iterative_swe_bench.py`
- **Change**: No longer passes `task.get('test_patch')` to evaluator
- **Result**: System uses only `problem_statement` (visible requirements)

### 3. Refactored Bijective Dimension - Assumed Specification
- **File**: `python/quality_gate/dimension_bijective.py`
- **Key Change**: 3-phase system with "assumed spec" instead of hidden tests

**Three Phases**:
1. **Imperative → Declarative**: Extract formal requirements from problem statement
2. **Declarative → Assumed Spec**: Category completeness expansion
3. **Assumed Spec → Code**: Implementation alignment

**Assumed Spec Generation** (`_generate_assumed_spec` method):
- Takes declarative claims from requirements
- Expands with category-theoretic duals
- Example: If requirements mention "write", assumed spec includes "read"
- **Does NOT use hidden test code**

**Category-Theoretic Dual Pairs**:
```python
('read', 'write'), ('encode', 'decode'), ('get', 'set'),
('add', 'remove'), ('create', 'delete'), ('acquire', 'release'),
('open', 'close'), ('start', 'stop'), ('lock', 'unlock')
```

## Validation Test: astropy-14182

### Test Setup
- **Task**: Add `header_rows` parameter support to RST format
- **Hidden Test**: Tests BOTH `read()` and `write()` with `header_rows` (round-trip)
- **Golden Patch**: Appears to only modify `write()` method
- **Visible Requirements**: Mentions write but implies read through round-trip example

### Results

```
Overall Quality: 0.8650

Dimension Scores:
  Algebraic:      1.0000  ← Did NOT catch missing dual
  Bijective:      1.0000  ← Did NOT catch misalignment
  Documentation:  0.0000
  Reasoning:      0.9562
  Implementation: 0.5000
```

### Finding: Dimensions Not Catching Gap

**Expected**: Algebraic/bijective dimensions should score < 1.0 due to missing read/write completeness

**Actual**: Both scored 1.0 (perfect)

**Hypothesis**: The golden patch may actually include read() support (or it was already there), OR the dimension detection logic needs refinement for parameter additions vs method additions.

## Analysis: Why Dimensions Scored 1.0

### Potential Reasons

1. **Read Already Existed**: The RST format may have already supported reading, so adding `header_rows` parameter to write doesn't create asymmetry

2. **Parameter vs Method Detection**: The algebraic dimension may be looking for method-level duals (separate `read()` and `write()` methods) but this change just adds a parameter to existing methods

3. **Requirements Don't Explicitly Mention Read**: The problem statement focuses on `write()` usage, though the hidden test does test round-trip

4. **Diff Pattern Matching**: The dimension's pattern matching may not detect parameter additions as operations requiring duals

### What The Hidden Test Actually Tests

```python
# The hidden test validates BOTH operations:
tbl = QTable.read(lines, format="ascii.rst", header_rows=["name", "unit", "dtype"])  # READ
tbl.write(out, format="ascii.rst", header_rows=["name", "unit", "dtype"])            # WRITE
```

This is a **round-trip test** - reads with header_rows, then writes with header_rows.

## Implications

### Success: No Overfitting
✅ System no longer uses hidden test data
✅ Dimensions evaluate based on structural analysis only
✅ "Assumed spec" concept successfully replaces hidden test phase

### Challenge: Detection Sensitivity
⚠️ Dimensions may need tuning to catch parameter-level completeness
⚠️ Current dual detection focuses on method-level operations
⚠️ May need to enhance ontology for parameter-level bidirectionality

## Next Steps

### Option A: Tune Dimension Detection
- Enhance algebraic dimension to detect parameter additions
- Expand dual patterns to parameter-level operations
- Add heuristics for I/O parameter symmetry

### Option B: Accept Current Behavior
- If read() already existed, no incompleteness to detect
- Dimensions correctly scored 1.0 for a complete patch
- Focus validation on tasks with actual missing duals

### Option C: Test on More Tasks
- Run on tasks where golden patch clearly omits dual operations
- Validate dimensions catch method-level missing duals
- Determine if this is task-specific or systemic issue

## Conclusion

**Primary Goal Achieved**: System no longer uses hidden test data, eliminating overfitting.

**Secondary Goal Partially Achieved**: Dimensions should theoretically catch gaps through category completeness, but validation on astropy-14182 did not demonstrate this (both scored 1.0).

**Possible Explanations**:
1. Golden patch is actually complete (read was already there)
2. Detection needs enhancement for parameter-level operations
3. Test case not ideal for validating emergent completeness

**Recommendation**: Test on additional SWE-bench tasks where the golden patch clearly has missing dual operations (e.g., adds only write() method, not read()).

## Key Quote from User

> "I would expect the emergent property of my dimensional quality analysis to be that the system is able to discover hidden test requirements via completeness of the category et al, so the dimensions should work anyway."

**Status**: Architecture supports this (assumed spec generation), but needs validation on clearer test cases or dimension tuning.
