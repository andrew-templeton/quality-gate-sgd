# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Dimension 6: Documentation Completeness

Evaluates documentation completeness at three hierarchical levels:
1. Symbol level (variables, functions, classes)
2. File level (header comments)
3. Directory level (README/PURPOSE.md)

Scoring is ratio-based (0-1 scalar) and differentiable:
  score = (symbolRatio^0.5 * fileRatio^0.3 * dirRatio^0.2)

This is 100% deterministic (AST-based) with optional LLM validation.
"""

import ast
import re
from dataclasses import dataclass, field
from typing import List, Set, Dict, Optional
from pathlib import Path


@dataclass
class DocumentationMetrics:
    """Metrics for documentation completeness at different levels."""
    # Symbol level
    declared_symbols: int = 0
    documented_symbols: int = 0

    # File level
    total_files: int = 0
    documented_files: int = 0

    # Directory level
    total_directories: int = 0
    documented_directories: int = 0

    # Details for feedback
    undocumented_symbols: List[Dict[str, str]] = field(default_factory=list)
    undocumented_files: List[str] = field(default_factory=list)
    undocumented_directories: List[str] = field(default_factory=list)


@dataclass
class DocumentationCompletenessResult:
    """Result of documentation completeness evaluation."""
    score: float  # 0-1 scalar
    metrics: DocumentationMetrics
    symbol_ratio: float
    file_ratio: float
    directory_ratio: float
    violations: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class DocumentationCompletenessEvaluator:
    """
    Evaluates documentation completeness using pure AST-based analysis.

    100% deterministic - no LLM calls needed for core scoring.
    """

    def __init__(self, use_llm_validation: bool = False):
        """
        Initialize evaluator.

        Args:
            use_llm_validation: If True, use LLM to validate comment quality (optional).
                               Default: False (pure deterministic).
        """
        self.use_llm_validation = use_llm_validation

    def evaluate(self, diff: str, file_contents: Dict[str, str]) -> DocumentationCompletenessResult:
        """
        Evaluate documentation completeness for the given diff.

        Args:
            diff: Git diff string
            file_contents: Map of file paths to their full content

        Returns:
            DocumentationCompletenessResult with score in [0, 1]
        """
        metrics = self._extract_documentation_metrics(diff, file_contents)

        # Compute ratios (with safe division)
        symbol_ratio = (
            metrics.documented_symbols / metrics.declared_symbols
            if metrics.declared_symbols > 0 else 1.0
        )

        file_ratio = (
            metrics.documented_files / metrics.total_files
            if metrics.total_files > 0 else 1.0
        )

        directory_ratio = (
            metrics.documented_directories / metrics.total_directories
            if metrics.total_directories > 0 else 1.0
        )

        # Geometric mean with hierarchical weights
        # symbol^0.5 * file^0.3 * dir^0.2
        score = (
            (symbol_ratio ** 0.5) *
            (file_ratio ** 0.3) *
            (directory_ratio ** 0.2)
        )

        # Generate violations and recommendations
        violations = self._generate_violations(metrics)
        recommendations = self._generate_recommendations(metrics, symbol_ratio, file_ratio, directory_ratio)

        return DocumentationCompletenessResult(
            score=score,
            metrics=metrics,
            symbol_ratio=symbol_ratio,
            file_ratio=file_ratio,
            directory_ratio=directory_ratio,
            violations=violations,
            recommendations=recommendations
        )

    def _extract_documentation_metrics(
        self,
        diff: str,
        file_contents: Dict[str, str]
    ) -> DocumentationMetrics:
        """Extract documentation metrics from diff and file contents."""
        metrics = DocumentationMetrics()

        # Parse diff to find modified files
        modified_files = self._parse_diff_files(diff)

        # Track directories
        directories: Set[str] = set()

        for file_path in modified_files:
            # Track file
            metrics.total_files += 1

            # Track directory
            dir_path = str(Path(file_path).parent)
            directories.add(dir_path)

            # Get file content
            content = file_contents.get(file_path, "")

            # Check file-level documentation
            if self._has_file_header_comment(content):
                metrics.documented_files += 1
            else:
                metrics.undocumented_files.append(file_path)

            # Analyze symbol-level documentation (Python files only)
            if file_path.endswith('.py'):
                self._analyze_python_symbols(file_path, content, metrics)
            elif file_path.endswith(('.ts', '.tsx', '.js', '.jsx')):
                self._analyze_typescript_symbols(file_path, content, metrics)

        # Check directory documentation
        metrics.total_directories = len(directories)
        for dir_path in directories:
            if self._has_directory_documentation(dir_path, file_contents):
                metrics.documented_directories += 1
            else:
                metrics.undocumented_directories.append(dir_path)

        return metrics

    def _parse_diff_files(self, diff: str) -> List[str]:
        """Extract list of modified files from diff."""
        files = []
        for line in diff.split('\n'):
            if line.startswith('diff --git'):
                # Extract file path from: diff --git a/path/to/file.py b/path/to/file.py
                match = re.search(r'b/(.+)$', line)
                if match:
                    files.append(match.group(1))
        return files

    def _has_file_header_comment(self, content: str) -> bool:
        """Check if file has a header comment (first 10 lines)."""
        lines = content.split('\n')[:10]

        # Look for multi-line comment or docstring at top
        has_header = False
        for i, line in enumerate(lines):
            stripped = line.strip()

            # Python docstring
            if i == 0 and (stripped.startswith('"""') or stripped.startswith("'''")):
                has_header = True
                break

            # Multi-line comment
            if stripped.startswith('/*') or stripped.startswith('//'):
                has_header = True
                break

            # Hash comment (Python/Shell)
            if stripped.startswith('#') and len(stripped) > 10:
                has_header = True
                break

        return has_header

    def _has_directory_documentation(
        self,
        dir_path: str,
        file_contents: Dict[str, str]
    ) -> bool:
        """Check if directory has README or PURPOSE.md."""
        readme_files = ['README.md', 'README.txt', 'README', 'PURPOSE.md']

        for readme in readme_files:
            readme_path = str(Path(dir_path) / readme)
            if readme_path in file_contents:
                return True

        return False

    def _analyze_python_symbols(
        self,
        file_path: str,
        content: str,
        metrics: DocumentationMetrics
    ):
        """Analyze Python symbols for documentation."""
        try:
            tree = ast.parse(content)
        except SyntaxError:
            # If file doesn't parse, skip symbol analysis
            return

        for node in ast.walk(tree):
            # Functions
            if isinstance(node, ast.FunctionDef):
                metrics.declared_symbols += 1
                if ast.get_docstring(node):
                    metrics.documented_symbols += 1
                else:
                    metrics.undocumented_symbols.append({
                        'file': file_path,
                        'type': 'function',
                        'name': node.name,
                        'line': node.lineno
                    })

            # Classes
            elif isinstance(node, ast.ClassDef):
                metrics.declared_symbols += 1
                if ast.get_docstring(node):
                    metrics.documented_symbols += 1
                else:
                    metrics.undocumented_symbols.append({
                        'file': file_path,
                        'type': 'class',
                        'name': node.name,
                        'line': node.lineno
                    })

            # Variables (assignments in module scope only)
            elif isinstance(node, ast.Assign):
                # Only count module-level assignments
                if isinstance(node.targets[0], ast.Name):
                    var_name = node.targets[0].id
                    # Skip private variables and constants (heuristic)
                    if not var_name.startswith('_') and not var_name.isupper():
                        metrics.declared_symbols += 1
                        # Check for inline comment
                        # (In AST we can't easily get comments, so we use heuristic)
                        # For now, assume no inline comments in AST
                        # This is a limitation - could be improved with tokenize module
                        metrics.undocumented_symbols.append({
                            'file': file_path,
                            'type': 'variable',
                            'name': var_name,
                            'line': node.lineno
                        })

    def _analyze_typescript_symbols(
        self,
        file_path: str,
        content: str,
        metrics: DocumentationMetrics
    ):
        """
        Analyze TypeScript/JavaScript symbols for documentation.

        This is a simplified regex-based approach.
        For production, use a proper TS parser.
        """
        lines = content.split('\n')

        # Find function declarations
        func_pattern = re.compile(r'^\s*(export\s+)?(async\s+)?function\s+(\w+)')
        # Find const/let/var declarations
        var_pattern = re.compile(r'^\s*(export\s+)?(const|let|var)\s+(\w+)')
        # Find class declarations
        class_pattern = re.compile(r'^\s*(export\s+)?class\s+(\w+)')

        for i, line in enumerate(lines):
            # Check for preceding comment (JSDoc or //)
            has_comment = False
            if i > 0:
                prev_line = lines[i - 1].strip()
                has_comment = (
                    prev_line.startswith('//') or
                    prev_line.startswith('*') or
                    prev_line.startswith('/**')
                )

            # Function
            match = func_pattern.match(line)
            if match:
                metrics.declared_symbols += 1
                if has_comment:
                    metrics.documented_symbols += 1
                else:
                    metrics.undocumented_symbols.append({
                        'file': file_path,
                        'type': 'function',
                        'name': match.group(3),
                        'line': i + 1
                    })

            # Variable
            match = var_pattern.match(line)
            if match:
                var_name = match.group(3)
                # Skip private variables (starting with _)
                if not var_name.startswith('_'):
                    metrics.declared_symbols += 1
                    if has_comment:
                        metrics.documented_symbols += 1
                    else:
                        metrics.undocumented_symbols.append({
                            'file': file_path,
                            'type': 'variable',
                            'name': var_name,
                            'line': i + 1
                        })

            # Class
            match = class_pattern.match(line)
            if match:
                metrics.declared_symbols += 1
                if has_comment:
                    metrics.documented_symbols += 1
                else:
                    metrics.undocumented_symbols.append({
                        'file': file_path,
                        'type': 'class',
                        'name': match.group(2),
                        'line': i + 1
                    })

    def _generate_violations(self, metrics: DocumentationMetrics) -> List[str]:
        """Generate violation messages."""
        violations = []

        if metrics.undocumented_symbols:
            violations.append(
                f"{len(metrics.undocumented_symbols)} undocumented symbols "
                f"({metrics.documented_symbols}/{metrics.declared_symbols} documented)"
            )

        if metrics.undocumented_files:
            violations.append(
                f"{len(metrics.undocumented_files)} files without header comments "
                f"({metrics.documented_files}/{metrics.total_files} documented)"
            )

        if metrics.undocumented_directories:
            violations.append(
                f"{len(metrics.undocumented_directories)} directories without README "
                f"({metrics.documented_directories}/{metrics.total_directories} documented)"
            )

        return violations

    def _generate_recommendations(
        self,
        metrics: DocumentationMetrics,
        symbol_ratio: float,
        file_ratio: float,
        directory_ratio: float
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        # Symbol-level recommendations
        if symbol_ratio < 0.7 and metrics.undocumented_symbols:
            # Show top 3 undocumented symbols
            top_symbols = metrics.undocumented_symbols[:3]
            for sym in top_symbols:
                recommendations.append(
                    f"Add docstring to {sym['type']} '{sym['name']}' in {sym['file']}:{sym['line']}"
                )

            if len(metrics.undocumented_symbols) > 3:
                remaining = len(metrics.undocumented_symbols) - 3
                recommendations.append(f"... and {remaining} more undocumented symbols")

        # File-level recommendations
        if file_ratio < 0.7 and metrics.undocumented_files:
            for file_path in metrics.undocumented_files[:2]:
                recommendations.append(
                    f"Add header comment to {file_path} explaining its purpose"
                )

        # Directory-level recommendations
        if directory_ratio < 0.7 and metrics.undocumented_directories:
            for dir_path in metrics.undocumented_directories[:2]:
                recommendations.append(
                    f"Add README.md to {dir_path} explaining directory purpose"
                )

        return recommendations


# =============================================================================
# Helper Functions
# =============================================================================

def evaluate_documentation_completeness(
    diff: str,
    file_contents: Dict[str, str],
    use_llm_validation: bool = False
) -> DocumentationCompletenessResult:
    """
    Convenience function to evaluate documentation completeness.

    Args:
        diff: Git diff string
        file_contents: Map of file paths to their full content
        use_llm_validation: Whether to use LLM for comment quality validation

    Returns:
        DocumentationCompletenessResult with score in [0, 1]
    """
    evaluator = DocumentationCompletenessEvaluator(use_llm_validation=use_llm_validation)
    return evaluator.evaluate(diff, file_contents)
