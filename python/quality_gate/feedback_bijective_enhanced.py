# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Enhanced Bijective Dimension Feedback Generator

Generates SPECIFIC, ACTIONABLE feedback for weak test-code alignment.

Instead of: "Test-code alignment weak"
Provides: "Test expects write_header_rows() operation - add this method to RST class"
"""

from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class BijectiveGap:
    """Represents a specific gap in test-code alignment."""
    test_operation: str  # What test expects
    code_operation: Optional[str]  # What code provides (if any)
    gap_type: str  # 'missing', 'mismatch', 'incomplete'
    severity: float  # 0-1, how important this gap is
    suggestion: str  # Specific action to fix


class EnhancedBijectiveFeedbackGenerator:
    """
    Generates specific, actionable feedback for bijective dimension failures.

    Key improvements over basic version:
    1. Identifies SPECIFIC missing operations
    2. Provides CODE EXAMPLES of what to add
    3. Explains WHY the gap exists
    4. Prioritizes gaps by severity
    """

    def generate_feedback(
        self,
        bijective_result,
        test_code: str,
        diff: str,
        requirements: str
    ) -> str:
        """
        Generate enhanced feedback for bijective dimension.

        Args:
            bijective_result: Result from bijective dimension evaluation
            test_code: Test code that patch should satisfy
            diff: The patch diff
            requirements: Original requirements text

        Returns:
            Detailed, actionable feedback string
        """
        if not bijective_result or bijective_result.score >= 0.70:
            return "✓ Test-code alignment is good"

        feedback_parts = []
        feedback_parts.append("⚠️ TEST-CODE ALIGNMENT WEAK")
        feedback_parts.append("")

        # Analyze the gap
        gaps = self._identify_gaps(bijective_result, test_code, diff)

        if not gaps:
            # Generic feedback if we can't identify specific gaps
            feedback_parts.append("Issue: Test expectations don't match code implementation")
            feedback_parts.append("")
            feedback_parts.append("Suggestions:")
            feedback_parts.append("  1. Review test code to understand all expected operations")
            feedback_parts.append("  2. Ensure your patch implements ALL operations tested")
            feedback_parts.append("  3. Check for missing dual operations (read/write, get/set, etc.)")
            return "\n".join(feedback_parts)

        # Sort gaps by severity (most important first)
        gaps.sort(key=lambda g: g.severity, reverse=True)

        # Report specific gaps
        feedback_parts.append(f"Found {len(gaps)} gap(s) in test-code alignment:")
        feedback_parts.append("")

        for i, gap in enumerate(gaps[:5], 1):  # Top 5 gaps
            severity_emoji = "🔴" if gap.severity > 0.7 else "🟡" if gap.severity > 0.4 else "🟢"
            feedback_parts.append(f"{i}. {severity_emoji} {gap.gap_type.upper()}: {gap.test_operation}")
            if gap.code_operation:
                feedback_parts.append(f"   Test expects: {gap.test_operation}")
                feedback_parts.append(f"   Code provides: {gap.code_operation}")
            else:
                feedback_parts.append(f"   Test expects: {gap.test_operation}")
                feedback_parts.append(f"   Code provides: NOTHING (missing)")
            feedback_parts.append(f"   → {gap.suggestion}")
            feedback_parts.append("")

        # Add concrete examples
        feedback_parts.append("CONCRETE ACTIONS:")
        for i, gap in enumerate(gaps[:3], 1):
            example = self._generate_code_example(gap, diff)
            if example:
                feedback_parts.append(f"{i}. {example}")

        return "\n".join(feedback_parts)

    def _identify_gaps(
        self,
        bijective_result,
        test_code: str,
        diff: str
    ) -> List[BijectiveGap]:
        """
        Identify specific gaps by comparing test expectations to code.

        Uses:
        1. Bijective result phase alignments
        2. Test code operation extraction
        3. Diff operation extraction
        4. Logic vernacular ontology mappings
        """
        gaps = []

        # Extract operations from test
        test_operations = self._extract_test_operations(test_code)

        # Extract operations from diff
        code_operations = self._extract_code_operations(diff)

        # Find missing operations
        for test_op in test_operations:
            # Check if test operation has corresponding code operation
            matched = False
            for code_op in code_operations:
                if self._operations_match(test_op, code_op):
                    matched = True
                    break

            if not matched:
                # Missing operation
                gaps.append(BijectiveGap(
                    test_operation=test_op,
                    code_operation=None,
                    gap_type='missing',
                    severity=0.8,  # Missing operations are high severity
                    suggestion=self._generate_missing_operation_suggestion(test_op, diff)
                ))

        # Find mismatched operations
        for test_op in test_operations:
            for code_op in code_operations:
                if self._operations_similar(test_op, code_op) and not self._operations_match(test_op, code_op):
                    # Similar but not exact match
                    gaps.append(BijectiveGap(
                        test_operation=test_op,
                        code_operation=code_op,
                        gap_type='mismatch',
                        severity=0.5,
                        suggestion=f"Rename or adjust {code_op} to match test expectation {test_op}"
                    ))

        return gaps

    def _extract_test_operations(self, test_code: str) -> List[str]:
        """Extract operation names from test code."""
        operations = []

        # Pattern 1: Method calls - obj.method()
        import re
        method_calls = re.findall(r'\.(\w+)\s*\(', test_code)
        operations.extend(method_calls)

        # Pattern 2: Function calls - function()
        func_calls = re.findall(r'\b(\w+)\s*\(', test_code)
        operations.extend([f for f in func_calls if f not in ['assert', 'assertEqual', 'assertTrue', 'test', 'setup']])

        # Pattern 3: Attribute access - obj.attribute
        attributes = re.findall(r'\.(\w+)\b(?!\s*\()', test_code)
        operations.extend(attributes)

        # Deduplicate
        return list(set(operations))

    def _extract_code_operations(self, diff: str) -> List[str]:
        """Extract operation names from diff (functions/methods added/modified)."""
        operations = []

        import re

        # Pattern 1: Function definitions - def function_name(
        func_defs = re.findall(r'^\+\s*def\s+(\w+)\s*\(', diff, re.MULTILINE)
        operations.extend(func_defs)

        # Pattern 2: Method definitions in classes
        method_defs = re.findall(r'^\+\s+def\s+(\w+)\s*\(', diff, re.MULTILINE)
        operations.extend(method_defs)

        # Pattern 3: TypeScript/JavaScript functions
        ts_funcs = re.findall(r'^\+\s*(?:function|const)\s+(\w+)', diff, re.MULTILINE)
        operations.extend(ts_funcs)

        # Deduplicate
        return list(set(operations))

    def _operations_match(self, test_op: str, code_op: str) -> bool:
        """Check if test operation matches code operation."""
        # Exact match
        if test_op == code_op:
            return True

        # Case-insensitive match
        if test_op.lower() == code_op.lower():
            return True

        # Snake_case vs camelCase
        if test_op.replace('_', '').lower() == code_op.lower():
            return True

        return False

    def _operations_similar(self, test_op: str, code_op: str) -> bool:
        """Check if operations are similar (might be a mismatch)."""
        # Check if they share common prefix/suffix
        test_lower = test_op.lower()
        code_lower = code_op.lower()

        # Share significant prefix (first 4+ chars)
        if len(test_lower) >= 4 and len(code_lower) >= 4:
            if test_lower[:4] == code_lower[:4]:
                return True

        # Share significant suffix
        if len(test_lower) >= 4 and len(code_lower) >= 4:
            if test_lower[-4:] == code_lower[-4:]:
                return True

        return False

    def _generate_missing_operation_suggestion(self, test_op: str, diff: str) -> str:
        """Generate specific suggestion for missing operation."""
        # Identify likely class/module from diff
        import re
        class_match = re.search(r'class\s+(\w+)', diff)
        class_name = class_match.group(1) if class_match else "the class"

        # Generate suggestion
        return f"Add {test_op}() method to {class_name} - test expects this operation"

    def _generate_code_example(self, gap: BijectiveGap, diff: str) -> Optional[str]:
        """Generate concrete code example for fixing gap."""
        if gap.gap_type == 'missing':
            # Extract class name from diff
            import re
            class_match = re.search(r'class\s+(\w+)', diff)
            if class_match:
                class_name = class_match.group(1)
                return f"Add to {class_name}: def {gap.test_operation}(self, ...): ..."
            else:
                return f"Add function: def {gap.test_operation}(...): ..."

        elif gap.gap_type == 'mismatch':
            return f"Rename {gap.code_operation} → {gap.test_operation}"

        return None


# Example usage in feedback generation
def generate_enhanced_bijective_feedback(result, test_code, diff, requirements):
    """
    Wrapper function to generate enhanced bijective feedback.

    Use this instead of basic feedback for bijective dimension.
    """
    generator = EnhancedBijectiveFeedbackGenerator()
    return generator.generate_feedback(result, test_code, diff, requirements)
