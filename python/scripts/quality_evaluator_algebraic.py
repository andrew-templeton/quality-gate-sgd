# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Algebraic Completeness Quality Evaluator

Implements two additional quality dimensions:
1. Documentation Completeness (syntactic layer)
2. Algebraic Completeness (semantic layer - field theory)
"""

import re
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from enum import Enum


class OperationType(Enum):
    """Categories of operations for duality checking."""
    IO = "io"  # read/write
    CRUD = "crud"  # create/read/update/delete
    TRANSFORM = "transform"  # encode/decode
    STATE = "state"  # get/set
    COLLECTION = "collection"  # add/remove
    VALIDATION = "validation"  # check/fix
    LIFECYCLE = "lifecycle"  # open/close, start/stop
    UNKNOWN = "unknown"


@dataclass
class Operation:
    """Represents a code operation (function/method)."""
    name: str
    full_name: str  # including class if method
    operation_type: OperationType
    input_types: List[str]
    output_type: Optional[str]
    parameters: List[str]
    is_new: bool  # True if added in diff
    is_modified: bool  # True if changed in diff


@dataclass
class DualityViolation:
    """Represents a missing or unmodified dual operation."""
    operation: str
    expected_dual: str
    dual_exists: bool
    dual_modified: bool
    severity: str  # "high", "medium", "low"
    explanation: str


# Lexical dual patterns
DUAL_PAIRS = [
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
    ("validate", "sanitize"),
    ("compress", "decompress"),
    ("encrypt", "decrypt"),
    ("send", "receive"),
    ("publish", "subscribe"),
]


class DocumentationCompletenessEvaluator:
    """Evaluates documentation completeness of code changes."""

    def evaluate(self, diff: str, context: Dict) -> Dict:
        """
        Evaluate documentation completeness.

        Returns:
            {
                "score": float,  # 0-100
                "issues": List[Dict],
                "undocumented_elements": List[str]
            }
        """
        score = 100.0
        issues = []

        # Extract code elements from diff
        new_functions = self._extract_new_functions(diff)
        new_variables = self._extract_new_variables(diff)
        modified_functions = self._extract_modified_functions(diff)
        complex_blocks = self._extract_complex_blocks(diff)

        # Check new functions
        for func in new_functions:
            if not self._has_docstring(func):
                score -= 20
                issues.append({
                    "type": "missing_docstring",
                    "element": func["name"],
                    "severity": "high",
                    "message": f"New function '{func['name']}' lacks docstring"
                })
            elif not self._docstring_explains_purpose(func):
                score -= 10
                issues.append({
                    "type": "incomplete_docstring",
                    "element": func["name"],
                    "severity": "medium",
                    "message": f"Docstring for '{func['name']}' doesn't explain purpose"
                })

        # Check new variables
        for var in new_variables:
            if not self._has_comment(var):
                score -= 10
                issues.append({
                    "type": "missing_comment",
                    "element": var["name"],
                    "severity": "medium",
                    "message": f"New variable '{var['name']}' lacks comment"
                })

        # Check modified functions
        for func in modified_functions:
            if not self._docstring_updated(func):
                score -= 5
                issues.append({
                    "type": "outdated_docstring",
                    "element": func["name"],
                    "severity": "low",
                    "message": f"Modified function '{func['name']}' docstring not updated"
                })

        # Check complex blocks
        for block in complex_blocks:
            if not self._has_explanatory_comment(block):
                score -= 15
                issues.append({
                    "type": "missing_explanation",
                    "element": f"lines {block['start']}-{block['end']}",
                    "severity": "high",
                    "message": f"Complex logic (lines {block['start']}-{block['end']}) lacks explanation"
                })

        return {
            "score": max(0.0, score),
            "issues": issues,
            "passed": score >= 70.0
        }

    def _extract_new_functions(self, diff: str) -> List[Dict]:
        """Extract new function definitions from diff."""
        new_funcs = []
        lines = diff.split('\n')

        for i, line in enumerate(lines):
            if line.startswith('+') and 'def ' in line:
                func_match = re.search(r'def\s+(\w+)\s*\(', line)
                if func_match:
                    func_name = func_match.group(1)
                    # Look for docstring in next few lines
                    docstring_lines = []
                    for j in range(i+1, min(i+10, len(lines))):
                        if '"""' in lines[j] or "'''" in lines[j]:
                            docstring_lines.append(lines[j])
                            if len([l for l in docstring_lines if '"""' in l or "'''" in l]) >= 2:
                                break

                    new_funcs.append({
                        "name": func_name,
                        "line": i,
                        "docstring_lines": docstring_lines
                    })

        return new_funcs

    def _extract_new_variables(self, diff: str) -> List[Dict]:
        """Extract new variable assignments from diff."""
        new_vars = []
        lines = diff.split('\n')

        for i, line in enumerate(lines):
            if line.startswith('+'):
                # Look for variable assignments
                var_match = re.search(r'(\w+)\s*=\s*', line)
                if var_match and 'def ' not in line:
                    var_name = var_match.group(1)
                    # Check for inline comment
                    has_comment = '#' in line

                    new_vars.append({
                        "name": var_name,
                        "line": i,
                        "has_comment": has_comment
                    })

        return new_vars

    def _extract_modified_functions(self, diff: str) -> List[Dict]:
        """Extract functions that were modified (not just added)."""
        # Simplified: Look for functions with both + and - lines
        modified = []
        lines = diff.split('\n')
        current_func = None

        for line in lines:
            if 'def ' in line:
                func_match = re.search(r'def\s+(\w+)\s*\(', line)
                if func_match:
                    current_func = func_match.group(1)
            elif current_func and (line.startswith('+') or line.startswith('-')):
                if current_func not in [f["name"] for f in modified]:
                    modified.append({"name": current_func})

        return modified

    def _extract_complex_blocks(self, diff: str) -> List[Dict]:
        """Identify complex logic blocks (>5 consecutive lines, with conditionals/loops)."""
        complex = []
        lines = diff.split('\n')
        block_start = None
        block_lines = []

        for i, line in enumerate(lines):
            if line.startswith('+'):
                if block_start is None:
                    block_start = i
                block_lines.append(line)
            else:
                if block_start and len(block_lines) > 5:
                    # Check for complexity markers
                    block_text = '\n'.join(block_lines)
                    if any(kw in block_text for kw in ['if ', 'for ', 'while ', 'try:']):
                        # Check for comments
                        has_comment = '#' in block_text
                        if not has_comment:
                            complex.append({
                                "start": block_start,
                                "end": i-1,
                                "lines": block_lines
                            })
                block_start = None
                block_lines = []

        return complex

    def _has_docstring(self, func: Dict) -> bool:
        return len(func.get("docstring_lines", [])) >= 2

    def _docstring_explains_purpose(self, func: Dict) -> bool:
        # Check if docstring has meaningful content (>20 chars)
        docstring = '\n'.join(func.get("docstring_lines", []))
        # Remove quotes and whitespace
        content = re.sub(r'["\']', '', docstring).strip()
        return len(content) > 20

    def _has_comment(self, var: Dict) -> bool:
        return var.get("has_comment", False)

    def _docstring_updated(self, func: Dict) -> bool:
        # Simplified: Assume modified if docstring lines present
        return True  # Would need diff context to check properly

    def _has_explanatory_comment(self, block: Dict) -> bool:
        block_text = '\n'.join(block["lines"])
        return '#' in block_text


class AlgebraicCompletenessEvaluator:
    """Evaluates algebraic completeness using field theory principles."""

    def __init__(self):
        self.dual_pairs = DUAL_PAIRS

    def evaluate(self, diff: str, codebase_context: Dict, problem_statement: str) -> Dict:
        """
        Evaluate algebraic completeness.

        Returns:
            {
                "score": float,
                "violations": List[DualityViolation],
                "recommendations": List[str]
            }
        """
        score = 100.0
        violations = []

        # Extract operations from diff
        modified_ops = self._extract_operations(diff)

        # For each operation, check for dual
        for op in modified_ops:
            # Skip constructors and internal methods
            if op.name in ['__init__', '__repr__', '__str__']:
                continue

            # Find dual operation
            dual_name = self._find_dual_name(op.name)
            if not dual_name:
                continue

            # Check if dual exists in codebase
            dual_exists = self._dual_exists(dual_name, codebase_context)
            dual_modified = self._is_dual_modified(dual_name, diff)

            if not dual_exists:
                # Critical: Dual operation doesn't exist at all
                score -= 40
                violations.append(DualityViolation(
                    operation=op.name,
                    expected_dual=dual_name,
                    dual_exists=False,
                    dual_modified=False,
                    severity="high",
                    explanation=f"Operation '{op.name}' requires dual '{dual_name}' for field completeness"
                ))
            elif not dual_modified and op.is_modified:
                # Medium: Dual exists but wasn't updated when operation changed
                score -= 25
                violations.append(DualityViolation(
                    operation=op.name,
                    expected_dual=dual_name,
                    dual_exists=True,
                    dual_modified=False,
                    severity="medium",
                    explanation=f"Modified '{op.name}' but dual '{dual_name}' not updated - may break round-trip property"
                ))

        recommendations = self._generate_recommendations(violations)

        return {
            "score": max(0.0, score),
            "violations": violations,
            "recommendations": recommendations,
            "passed": score >= 70.0
        }

    def _extract_operations(self, diff: str) -> List[Operation]:
        """Extract operations (functions/methods) from diff."""
        operations = []
        lines = diff.split('\n')

        for i, line in enumerate(lines):
            # Look for function definitions
            if 'def ' in line:
                func_match = re.search(r'def\s+(\w+)\s*\((.*?)\)', line)
                if func_match:
                    func_name = func_match.group(1)
                    params = func_match.group(2)

                    # Determine if new or modified
                    is_new = line.startswith('+')
                    is_modified = not is_new  # Simplified

                    # Classify operation type
                    op_type = self._classify_operation(func_name)

                    operations.append(Operation(
                        name=func_name,
                        full_name=func_name,  # Would need class context
                        operation_type=op_type,
                        input_types=[],  # Would parse params
                        output_type=None,  # Would parse return
                        parameters=params.split(','),
                        is_new=is_new,
                        is_modified=is_modified
                    ))

        return operations

    def _classify_operation(self, func_name: str) -> OperationType:
        """Classify operation type based on name."""
        name_lower = func_name.lower()

        if any(kw in name_lower for kw in ['read', 'write', 'load', 'save']):
            return OperationType.IO
        elif any(kw in name_lower for kw in ['create', 'delete', 'update']):
            return OperationType.CRUD
        elif any(kw in name_lower for kw in ['encode', 'decode', 'serialize', 'deserialize']):
            return OperationType.TRANSFORM
        elif any(kw in name_lower for kw in ['get', 'set']):
            return OperationType.STATE
        elif any(kw in name_lower for kw in ['add', 'remove', 'insert', 'extract']):
            return OperationType.COLLECTION
        elif any(kw in name_lower for kw in ['validate', 'check', 'verify']):
            return OperationType.VALIDATION
        elif any(kw in name_lower for kw in ['open', 'close', 'start', 'stop']):
            return OperationType.LIFECYCLE
        else:
            return OperationType.UNKNOWN

    def _find_dual_name(self, operation_name: str) -> Optional[str]:
        """Find the dual operation name using lexical patterns."""
        name_lower = operation_name.lower()

        for op1, op2 in self.dual_pairs:
            if op1 in name_lower:
                return operation_name.lower().replace(op1, op2)
            if op2 in name_lower:
                return operation_name.lower().replace(op2, op1)

        return None

    def _dual_exists(self, dual_name: str, codebase_context: Dict) -> bool:
        """Check if dual operation exists in codebase."""
        # Would search codebase AST or file contents
        # Simplified: check if mentioned in context
        context_text = str(codebase_context).lower()
        return dual_name.lower() in context_text

    def _is_dual_modified(self, dual_name: str, diff: str) -> bool:
        """Check if dual operation was modified in diff."""
        return f'def {dual_name}' in diff.lower()

    def _generate_recommendations(self, violations: List[DualityViolation]) -> List[str]:
        """Generate actionable recommendations based on violations."""
        recommendations = []

        for v in violations:
            if not v.dual_exists:
                recommendations.append(
                    f"Implement '{v.expected_dual}' operation to complement '{v.operation}' "
                    f"and ensure field completeness"
                )
            elif not v.dual_modified:
                recommendations.append(
                    f"Update '{v.expected_dual}' to support parameters/behavior added to '{v.operation}' "
                    f"for round-trip consistency"
                )

        return recommendations


class QualityGateAlgebraic:
    """
    Combined quality gate evaluating both documentation and algebraic completeness.
    """

    def __init__(self):
        self.doc_evaluator = DocumentationCompletenessEvaluator()
        self.alg_evaluator = AlgebraicCompletenessEvaluator()

    def evaluate(self, diff: str, codebase_context: Dict, problem_statement: str) -> Dict:
        """
        Two-phase evaluation:
        1. Documentation completeness (blocking)
        2. Algebraic completeness (after docs pass)
        """
        # Phase 1: Documentation
        doc_result = self.doc_evaluator.evaluate(diff, codebase_context)

        if not doc_result["passed"]:
            return {
                "overall_passed": False,
                "blocking_dimension": "documentation_completeness",
                "documentation_completeness": doc_result["score"],
                "algebraic_completeness": None,
                "message": "Documentation incomplete. Add comments/docstrings before proceeding.",
                "issues": doc_result["issues"]
            }

        # Phase 2: Algebraic completeness
        alg_result = self.alg_evaluator.evaluate(diff, codebase_context, problem_statement)

        overall_passed = doc_result["passed"] and alg_result["passed"]

        return {
            "overall_passed": overall_passed,
            "documentation_completeness": doc_result["score"],
            "algebraic_completeness": alg_result["score"],
            "violations": alg_result["violations"],
            "recommendations": alg_result["recommendations"],
            "message": self._generate_message(doc_result, alg_result)
        }

    def _generate_message(self, doc_result: Dict, alg_result: Dict) -> str:
        if doc_result["passed"] and alg_result["passed"]:
            return "Code meets both documentation and algebraic completeness criteria."
        elif not alg_result["passed"]:
            violations = alg_result["violations"]
            high_sev = [v for v in violations if v.severity == "high"]
            if high_sev:
                return f"Missing {len(high_sev)} critical dual operations. See recommendations."
            else:
                return "Algebraic completeness issues detected. Consider updating dual operations."
        return "Unknown issue"


# Example usage
if __name__ == "__main__":
    # Example diff (simplified astropy-14182)
    example_diff = """
+    def __init__(
+        self,
+        col_starts=None,
+        col_ends=None,
+        header_rows=None,
+    ):
+        super().__init__(
+            col_starts=col_starts,
+            col_ends=col_ends,
+            delimiter_pad=None,
+            bookend=False,
+            header_rows=header_rows,
+        )

     def write(self, lines):
         lines = super().write(lines)
-        lines = [lines[1]] + lines + [lines[1]]
+        header_rows = getattr(self.header, "header_rows", ["name"])
+        sep_idx = len(header_rows)
+        sep_line = lines[sep_idx]
+        lines = [sep_line] + lines + [sep_line]
         return lines
"""

    codebase_context = {
        "has_read_method": True,
        "parent_class": "FixedWidth",
        "parent_supports_header_rows": True
    }

    gate = QualityGateAlgebraic()
    result = gate.evaluate(example_diff, codebase_context, "Support header_rows in RST")

    print(f"Overall passed: {result['overall_passed']}")
    print(f"Documentation: {result['documentation_completeness']}/100")
    print(f"Algebraic: {result['algebraic_completeness']}/100")
    print(f"\nViolations: {len(result.get('violations', []))}")
    for v in result.get('violations', []):
        print(f"  - {v.operation} -> {v.expected_dual}: {v.explanation}")
