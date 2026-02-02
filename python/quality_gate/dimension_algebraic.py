# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Dimension 7: Algebraic Completeness (Category Theory)

Evaluates whether code modifications include all dual operations in their category.
Uses a hybrid approach:
  - 60% Lexical pattern matching (deterministic)
  - 20% Type signature analysis (deterministic for typed languages)
  - 20% LLM inference for domain-specific patterns

Scoring is ratio-based (0-1 scalar):
  score = mean([actual_duals / expected_duals for each category])

Neutral on absence: If no categories detected, returns 1.0 (no evidence of incompleteness).
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional
from enum import Enum


class OperationCategory(Enum):
    """Known operation categories with dual patterns."""
    IO = "I/O"
    SERIALIZATION = "Serialization"
    CRUD = "CRUD"
    STATE = "State"
    COLLECTION = "Collection"
    TRANSFORM = "Transform"
    RESOURCE = "Resource"
    VALIDATION = "Validation"
    CRYPTOGRAPHY = "Cryptography"


# Lexical dual patterns (deterministic matching)
LEXICAL_DUAL_PATTERNS = {
    # I/O category
    ('read', 'write'): OperationCategory.IO,
    ('load', 'save'): OperationCategory.IO,
    ('input', 'output'): OperationCategory.IO,
    ('import', 'export'): OperationCategory.IO,
    ('fetch', 'send'): OperationCategory.IO,
    ('receive', 'transmit'): OperationCategory.IO,

    # Serialization category
    ('encode', 'decode'): OperationCategory.SERIALIZATION,
    ('serialize', 'deserialize'): OperationCategory.SERIALIZATION,
    ('marshal', 'unmarshal'): OperationCategory.SERIALIZATION,
    ('stringify', 'parse'): OperationCategory.SERIALIZATION,
    ('compress', 'decompress'): OperationCategory.SERIALIZATION,
    ('pack', 'unpack'): OperationCategory.SERIALIZATION,

    # CRUD category
    ('create', 'delete'): OperationCategory.CRUD,
    ('add', 'remove'): OperationCategory.COLLECTION,
    ('insert', 'extract'): OperationCategory.COLLECTION,
    ('push', 'pop'): OperationCategory.COLLECTION,
    ('enqueue', 'dequeue'): OperationCategory.COLLECTION,

    # State category
    ('get', 'set'): OperationCategory.STATE,
    ('acquire', 'release'): OperationCategory.RESOURCE,
    ('lock', 'unlock'): OperationCategory.RESOURCE,
    ('open', 'close'): OperationCategory.RESOURCE,
    ('connect', 'disconnect'): OperationCategory.RESOURCE,
    ('allocate', 'free'): OperationCategory.RESOURCE,

    # Transform category
    ('encrypt', 'decrypt'): OperationCategory.CRYPTOGRAPHY,
    ('sign', 'verify'): OperationCategory.CRYPTOGRAPHY,
    ('validate', 'fix'): OperationCategory.VALIDATION,
}


@dataclass
class Operation:
    """Represents a code operation (function/method)."""
    name: str
    file_path: str
    line_number: int
    signature: Optional[str] = None
    modified: bool = False  # Whether this operation was modified in the diff


@dataclass
class CategoryAnalysis:
    """Analysis of a single operation category."""
    category: OperationCategory
    operations: List[Operation]
    expected_duals: int
    actual_duals: int
    missing_duals: List[str] = field(default_factory=list)
    completeness_ratio: float = 0.0


@dataclass
class AlgebraicCompletenessResult:
    """Result of algebraic completeness evaluation."""
    score: float  # 0-1 scalar
    categories: List[CategoryAnalysis]
    lexical_score: float
    type_score: float
    llm_score: float
    violations: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class AlgebraicCompletenessEvaluator:
    """
    Evaluates algebraic completeness using hybrid approach.

    Hybrid scoring:
      - 60% Lexical pattern matching (deterministic)
      - 20% Type signature analysis (deterministic, if types available)
      - 20% LLM inference (for domain-specific edge cases)
    """

    def __init__(
        self,
        lexical_weight: float = 0.6,
        type_weight: float = 0.2,
        llm_weight: float = 0.2,
        use_llm: bool = False
    ):
        """
        Initialize evaluator.

        Args:
            lexical_weight: Weight for lexical pattern matching
            type_weight: Weight for type signature analysis
            llm_weight: Weight for LLM inference
            use_llm: Whether to use LLM for domain-specific patterns
        """
        self.lexical_weight = lexical_weight
        self.type_weight = type_weight
        self.llm_weight = llm_weight
        self.use_llm = use_llm

    def evaluate(
        self,
        diff: str,
        file_contents: Dict[str, str]
    ) -> AlgebraicCompletenessResult:
        """
        Evaluate algebraic completeness for the given diff.

        Args:
            diff: Git diff string
            file_contents: Map of file paths to their full content

        Returns:
            AlgebraicCompletenessResult with score in [0, 1]
        """
        # Extract operations from diff and codebase
        operations = self._extract_operations(diff, file_contents)

        if not operations:
            # No operations detected → neutral (no evidence of incompleteness)
            return AlgebraicCompletenessResult(
                score=1.0,
                categories=[],
                lexical_score=1.0,
                type_score=1.0,
                llm_score=1.0,
                violations=[],
                recommendations=["No operations detected in diff"]
            )

        # Step 1: Lexical pattern matching (deterministic)
        lexical_categories = self._detect_categories_lexical(operations)
        lexical_score = self._compute_category_score(lexical_categories)

        # Step 2: Type signature analysis (deterministic, if available)
        type_categories = self._detect_categories_type_signatures(operations)
        type_score = self._compute_category_score(type_categories)

        # Step 3: LLM inference (optional, for edge cases)
        llm_score = 1.0  # Default: neutral if LLM not used
        llm_categories = []
        if self.use_llm:
            llm_categories = self._detect_categories_llm(operations)
            llm_score = self._compute_category_score(llm_categories)

        # Combine all categories (union)
        all_categories = self._merge_categories(
            lexical_categories,
            type_categories,
            llm_categories
        )

        # Compute weighted overall score
        # IMPORTANT: If type/LLM don't contribute (score = 1.0 = neutral),
        # we should use lexical score as the primary signal
        if not type_categories and not self.use_llm:
            # Pure lexical mode - use lexical score directly
            overall_score = lexical_score
        else:
            # Hybrid mode - use weighted combination
            overall_score = (
                self.lexical_weight * lexical_score +
                self.type_weight * type_score +
                self.llm_weight * llm_score
            )

        # Generate violations and recommendations
        violations = self._generate_violations(all_categories)
        recommendations = self._generate_recommendations(all_categories)

        return AlgebraicCompletenessResult(
            score=overall_score,
            categories=all_categories,
            lexical_score=lexical_score,
            type_score=type_score,
            llm_score=llm_score,
            violations=violations,
            recommendations=recommendations
        )

    def _extract_operations(
        self,
        diff: str,
        file_contents: Dict[str, str]
    ) -> List[Operation]:
        """Extract operations (functions/methods) from diff and codebase."""
        operations = []

        # Parse diff to find modified operations
        modified_ops = self._parse_diff_operations(diff)

        # For each modified operation, extract full context from file_contents
        for op in modified_ops:
            op.modified = True
            operations.append(op)

        # Also extract existing operations in the same files (for dual detection)
        modified_files = {op.file_path for op in modified_ops}
        for file_path in modified_files:
            content = file_contents.get(file_path, "")
            existing_ops = self._extract_operations_from_file(file_path, content)

            # Add operations that aren't already in modified list
            modified_names = {op.name for op in modified_ops if op.file_path == file_path}
            for op in existing_ops:
                if op.name not in modified_names:
                    operations.append(op)

        return operations

    def _parse_diff_operations(self, diff: str) -> List[Operation]:
        """Parse diff to find modified operations."""
        operations = []
        current_file = None
        current_line = 0

        for line in diff.split('\n'):
            # Track current file
            if line.startswith('diff --git'):
                match = re.search(r'b/(.+)$', line)
                if match:
                    current_file = match.group(1)

            # Track line numbers
            elif line.startswith('@@'):
                match = re.search(r'\+(\d+)', line)
                if match:
                    current_line = int(match.group(1))

            # Detect function definitions in added lines
            elif line.startswith('+') and current_file:
                # Python function
                match = re.search(r'def\s+(\w+)\s*\(', line)
                if match:
                    operations.append(Operation(
                        name=match.group(1),
                        file_path=current_file,
                        line_number=current_line,
                        modified=True
                    ))

                # TypeScript/JavaScript function
                match = re.search(r'function\s+(\w+)\s*\(', line)
                if match:
                    operations.append(Operation(
                        name=match.group(1),
                        file_path=current_file,
                        line_number=current_line,
                        modified=True
                    ))

                # TypeScript/JavaScript const arrow function
                match = re.search(r'const\s+(\w+)\s*=.*=>', line)
                if match:
                    operations.append(Operation(
                        name=match.group(1),
                        file_path=current_file,
                        line_number=current_line,
                        modified=True
                    ))

                current_line += 1

        return operations

    def _extract_operations_from_file(self, file_path: str, content: str) -> List[Operation]:
        """Extract all operations from a file."""
        operations = []
        lines = content.split('\n')

        for i, line in enumerate(lines):
            # Python function
            match = re.search(r'def\s+(\w+)\s*\(', line)
            if match:
                operations.append(Operation(
                    name=match.group(1),
                    file_path=file_path,
                    line_number=i + 1,
                    modified=False
                ))

            # TypeScript/JavaScript function
            match = re.search(r'function\s+(\w+)\s*\(', line)
            if match:
                operations.append(Operation(
                    name=match.group(1),
                    file_path=file_path,
                    line_number=i + 1,
                    modified=False
                ))

            # TypeScript/JavaScript const arrow function
            match = re.search(r'const\s+(\w+)\s*=.*=>', line)
            if match:
                operations.append(Operation(
                    name=match.group(1),
                    file_path=file_path,
                    line_number=i + 1,
                    modified=False
                ))

        return operations

    def _detect_categories_lexical(self, operations: List[Operation]) -> List[CategoryAnalysis]:
        """Detect categories using lexical pattern matching (deterministic)."""
        categories: Dict[OperationCategory, CategoryAnalysis] = {}

        # Build operation name set for fast lookup
        op_names = {op.name.lower() for op in operations}
        modified_names = {op.name.lower() for op in operations if op.modified}

        # Check each dual pattern
        for (op1, op2), category in LEXICAL_DUAL_PATTERNS.items():
            has_op1 = op1 in op_names
            has_op2 = op2 in op_names
            modified_op1 = op1 in modified_names
            modified_op2 = op2 in modified_names

            # CRITICAL: Only create category if at least ONE operation was MODIFIED
            # This is the key insight - we only care about completeness in the diff scope
            if modified_op1 or modified_op2:
                if category not in categories:
                    categories[category] = CategoryAnalysis(
                        category=category,
                        operations=[],
                        expected_duals=2,
                        actual_duals=0
                    )

                # Count duals that were modified
                # For completeness, BOTH duals should be modified if category is touched
                modified_count = 0
                if modified_op1:
                    modified_count += 1
                    categories[category].operations.append(
                        next(op for op in operations if op.name.lower() == op1 and op.modified)
                    )
                if modified_op2:
                    modified_count += 1
                    categories[category].operations.append(
                        next(op for op in operations if op.name.lower() == op2 and op.modified)
                    )

                # Track which duals are missing from modification
                if not modified_op1 and has_op1:
                    categories[category].missing_duals.append(f"{op1} (exists but not modified)")
                elif not modified_op1:
                    categories[category].missing_duals.append(f"{op1} (doesn't exist)")

                if not modified_op2 and has_op2:
                    categories[category].missing_duals.append(f"{op2} (exists but not modified)")
                elif not modified_op2:
                    categories[category].missing_duals.append(f"{op2} (doesn't exist)")

                categories[category].actual_duals = modified_count
                categories[category].completeness_ratio = modified_count / 2.0

        return list(categories.values())

    def _detect_categories_type_signatures(self, operations: List[Operation]) -> List[CategoryAnalysis]:
        """
        Detect categories using type signature analysis (deterministic).

        For typed languages, check if inverse type signatures exist.
        Example: write: Data → String, read: String → Data
        """
        # TODO: Implement type signature analysis
        # This requires parsing type annotations in Python/TypeScript
        # For now, return empty (20% weight will be neutral)
        return []

    def _detect_categories_llm(self, operations: List[Operation]) -> List[CategoryAnalysis]:
        """
        Detect categories using LLM inference (for domain-specific patterns).

        TODO: Implement LLM-based category detection.
        """
        # Placeholder for LLM implementation
        return []

    def _compute_category_score(self, categories: List[CategoryAnalysis]) -> float:
        """Compute overall score from category analyses."""
        if not categories:
            return 1.0  # Neutral if no categories

        # Arithmetic mean of completeness ratios
        total_ratio = sum(cat.completeness_ratio for cat in categories)
        return total_ratio / len(categories)

    def _merge_categories(
        self,
        lexical: List[CategoryAnalysis],
        type_based: List[CategoryAnalysis],
        llm_based: List[CategoryAnalysis]
    ) -> List[CategoryAnalysis]:
        """Merge categories from different detection methods."""
        # For now, just use lexical (most reliable)
        # TODO: Implement proper merging logic
        return lexical

    def _generate_violations(self, categories: List[CategoryAnalysis]) -> List[str]:
        """Generate violation messages."""
        violations = []

        for cat in categories:
            if cat.completeness_ratio < 1.0:
                violations.append(
                    f"{cat.category.value} category incomplete: "
                    f"{cat.actual_duals}/{cat.expected_duals} duals present"
                )

        return violations

    def _generate_recommendations(self, categories: List[CategoryAnalysis]) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        for cat in categories:
            if cat.missing_duals:
                for missing_op in cat.missing_duals:
                    recommendations.append(
                        f"Add {missing_op}() operation to complete {cat.category.value} category"
                    )

        return recommendations


# =============================================================================
# Helper Functions
# =============================================================================

def evaluate_algebraic_completeness(
    diff: str,
    file_contents: Dict[str, str],
    use_llm: bool = False
) -> AlgebraicCompletenessResult:
    """
    Convenience function to evaluate algebraic completeness.

    Args:
        diff: Git diff string
        file_contents: Map of file paths to their full content
        use_llm: Whether to use LLM for domain-specific pattern detection

    Returns:
        AlgebraicCompletenessResult with score in [0, 1]
    """
    evaluator = AlgebraicCompletenessEvaluator(use_llm=use_llm)
    return evaluator.evaluate(diff, file_contents)
