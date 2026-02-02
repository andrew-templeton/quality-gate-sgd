# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Overfitting Detection Dimension

Catches patches that overfit to specific examples rather than solving
the general problem. Key signals:

1. Literal Injection: Problem-specific strings hardcoded in solution
2. Test Deletion: Removing tests to make patch "pass"
3. Algorithm Absence: Complex problems solved with hardcoded values
4. Signature Narrowness: Not generalizing function contracts
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional


@dataclass
class OverfittingResult:
    """Result of overfitting analysis."""
    # Overall score (0 = severely overfitting, 1 = properly general)
    score: float

    # Individual signals
    literal_injection_score: float  # 1 = no injection, 0 = heavily injected
    test_integrity_score: float     # 1 = tests preserved, 0 = tests deleted
    test_gaming_score: float        # 1 = no gaming, 0 = tests manipulated
    algorithm_signal_score: float   # 1 = uses algorithms, 0 = hardcoded
    signature_generality_score: float  # 1 = generalized, 0 = narrow

    # Details for feedback
    injected_literals: List[str] = field(default_factory=list)
    deleted_tests: List[str] = field(default_factory=list)
    test_gaming_violations: List[str] = field(default_factory=list)
    missing_algorithm_signals: List[str] = field(default_factory=list)
    narrow_signatures: List[str] = field(default_factory=list)

    # Feedback
    feedback: List[str] = field(default_factory=list)


def extract_literals(text: str) -> Set[str]:
    """Extract string literals from text."""
    # Match quoted strings
    single_quoted = re.findall(r"'([^']{3,})'", text)
    double_quoted = re.findall(r'"([^"]{3,})"', text)

    # Filter out common non-meaningful strings
    noise = {'true', 'false', 'null', 'none', 'utf-8', 'utf8', 'ascii'}

    literals = set(single_quoted + double_quoted)
    return {l for l in literals if l.lower() not in noise and len(l) > 3}


def extract_identifiers(text: str) -> Set[str]:
    """Extract meaningful identifiers (filenames, class names, etc.)."""
    # Filenames with extensions
    filenames = re.findall(r'\b[\w-]+\.\w{2,4}\b', text)

    # CamelCase class names
    class_names = re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b', text)

    # snake_case identifiers (3+ chars)
    snake_case = re.findall(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b', text)

    return set(filenames + class_names + snake_case)


def check_literal_injection(
    problem_statement: str,
    diff: str,
    source_only: bool = True
) -> Tuple[float, List[str]]:
    """
    Check if problem-specific literals appear in the solution.

    Args:
        problem_statement: The bug report / requirements
        diff: The generated patch
        source_only: Only check source files, not test files

    Returns:
        (score, list of injected literals)
        score: 1.0 = no injection, 0.0 = heavily injected
    """
    # Extract literals and identifiers from problem
    problem_literals = extract_literals(problem_statement)
    problem_identifiers = extract_identifiers(problem_statement)
    problem_all = problem_literals | problem_identifiers

    # Filter out very common terms
    common = {'test', 'file', 'error', 'warning', 'message', 'value', 'data'}
    problem_all = {p for p in problem_all if p.lower() not in common}

    # Extract from diff (source files only if specified)
    if source_only:
        # Split diff by files and exclude test files
        diff_parts = re.split(r'diff --git', diff)
        source_diff = ""
        for part in diff_parts:
            if part and 'test' not in part.lower()[:100]:
                source_diff += part
        diff_to_check = source_diff
    else:
        diff_to_check = diff

    # Only check added lines (lines starting with +)
    added_lines = '\n'.join(
        line[1:] for line in diff_to_check.split('\n')
        if line.startswith('+') and not line.startswith('+++')
    )

    solution_literals = extract_literals(added_lines)
    solution_identifiers = extract_identifiers(added_lines)
    solution_all = solution_literals | solution_identifiers

    # Find injected (problem-specific literals in solution)
    injected = problem_all & solution_all

    # Filter: only flag if it looks like example data, not API names
    # Example data often has specific patterns (filenames, specific values)
    example_patterns = [
        r'\.js$', r'\.css$', r'\.py$',  # filenames
        r'\d+',  # numbers
        r'-',    # kebab-case often = example data
    ]

    flagged = []
    for lit in injected:
        if any(re.search(p, lit) for p in example_patterns):
            flagged.append(lit)

    if not flagged:
        return 1.0, []

    # Score based on how many problem literals appear in solution
    # More injected = lower score
    injection_ratio = len(flagged) / max(1, len(solution_all))
    score = max(0.0, 1.0 - injection_ratio * 2)  # Penalize heavily

    return score, flagged


def check_test_integrity(diff: str) -> Tuple[float, List[str]]:
    """
    Check if the patch deletes or weakens tests.

    Deleting tests to make a patch "pass" is a major red flag.

    Returns:
        (score, list of deleted test names)
        score: 1.0 = tests preserved, 0.0 = tests deleted
    """
    deleted_tests = []

    # Find removed lines that look like test definitions
    removed_lines = [
        line[1:] for line in diff.split('\n')
        if line.startswith('-') and not line.startswith('---')
    ]

    for line in removed_lines:
        # Test function definitions
        match = re.search(r'def\s+(test_\w+)', line)
        if match:
            deleted_tests.append(match.group(1))

        # Test class definitions
        match = re.search(r'class\s+(Test\w+)', line)
        if match:
            deleted_tests.append(match.group(1))

        # Assert statements removed
        if 'assert' in line.lower() and 'self.assert' in line.lower():
            # Extract test context if possible
            deleted_tests.append(f"assertion: {line.strip()[:50]}...")

    if not deleted_tests:
        return 1.0, []

    # Any test deletion is a major red flag
    score = 0.0 if deleted_tests else 1.0

    return score, deleted_tests


def check_test_gaming(diff: str) -> Tuple[float, List[str]]:
    """
    Check if the patch attempts to "game" tests rather than fix code.

    Test gaming patterns:
    1. Modifying expected values in assertions
    2. Adding skip decorators
    3. Weakening assertions (assertEqual -> assertIn, etc.)
    4. Wrapping assertions in try/except
    5. Adding conditionals around test logic
    6. Changing test inputs to match broken behavior

    Returns:
        (score, list of gaming violations)
        score: 1.0 = no gaming, 0.0 = severe gaming
    """
    violations = []

    # Split diff by files to identify test file changes
    file_sections = re.split(r'diff --git', diff)

    for section in file_sections:
        if not section.strip():
            continue

        # Check if this is a test file
        is_test_file = bool(re.search(r'test[s_].*\.py|_test\.py', section[:200], re.IGNORECASE))

        if not is_test_file:
            continue

        # Get added and removed lines
        added_lines = [
            line[1:] for line in section.split('\n')
            if line.startswith('+') and not line.startswith('+++')
        ]
        removed_lines = [
            line[1:] for line in section.split('\n')
            if line.startswith('-') and not line.startswith('---')
        ]

        added_text = '\n'.join(added_lines)
        removed_text = '\n'.join(removed_lines)

        # Pattern 1: Skip decorators added
        skip_patterns = [
            r'@skip', r'@pytest\.mark\.skip', r'@unittest\.skip',
            r'@pytest\.mark\.xfail', r'@expectedFailure'
        ]
        for pattern in skip_patterns:
            if re.search(pattern, added_text) and not re.search(pattern, removed_text):
                violations.append(f"Added skip decorator: {pattern}")

        # Pattern 2: Assertion weakening
        # assertEqual -> assertIn (weaker)
        # assertRaises -> pass (removed)
        # assertTrue(x == y) -> assertTrue(x in y)
        weakening_patterns = [
            (r'assertEqual', r'assertIn', "assertEqual weakened to assertIn"),
            (r'assertEqual', r'assertAlmostEqual', "assertEqual weakened to assertAlmostEqual"),
            (r'assertIs\b', r'assertEqual', "assertIs weakened to assertEqual"),
            (r'assertRaises', r'pass', "assertRaises removed"),
        ]
        for old_pat, new_pat, desc in weakening_patterns:
            if re.search(old_pat, removed_text) and re.search(new_pat, added_text):
                violations.append(desc)

        # Pattern 3: Expected values changed in assertions
        # Look for patterns like: assertEqual(result, "old") -> assertEqual(result, "new")
        removed_asserts = re.findall(
            r'assert\w+\([^)]*,\s*["\']([^"\']+)["\']', removed_text
        )
        added_asserts = re.findall(
            r'assert\w+\([^)]*,\s*["\']([^"\']+)["\']', added_text
        )
        # If expected values changed, that's suspicious
        if removed_asserts and added_asserts:
            changed = set(removed_asserts) - set(added_asserts)
            if changed:
                violations.append(f"Changed expected values in assertions: {list(changed)[:3]}")

        # Pattern 4: Try/except around assertions
        if re.search(r'try:\s*\n[^}]*assert', added_text) and not re.search(r'try:\s*\n[^}]*assert', removed_text):
            violations.append("Added try/except around assertions")

        # Pattern 5: Conditionals added around test logic
        if re.search(r'if\s+.*:\s*\n\s*assert', added_text) and not re.search(r'if\s+.*:\s*\n\s*assert', removed_text):
            # Check if it's a new conditional, not just moving code
            if not re.search(r'if\s+.*:\s*\n\s*assert', removed_text):
                violations.append("Added conditional around assertion")

        # Pattern 6: Test method signature changes (adding *args, **kwargs to swallow)
        if re.search(r'def test_\w+\([^)]*\*', added_text) and not re.search(r'def test_\w+\([^)]*\*', removed_text):
            violations.append("Test method signature changed to accept *args/**kwargs")

        # Pattern 7: Mock/patch added to bypass real behavior
        mock_additions = len(re.findall(r'@patch|@mock|Mock\(|MagicMock', added_text))
        mock_removals = len(re.findall(r'@patch|@mock|Mock\(|MagicMock', removed_text))
        if mock_additions > mock_removals + 1:  # Allow one new mock
            violations.append(f"Excessive mocking added ({mock_additions - mock_removals} new mocks)")

    if not violations:
        return 1.0, []

    # Score based on severity - each violation is serious
    score = max(0.0, 1.0 - len(violations) * 0.25)

    return score, violations


def check_algorithm_signal(
    problem_statement: str,
    diff: str
) -> Tuple[float, List[str]]:
    """
    Check if complex problems are solved with proper algorithms.

    Signals of algorithmic solutions:
    - Imports of algorithmic utilities (sort, graph, queue, etc.)
    - Use of data structures beyond basic lists/dicts

    Returns:
        (score, list of missing algorithm signals)
    """
    # Patterns suggesting problem needs algorithmic solution
    problem_complexity_signals = [
        (r'order\w*', 'ordering'),
        (r'sort\w*', 'sorting'),
        (r'depend\w*', 'dependencies'),
        (r'graph', 'graph'),
        (r'tree', 'tree'),
        (r'cycl\w*', 'cycles'),
        (r'topolog\w*', 'topological'),
        (r'merg\w*.*(?:multiple|many|several|\d{2,})', 'multi-way merge'),
    ]

    problem_lower = problem_statement.lower()
    needed_algos = []
    for pattern, algo_type in problem_complexity_signals:
        if re.search(pattern, problem_lower):
            needed_algos.append(algo_type)

    if not needed_algos:
        # Problem doesn't seem to need algorithms
        return 1.0, []

    # Check if solution imports/uses algorithmic utilities
    algo_signals = [
        r'import.*(?:sort|graph|tree|heap|queue|deque|OrderedSet)',
        r'from\s+collections\s+import',
        r'topological',
        r'defaultdict',
        r'OrderedDict',
        r'heapq',
        r'bisect',
    ]

    # Check added lines
    added_lines = '\n'.join(
        line[1:] for line in diff.split('\n')
        if line.startswith('+') and not line.startswith('+++')
    )

    found_signals = []
    for signal in algo_signals:
        if re.search(signal, added_lines, re.IGNORECASE):
            found_signals.append(signal)

    if found_signals:
        return 1.0, []

    # Problem needs algorithms but solution doesn't use any
    return 0.5, [f"Problem involves {', '.join(needed_algos)} but no algorithmic imports found"]


def check_signature_generality(diff: str) -> Tuple[float, List[str]]:
    """
    Check if function signatures are generalized appropriately.

    Good fixes often widen function contracts:
    - Fixed arity → variadic (*args)
    - Specific types → generic types

    Returns:
        (score, list of narrow signatures)
    """
    # Find function signature changes
    # Look for patterns where old signature had fixed args and new doesn't widen

    removed_sigs = re.findall(
        r'^-\s*def\s+(\w+)\s*\(([^)]*)\)',
        diff, re.MULTILINE
    )
    added_sigs = re.findall(
        r'^\+\s*def\s+(\w+)\s*\(([^)]*)\)',
        diff, re.MULTILINE
    )

    narrow_signatures = []

    for func_name, old_args in removed_sigs:
        # Find corresponding new signature
        new_sig = None
        for new_name, new_args in added_sigs:
            if new_name == func_name:
                new_sig = new_args
                break

        if new_sig is None:
            continue

        # Check if old had multiple similar args (suggesting N-ary pattern)
        old_arg_count = len([a for a in old_args.split(',') if a.strip()])
        new_arg_count = len([a for a in new_sig.split(',') if a.strip()])

        # Check for variadic
        old_variadic = '*' in old_args
        new_variadic = '*' in new_sig

        # Flag if: old had 2+ similar args, new doesn't generalize
        if old_arg_count >= 2 and not new_variadic and old_arg_count == new_arg_count:
            # Could this have been generalized?
            # Check if args have similar names (list_1, list_2 pattern)
            if re.search(r'_\d|_[abc]|\d$', old_args):
                narrow_signatures.append(
                    f"{func_name}({old_args}) -> {func_name}({new_sig}): "
                    f"could generalize to variadic"
                )

    if not narrow_signatures:
        return 1.0, []

    return 0.7, narrow_signatures


def evaluate_overfitting(
    problem_statement: str,
    diff: str,
    weights: Optional[Dict[str, float]] = None
) -> OverfittingResult:
    """
    Evaluate a patch for overfitting to the specific problem example.

    Args:
        problem_statement: The bug report / requirements
        diff: The generated patch (unified diff format)
        weights: Optional weights for each signal

    Returns:
        OverfittingResult with score and details
    """
    if weights is None:
        weights = {
            'literal_injection': 0.25,
            'test_integrity': 0.25,
            'test_gaming': 0.25,      # NEW: catches test manipulation
            'algorithm_signal': 0.15,
            'signature_generality': 0.10,
        }

    # Run all checks
    lit_score, injected = check_literal_injection(problem_statement, diff)
    test_score, deleted = check_test_integrity(diff)
    gaming_score, gaming_violations = check_test_gaming(diff)
    algo_score, missing_algo = check_algorithm_signal(problem_statement, diff)
    sig_score, narrow = check_signature_generality(diff)

    # Compute weighted score
    overall = (
        weights['literal_injection'] * lit_score +
        weights['test_integrity'] * test_score +
        weights['test_gaming'] * gaming_score +
        weights['algorithm_signal'] * algo_score +
        weights['signature_generality'] * sig_score
    )

    # Generate feedback
    feedback = []

    if lit_score < 1.0:
        feedback.append(
            f"⚠ OVERFITTING: Patch contains problem-specific literals: {injected}. "
            "Good solutions are GENERAL and don't hardcode example values."
        )

    if test_score < 1.0:
        feedback.append(
            f"🚨 TEST DELETION: Patch removes tests: {deleted}. "
            "NEVER delete tests to make a patch pass. Fix the CODE, not the tests."
        )

    if gaming_score < 1.0:
        feedback.append(
            f"🚨 TEST GAMING DETECTED: {gaming_violations}. "
            "You are modifying tests to hide bugs instead of fixing the actual code. "
            "STOP. Your job is to fix the SOURCE CODE so tests pass, NOT to change tests. "
            "Revert all test file changes and focus on the implementation."
        )

    if algo_score < 1.0:
        feedback.append(
            f"⚠ ALGORITHM MISSING: {missing_algo[0] if missing_algo else 'Complex problem needs algorithmic solution'}. "
            "Consider using proper data structures/algorithms."
        )

    if sig_score < 1.0:
        feedback.append(
            f"ℹ NARROW SIGNATURE: {narrow[0] if narrow else 'Function could be generalized'}. "
            "Consider widening function contracts (e.g., *args for N-ary operations)."
        )

    return OverfittingResult(
        score=overall,
        literal_injection_score=lit_score,
        test_integrity_score=test_score,
        test_gaming_score=gaming_score,
        algorithm_signal_score=algo_score,
        signature_generality_score=sig_score,
        injected_literals=injected,
        deleted_tests=deleted,
        test_gaming_violations=gaming_violations,
        missing_algorithm_signals=missing_algo,
        narrow_signatures=narrow,
        feedback=feedback,
    )
