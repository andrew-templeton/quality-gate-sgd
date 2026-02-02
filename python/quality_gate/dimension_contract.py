# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Contract Preservation Dimension

Checks if a patch maintains the implicit contracts of the code:
1. Return type consistency (list vs tuple, etc.)
2. Ordering guarantees (if input order matters, output order should be deterministic)
3. Side effect contracts (if function had side effects, it should still have them)
4. Idempotency preservation (if f(f(x)) == f(x), patch should preserve this)

Key insight: Many bugs are subtle contract violations that tests catch but
static analysis misses. We can detect common patterns.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional, Set


@dataclass
class ContractResult:
    """Result of contract analysis."""
    score: float

    # Individual checks
    return_type_preserved: float
    ordering_preserved: float
    mutation_preserved: float

    # Issues
    contract_violations: List[str] = field(default_factory=list)
    feedback: List[str] = field(default_factory=list)


def analyze_return_type_contract(diff: str) -> Tuple[float, List[str]]:
    """
    Check if the patch changes return types.

    Common issues:
    - list() -> tuple() or vice versa
    - Returning different collection type
    - Returning iterator vs materialized collection
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for list/tuple conversion
    if 'list(' in removed_text and 'tuple(' in added_text:
        issues.append("Changed from list() to tuple() - may break callers expecting list")
    if 'tuple(' in removed_text and 'list(' in added_text:
        issues.append("Changed from tuple() to list() - may break callers expecting tuple")

    # Check for return statement type changes
    removed_returns = re.findall(r'return\s+(\w+)\(', removed_text)
    added_returns = re.findall(r'return\s+(\w+)\(', added_text)

    if removed_returns and added_returns:
        old_types = set(removed_returns)
        new_types = set(added_returns)
        type_changes = old_types.symmetric_difference(new_types)
        if type_changes:
            issues.append(f"Return type constructor changed: {type_changes}")

    # Check for generator vs list changes
    if 'yield' in removed_text and 'yield' not in added_text:
        issues.append("Removed yield - changed from generator to eager evaluation")
    if 'yield' not in removed_text and 'yield' in added_text:
        issues.append("Added yield - changed from eager to lazy evaluation")

    if not issues:
        return 1.0, []

    return max(0.0, 1.0 - len(issues) * 0.3), issues


def analyze_ordering_contract(diff: str, problem_statement: str) -> Tuple[float, List[str]]:
    """
    Check if the patch might break ordering guarantees.

    Key patterns:
    - Using set() on ordered data (loses order)
    - Changing iteration direction
    - Using dict (pre-3.7 loses order)
    - Parallel processing (non-deterministic order)
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check if ordering matters (from problem statement)
    ordering_matters = any(w in problem_statement.lower() for w in
                          ['order', 'sequence', 'first', 'last', 'before', 'after', 'position'])

    if ordering_matters:
        # Check for set usage on ordered data - but be smart about it
        # OrderedSet preserves order, regular set for membership tests is fine
        if 'set(' in added_text and 'set(' not in removed_text:
            # Check if it's OrderedSet (preserves order) - that's acceptable
            uses_ordered_set = 'OrderedSet' in added_text or 'orderedset' in added_text.lower()

            # Check if set is used for iteration (problematic) vs membership (acceptable)
            # Pattern: "for x in some_set" where some_set is a set variable
            # vs "if x in some_set" which is just O(1) lookup
            set_var_names = re.findall(r'(\w+)\s*=\s*set\(', added_text)
            iterates_over_set = any(
                re.search(rf'for\s+\w+\s+in\s+{var_name}\b', added_text)
                for var_name in set_var_names
            )

            if not uses_ordered_set and iterates_over_set:
                issues.append(
                    "Added set() and iterating over it - sets don't preserve insertion order. "
                    "Use list or OrderedSet if order matters."
                )

        # Check for reversed() changes
        if 'reversed(' in removed_text and 'reversed(' not in added_text:
            issues.append("Removed reversed() - iteration direction changed")
        if 'reversed(' not in removed_text and 'reversed(' in added_text:
            issues.append("Added reversed() - iteration direction changed")

        # Check for sort changes
        if '.sort(' in added_text and '.sort(' not in removed_text:
            issues.append("Added .sort() - may change expected order")

    # Check for insert position changes
    if '.insert(' in removed_text and '.append(' in added_text:
        issues.append("Changed from .insert() to .append() - insertion position changed")
    if '.append(' in removed_text and '.insert(' in added_text:
        issues.append("Changed from .append() to .insert() - insertion position changed")

    # Check for index usage changes
    removed_inserts = re.findall(r'\.insert\((\w+),', removed_text)
    added_inserts = re.findall(r'\.insert\((\w+),', added_text)
    if removed_inserts and added_inserts and removed_inserts != added_inserts:
        issues.append(f"Insert index changed from {removed_inserts} to {added_inserts}")

    if not issues:
        return 1.0, []

    return max(0.0, 1.0 - len(issues) * 0.25), issues


def analyze_mutation_contract(diff: str) -> Tuple[float, List[str]]:
    """
    Check if the patch changes mutation behavior.

    Key patterns:
    - Pure function becoming impure (or vice versa)
    - In-place modification vs returning new object
    - Global state changes
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for in-place vs copy changes
    if 'list(' in removed_text and '= ' in removed_text:
        # Was creating a copy
        if '.append(' in added_text or '.extend(' in added_text or '.insert(' in added_text:
            # Now mutating
            if 'list(' not in added_text:
                issues.append("May have changed from copy-based to in-place mutation")

    # Check for global state access
    if 'global ' in added_text and 'global ' not in removed_text:
        issues.append("Added global state access - function may have unintended side effects")

    # Check for class attribute mutation
    if 'self.' in added_text and 'self.' not in removed_text:
        issues.append("Added instance state mutation - may affect other callers")

    if not issues:
        return 1.0, []

    return max(0.0, 1.0 - len(issues) * 0.25), issues


def analyze_loop_invariant(diff: str) -> Tuple[float, List[str]]:
    """
    Check if loop structure changes might break invariants.

    Key patterns:
    - Loop variable scope changes
    - Early termination changes (break/continue)
    - Loop bounds changes
    """
    issues = []

    removed_lines = [l[1:] for l in diff.split('\n') if l.startswith('-') and not l.startswith('---')]
    added_lines = [l[1:] for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++')]

    removed_text = '\n'.join(removed_lines)
    added_text = '\n'.join(added_lines)

    # Check for break/continue changes
    removed_breaks = len(re.findall(r'\bbreak\b', removed_text))
    added_breaks = len(re.findall(r'\bbreak\b', added_text))
    if removed_breaks != added_breaks:
        issues.append(f"Loop termination changed: {removed_breaks} breaks -> {added_breaks} breaks")

    removed_continues = len(re.findall(r'\bcontinue\b', removed_text))
    added_continues = len(re.findall(r'\bcontinue\b', added_text))
    if removed_continues != added_continues:
        issues.append(f"Loop continuation changed: {removed_continues} continues -> {added_continues} continues")

    # Check for loop type changes (for vs while)
    if 'for ' in removed_text and 'while ' in added_text:
        issues.append("Changed from for-loop to while-loop - iteration behavior may differ")
    if 'while ' in removed_text and 'for ' in added_text:
        issues.append("Changed from while-loop to for-loop - iteration behavior may differ")

    if not issues:
        return 1.0, []

    return max(0.0, 1.0 - len(issues) * 0.2), issues


def evaluate_contract_preservation(
    problem_statement: str,
    diff: str,
    weights: Optional[Dict[str, float]] = None
) -> ContractResult:
    """
    Evaluate if a patch preserves implicit code contracts.
    """
    if weights is None:
        weights = {
            'return_type': 0.30,
            'ordering': 0.35,
            'mutation': 0.20,
            'loop': 0.15,
        }

    # Run all checks
    rt_score, rt_issues = analyze_return_type_contract(diff)
    ord_score, ord_issues = analyze_ordering_contract(diff, problem_statement)
    mut_score, mut_issues = analyze_mutation_contract(diff)
    loop_score, loop_issues = analyze_loop_invariant(diff)

    # Compute overall
    overall = (
        weights['return_type'] * rt_score +
        weights['ordering'] * ord_score +
        weights['mutation'] * mut_score +
        weights['loop'] * loop_score
    )

    all_issues = rt_issues + ord_issues + mut_issues + loop_issues

    # Generate feedback
    feedback = []

    if rt_score < 1.0:
        feedback.append(
            f"🚨 RETURN TYPE CHANGE: {rt_issues[0] if rt_issues else 'Type signature changed'}. "
            "Callers may expect specific types."
        )

    if ord_score < 1.0:
        feedback.append(
            f"🚨 ORDERING CHANGE: {ord_issues[0] if ord_issues else 'Order may not be preserved'}. "
            "If order matters, ensure deterministic ordering."
        )

    if mut_score < 1.0:
        feedback.append(
            f"⚠ MUTATION CHANGE: {mut_issues[0] if mut_issues else 'Side effects changed'}. "
            "Verify callers handle mutation correctly."
        )

    if loop_score < 1.0:
        feedback.append(
            f"⚠ LOOP INVARIANT: {loop_issues[0] if loop_issues else 'Loop behavior changed'}. "
            "Ensure all iterations still produce correct results."
        )

    return ContractResult(
        score=overall,
        return_type_preserved=rt_score,
        ordering_preserved=ord_score,
        mutation_preserved=mut_score,
        contract_violations=all_issues,
        feedback=feedback,
    )
