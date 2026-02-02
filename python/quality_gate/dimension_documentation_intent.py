# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Dimension 6: Intent Documentation Completeness (Enhanced)

Evaluates INTENT documentation (comments explaining WHY/HOW) not just API docs (docstrings).

Focus on:
1. Inline comments explaining non-obvious logic
2. Intent comments before complex blocks
3. "Why" comments for key decisions
4. File-level purpose explanations

Scoring: Ratio of code blocks with intent explanations.
"""

import ast
import re
from dataclasses import dataclass, field
from typing import List, Set, Dict, Optional


@dataclass
class IntentDocumentationMetrics:
    """Metrics for intent documentation."""
    # Code blocks requiring documentation
    complex_blocks: int = 0  # Loops, conditionals, try/except
    documented_complex_blocks: int = 0

    # Functions/methods
    functions: int = 0
    functions_with_intent: int = 0  # Has comment explaining purpose

    # Files
    files: int = 0
    files_with_purpose: int = 0  # Has file-level purpose comment

    # Details for feedback
    undocumented_blocks: List[Dict] = field(default_factory=list)
    undocumented_functions: List[Dict] = field(default_factory=list)


@dataclass
class IntentDocumentationResult:
    """Result of intent documentation evaluation."""
    score: float  # 0-1 scalar
    metrics: IntentDocumentationMetrics
    block_ratio: float
    function_ratio: float
    file_ratio: float
    suggestions: List[str] = field(default_factory=list)


class IntentDocumentationEvaluator:
    """
    Evaluates intent documentation (WHY/HOW comments) not docstrings.

    Intent comments explain:
    - Why a decision was made
    - How complex logic works
    - What edge cases are handled
    - Why certain values/approaches were chosen
    """

    # Intent comment patterns
    INTENT_KEYWORDS = [
        'intent:', 'why:', 'because', 'reason:',
        'note:', 'important:', 'caveat:',
        'handles', 'ensures', 'guarantees',
        'workaround', 'hack:', 'todo:',
        'edge case', 'special case'
    ]

    def __init__(self):
        """Initialize evaluator."""
        pass

    def evaluate(self, diff: str, file_contents: Dict[str, str]) -> IntentDocumentationResult:
        """
        Evaluate intent documentation for the given diff.

        Only evaluates files that were modified in the diff.
        """
        metrics = IntentDocumentationMetrics()

        # Parse diff to get modified files
        modified_files = self._parse_diff_files(diff)

        for file_path in modified_files:
            content = file_contents.get(file_path, '')
            if not content:
                continue

            metrics.files += 1

            # Check file-level purpose
            if self._has_file_purpose(content):
                metrics.files_with_purpose += 1

            # Analyze by file type
            if file_path.endswith('.py'):
                self._analyze_python_intent(file_path, content, metrics)
            elif file_path.endswith(('.ts', '.tsx', '.js', '.jsx')):
                self._analyze_typescript_intent(file_path, content, metrics)

        # Compute ratios
        block_ratio = (
            metrics.documented_complex_blocks / metrics.complex_blocks
            if metrics.complex_blocks > 0 else 1.0
        )

        function_ratio = (
            metrics.functions_with_intent / metrics.functions
            if metrics.functions > 0 else 1.0
        )

        file_ratio = (
            metrics.files_with_purpose / metrics.files
            if metrics.files > 0 else 1.0
        )

        # Weighted geometric mean (emphasize weakest)
        score = (
            (block_ratio ** 0.5) *
            (function_ratio ** 0.3) *
            (file_ratio ** 0.2)
        )

        # Generate suggestions
        suggestions = self._generate_suggestions(metrics)

        return IntentDocumentationResult(
            score=score,
            metrics=metrics,
            block_ratio=block_ratio,
            function_ratio=function_ratio,
            file_ratio=file_ratio,
            suggestions=suggestions
        )

    def _parse_diff_files(self, diff: str) -> List[str]:
        """Extract list of modified files from diff."""
        files = []
        for line in diff.split('\n'):
            if line.startswith('diff --git'):
                match = re.search(r'b/(.+)$', line)
                if match:
                    files.append(match.group(1))
        return files

    def _has_file_purpose(self, content: str) -> bool:
        """Check if file has a purpose comment explaining what it does."""
        lines = content.split('\n')[:20]  # Check first 20 lines

        # Look for purpose/intent keywords in comments
        for line in lines:
            stripped = line.strip().lower()

            # Check for intent indicators
            if any(keyword in stripped for keyword in ['purpose:', 'intent:', 'this file', 'this module']):
                return True

            # Multi-line comment block at top
            if stripped.startswith(('"""', "'''", '/*', '#')) and len(stripped) > 20:
                return True

        return False

    def _analyze_python_intent(self, file_path: str, content: str, metrics: IntentDocumentationMetrics):
        """Analyze Python file for intent documentation."""
        try:
            tree = ast.parse(content)
            lines = content.split('\n')
        except SyntaxError:
            return

        # Analyze functions
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                metrics.functions += 1

                # Check for intent comment before function
                if node.lineno > 1:
                    prev_lines = lines[max(0, node.lineno-3):node.lineno-1]
                    has_intent = any(
                        self._is_intent_comment(line)
                        for line in prev_lines
                    )
                    if has_intent:
                        metrics.functions_with_intent += 1
                    else:
                        metrics.undocumented_functions.append({
                            'file': file_path,
                            'name': node.name,
                            'line': node.lineno
                        })

        # Analyze complex blocks
        for node in ast.walk(tree):
            # Complex control flow
            if isinstance(node, (ast.For, ast.While, ast.If, ast.Try, ast.With)):
                metrics.complex_blocks += 1

                # Check for intent comment before block
                if hasattr(node, 'lineno') and node.lineno > 1:
                    prev_lines = lines[max(0, node.lineno-2):node.lineno-1]
                    has_intent = any(
                        self._is_intent_comment(line)
                        for line in prev_lines
                    )
                    if has_intent:
                        metrics.documented_complex_blocks += 1
                    else:
                        block_type = node.__class__.__name__.lower()
                        metrics.undocumented_blocks.append({
                            'file': file_path,
                            'type': block_type,
                            'line': node.lineno
                        })

    def _analyze_typescript_intent(self, file_path: str, content: str, metrics: IntentDocumentationMetrics):
        """Analyze TypeScript/JavaScript file for intent documentation."""
        lines = content.split('\n')

        # Find functions (basic regex pattern)
        function_pattern = r'^\s*(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)'

        for i, line in enumerate(lines):
            # Check for function declarations
            if re.search(function_pattern, line):
                metrics.functions += 1

                # Check previous lines for intent comment
                if i > 0:
                    prev_lines = lines[max(0, i-2):i]
                    has_intent = any(
                        self._is_intent_comment(line)
                        for line in prev_lines
                    )
                    if has_intent:
                        metrics.functions_with_intent += 1

            # Check for complex blocks (if, for, while, try)
            if re.match(r'^\s*(if|for|while|try)\s*[\(\{]', line):
                metrics.complex_blocks += 1

                # Check previous line for intent comment
                if i > 0:
                    prev_line = lines[i-1]
                    if self._is_intent_comment(prev_line):
                        metrics.documented_complex_blocks += 1

    def _is_intent_comment(self, line: str) -> bool:
        """Check if line contains an intent comment (not just code description)."""
        stripped = line.strip().lower()

        # Must be a comment
        if not (stripped.startswith('#') or stripped.startswith('//') or '/*' in stripped):
            return False

        # Check for intent keywords
        has_intent_keyword = any(keyword in stripped for keyword in self.INTENT_KEYWORDS)

        # Or substantial comment (>30 chars) likely explaining intent
        is_substantial = len(stripped) > 30 and not stripped.startswith(('#!', '#!/'))

        return has_intent_keyword or is_substantial

    def _generate_suggestions(self, metrics: IntentDocumentationMetrics) -> List[str]:
        """Generate specific suggestions based on metrics."""
        suggestions = []

        if metrics.files_with_purpose < metrics.files:
            suggestions.append(
                f"Add file-level purpose comments to {metrics.files - metrics.files_with_purpose} file(s)"
            )

        if metrics.undocumented_functions:
            suggestions.append(
                f"Add intent comments to {len(metrics.undocumented_functions)} function(s) explaining WHY/HOW"
            )
            # Example
            if metrics.undocumented_functions:
                func = metrics.undocumented_functions[0]
                suggestions.append(
                    f"  Example: Add comment before {func['name']}() at {func['file']}:{func['line']}"
                )

        if metrics.undocumented_blocks:
            suggestions.append(
                f"Add intent comments to {len(metrics.undocumented_blocks)} complex block(s)"
            )
            if metrics.undocumented_blocks:
                block = metrics.undocumented_blocks[0]
                suggestions.append(
                    f"  Example: Explain {block['type']} at {block['file']}:{block['line']}"
                )

        return suggestions
