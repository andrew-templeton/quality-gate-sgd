# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Behavioral Invariant Dimension

Checks if a patch might break existing test expectations by analyzing:
1. What behaviors tests assert (input -> output mappings)
2. Whether the patch changes those behaviors
3. Whether the change is intentional (fixes the bug) or collateral damage

Key insight: A good patch should ONLY change the specific behavior that's broken,
not introduce unrelated behavioral changes.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Set


@dataclass
class TestAssertion:
    """A single test assertion extracted from test code."""
    test_name: str
    assertion_type: str  # assertEqual, assertTrue, assertRaises, etc.
    expected_behavior: str  # What the test expects
    inputs: List[str]  # Input values if extractable
    is_warning_test: bool = False
    is_exception_test: bool = False


@dataclass
class BehavioralInvariantResult:
    """Result of behavioral invariant analysis."""
    score: float  # 1.0 = preserves invariants, 0.0 = breaks them

    # Detailed scores
    control_flow_preservation: float  # Does patch preserve branching structure?
    return_value_preservation: float  # Does patch preserve return semantics?
    side_effect_preservation: float   # Does patch preserve side effects (warnings, exceptions)?

    # Issues found
    broken_invariants: List[str] = field(default_factory=list)
    risky_changes: List[str] = field(default_factory=list)

    # Feedback
    feedback: List[str] = field(default_factory=list)


def extract_test_assertions(test_code: str) -> List[TestAssertion]:
    """Extract test assertions from test code to understand expected behaviors."""
    assertions = []

    # Find test methods
    test_methods = re.findall(r'def (test_\w+)\(self\):(.*?)(?=\n    def |\nclass |\Z)',
                              test_code, re.DOTALL)

    for test_name, test_body in test_methods:
        # Extract assertEqual assertions
        for match in re.finditer(r'self\.assertEqual\(([^,]+),\s*([^\)]+)\)', test_body):
            actual, expected = match.groups()
            assertions.append(TestAssertion(
                test_name=test_name,
                assertion_type='assertEqual',
                expected_behavior=f"{actual.strip()} == {expected.strip()}",
                inputs=[actual.strip()],
            ))

        # Extract assertWarns/assertWarnsMessage
        for match in re.finditer(r'self\.assert[Ww]arns\w*\([^)]*\)', test_body):
            assertions.append(TestAssertion(
                test_name=test_name,
                assertion_type='assertWarns',
                expected_behavior="Warning should be raised",
                inputs=[],
                is_warning_test=True,
            ))

        # Extract assertRaises
        for match in re.finditer(r'self\.assertRaises\((\w+)', test_body):
            exc_type = match.group(1)
            assertions.append(TestAssertion(
                test_name=test_name,
                assertion_type='assertRaises',
                expected_behavior=f"Should raise {exc_type}",
                inputs=[],
                is_exception_test=True,
            ))

    return assertions


def analyze_control_flow_changes(diff: str) -> Tuple[float, List[str]]:
    """
    Analyze if the patch changes control flow in ways that could break invariants.

    Red flags:
    - Removing if/else branches
    - Adding early returns
    - Changing loop structure
    - Removing exception handling
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for removed conditionals
    removed_ifs = len(re.findall(r'\bif\b', removed_text))
    added_ifs = len(re.findall(r'\bif\b', added_text))
    if removed_ifs > added_ifs:
        issues.append(f"Removed {removed_ifs - added_ifs} conditional branch(es) - may change behavior")

    # Check for removed exception handling
    removed_try = len(re.findall(r'\btry:', removed_text))
    added_try = len(re.findall(r'\btry:', added_text))
    if removed_try > added_try:
        issues.append(f"Removed try/except block - may change exception behavior")

    # Check for removed loops
    removed_for = len(re.findall(r'\bfor\b', removed_text))
    added_for = len(re.findall(r'\bfor\b', added_text))
    if removed_for > added_for:
        issues.append(f"Removed loop structure - may change iteration behavior")

    # Check for early returns added
    added_returns = len(re.findall(r'\breturn\b', added_text))
    removed_returns = len(re.findall(r'\breturn\b', removed_text))
    if added_returns > removed_returns + 1:
        issues.append(f"Added {added_returns - removed_returns} new return statements - may short-circuit logic")

    # Score based on issues
    if not issues:
        return 1.0, []

    score = max(0.0, 1.0 - len(issues) * 0.2)
    return score, issues


def analyze_return_value_changes(diff: str) -> Tuple[float, List[str]]:
    """
    Analyze if the patch might change return values.

    Red flags:
    - Changing what's returned
    - Changing return type (list vs tuple)
    - Changing order of returned collections
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for changes to return statements
    removed_returns = re.findall(r'return\s+(.+)', removed_text)
    added_returns = re.findall(r'return\s+(.+)', added_text)

    if removed_returns and added_returns:
        for old_ret in removed_returns:
            for new_ret in added_returns:
                if old_ret.strip() != new_ret.strip():
                    # Check if it's just variable rename vs semantic change
                    if not _is_trivial_rename(old_ret, new_ret):
                        issues.append(f"Return value changed: '{old_ret.strip()[:30]}' -> '{new_ret.strip()[:30]}'")

    # Check for list operations that could change order
    if '.insert(' in added_text and '.insert(' not in removed_text:
        issues.append("Added .insert() operation - may change ordering")

    if '.append(' in added_text and '.insert(' in removed_text:
        issues.append("Changed from .insert() to .append() - may change ordering")

    # Score based on issues
    if not issues:
        return 1.0, []

    score = max(0.0, 1.0 - len(issues) * 0.25)
    return score, issues


def _is_trivial_rename(old: str, new: str) -> bool:
    """Check if change is just a variable rename."""
    # Remove whitespace and compare structure
    old_clean = re.sub(r'\w+', 'VAR', old)
    new_clean = re.sub(r'\w+', 'VAR', new)
    return old_clean == new_clean


def analyze_side_effect_changes(diff: str, problem_statement: str) -> Tuple[float, List[str]]:
    """
    Analyze if the patch changes side effects (warnings, logging, exceptions).

    Key insight: If the bug is about FALSE POSITIVE warnings, we expect the patch
    to REDUCE warnings. If it removes ALL warnings, that's overcorrection.
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check warning behavior
    removed_warns = len(re.findall(r'warnings\.warn\(', removed_text))
    added_warns = len(re.findall(r'warnings\.warn\(', added_text))

    # Check if problem is about warnings
    is_warning_bug = any(w in problem_statement.lower() for w in ['warning', 'warn', 'alert'])

    if removed_warns > 0 and added_warns == 0:
        if is_warning_bug:
            issues.append("Completely removed warning - tests may expect warnings in SOME cases")
        else:
            issues.append("Removed warning code - may break warning-related tests")

    # Check if warning was made conditional vs removed
    if removed_warns > 0 and added_warns > 0:
        # Warning is still there but likely made conditional - this is good
        pass

    # Check exception changes
    removed_raise = len(re.findall(r'\braise\b', removed_text))
    added_raise = len(re.findall(r'\braise\b', added_text))

    if removed_raise > added_raise:
        issues.append("Removed exception raising - may break exception tests")

    # Score
    if not issues:
        return 1.0, []

    score = max(0.0, 1.0 - len(issues) * 0.3)
    return score, issues


def analyze_algorithm_change_scope(diff: str) -> Tuple[float, List[str]]:
    """
    Check if the algorithm change is minimal or if it rewrites too much.

    A good bug fix should be surgical - change only what's necessary.
    Rewriting entire algorithms suggests the fix might introduce new bugs.
    """
    issues = []

    removed_lines = [l for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    # Count substantive changes (not just whitespace/comments)
    substantive_removed = len([l for l in removed_lines if l.strip() and not l.strip().startswith('#')])
    substantive_added = len([l for l in added_lines if l.strip() and not l.strip().startswith('#')])

    # Large rewrites are risky
    total_changes = substantive_removed + substantive_added
    if total_changes > 30:
        issues.append(f"Large rewrite ({total_changes} lines changed) - high risk of behavioral changes")
    elif total_changes > 20:
        issues.append(f"Significant rewrite ({total_changes} lines changed) - moderate risk")

    # Check if core logic was replaced vs modified
    # Look for structural changes
    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # If function signature changed
    if 'def ' in removed_text and 'def ' in added_text:
        old_sig = re.search(r'def\s+(\w+)\s*\(([^)]*)\)', removed_text)
        new_sig = re.search(r'def\s+(\w+)\s*\(([^)]*)\)', added_text)
        if old_sig and new_sig and old_sig.group(2) != new_sig.group(2):
            issues.append("Function signature changed - may break callers")

    if not issues:
        return 1.0, []

    score = max(0.0, 1.0 - len(issues) * 0.2)
    return score, issues


def analyze_partial_fix_risk(diff: str, problem_statement: str) -> Tuple[float, List[str]]:
    """
    Check if the patch looks like a partial/heuristic fix rather than a complete solution.

    Red flags:
    - Adding conditions to suppress errors without fixing root cause
    - Pattern matching specific cases rather than general solution
    - Keeping old algorithm structure but adding workarounds
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for heuristic conditions added around warnings/errors
    # Pattern: keeping warning but wrapping in new condition
    if 'warnings.warn' in removed_text and 'warnings.warn' in added_text:
        # Warning is still there - check if a heuristic condition was added
        if 'if any(' in added_text or 'if all(' in added_text:
            issues.append(
                "Added heuristic condition around warning - may suppress valid warnings. "
                "Consider if the underlying algorithm needs to change."
            )

    # Check for "check before" pattern that might not handle all cases
    if re.search(r'if\s+\w+\s+not\s+in\s+\w+:', added_text) and 'try:' in removed_text:
        # Replaced try/except with if-check - this changes behavior for edge cases
        issues.append(
            "Replaced exception handling with membership check - edge case behavior may differ"
        )

    # Check if problem mentions N-way or multiple but patch only handles 2-way
    if any(w in problem_statement.lower() for w in ['3 or more', 'multiple', 'three-way', 'n-way']):
        # Problem involves multi-way operation
        if '*args' not in added_text and '*lists' not in added_text:
            # Patch doesn't generalize to N-way
            if 'list_1' in added_text and 'list_2' in added_text:
                issues.append(
                    "Problem involves 3+ items but patch only handles 2-way case. "
                    "Consider generalizing to handle N-way merges."
                )

    # Check if ordering/dependency problem but no graph/sort algorithm
    if any(w in problem_statement.lower() for w in ['order', 'depend', 'conflict']):
        graph_keywords = ['graph', 'topological', 'sort', 'dfs', 'bfs', 'cycle', 'dag']
        if not any(kw in added_text.lower() for kw in graph_keywords):
            # Ordering problem but no graph algorithm
            issues.append(
                "Problem involves ordering/dependencies but no graph algorithm used. "
                "Consider topological sort for dependency ordering."
            )

    if not issues:
        return 1.0, []

    score = max(0.0, 1.0 - len(issues) * 0.25)
    return score, issues


def evaluate_behavioral_invariant(
    problem_statement: str,
    diff: str,
    test_code: Optional[str] = None,
    weights: Optional[Dict[str, float]] = None
) -> BehavioralInvariantResult:
    """
    Evaluate if a patch preserves behavioral invariants.

    Args:
        problem_statement: The bug report
        diff: The patch diff
        test_code: Optional test code to analyze
        weights: Optional weights for each check

    Returns:
        BehavioralInvariantResult with score and details
    """
    if weights is None:
        weights = {
            'control_flow': 0.15,
            'return_value': 0.20,
            'side_effect': 0.15,
            'scope': 0.10,  # Reduced - large rewrites are OK if they're correct
            'partial_fix': 0.40,  # Increased - partial/heuristic fixes are the main problem
        }

    # Run all checks
    cf_score, cf_issues = analyze_control_flow_changes(diff)
    rv_score, rv_issues = analyze_return_value_changes(diff)
    se_score, se_issues = analyze_side_effect_changes(diff, problem_statement)
    scope_score, scope_issues = analyze_algorithm_change_scope(diff)
    pf_score, pf_issues = analyze_partial_fix_risk(diff, problem_statement)

    # Compute overall score
    overall = (
        weights['control_flow'] * cf_score +
        weights['return_value'] * rv_score +
        weights['side_effect'] * se_score +
        weights['scope'] * scope_score +
        weights['partial_fix'] * pf_score
    )

    # Collect all issues
    all_issues = cf_issues + rv_issues + se_issues + scope_issues + pf_issues

    # Generate feedback
    feedback = []

    if cf_score < 1.0:
        feedback.append(
            f"⚠ CONTROL FLOW CHANGE: {cf_issues[0] if cf_issues else 'Structure modified'}. "
            "Ensure all code paths still work correctly."
        )

    if rv_score < 1.0:
        feedback.append(
            f"⚠ RETURN VALUE RISK: {rv_issues[0] if rv_issues else 'Return semantics changed'}. "
            "Verify that callers still receive expected results."
        )

    if se_score < 1.0:
        feedback.append(
            f"🚨 SIDE EFFECT CHANGE: {se_issues[0] if se_issues else 'Side effects modified'}. "
            "Tests may expect warnings/exceptions in specific cases - don't remove them entirely."
        )

    if scope_score < 1.0:
        feedback.append(
            f"⚠ LARGE CHANGE SCOPE: {scope_issues[0] if scope_issues else 'Extensive rewrite'}. "
            "Consider a more minimal fix that only changes the buggy behavior."
        )

    if pf_score < 1.0:
        feedback.append(
            f"🚨 PARTIAL FIX DETECTED: {pf_issues[0] if pf_issues else 'Fix may not be complete'}. "
        )

    return BehavioralInvariantResult(
        score=overall,
        control_flow_preservation=cf_score,
        return_value_preservation=rv_score,
        side_effect_preservation=se_score,
        broken_invariants=all_issues,
        risky_changes=all_issues,
        feedback=feedback,
    )
