# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Dimension 8: Bijective Requirements Alignment

Evaluates bidirectional traceability between requirements, tests, and code using
the Logic Vernacular Ontology for deterministic claim extraction.

Three-phase scoring (0-1 scalar):
  Phase 1: Imperative ↔ Declarative specification
  Phase 2: Declarative ↔ Test plan
  Phase 3: Test ↔ Code implementation

  score = (phase1 * phase2 * phase3)^(1/3)  # 3-way geometric mean

Each phase: sqrt((forward * backward)) where forward/backward are ratios of mapped claims.
"""

import re
import json
import os
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional
from enum import Enum


# =============================================================================
# Logic Vernacular Ontology Integration
# =============================================================================

# This is a subset of the ontology focused on requirements analysis
LOGIC_VERNACULAR_MAPPINGS = {
    # Completeness & Coverage
    "support": "implement_category_complete",
    "supports": "implement_category_complete",
    "supporting": "implement_category_complete",
    "complete": "category_complete",
    "fully": "category_complete",
    "handle": "implements_operation",
    "handles": "implements_operation",
    "process": "implements_operation",
    "processes": "implements_operation",
    "manage": "implements_state_transition",
    "manages": "implements_state_transition",

    # Duality & Operations
    "read": "input_operation",
    "write": "output_operation",
    "encode": "serialization",
    "decode": "deserialization",
    "serialize": "serialization",
    "deserialize": "deserialization",

    # Necessity & Requirements
    "must": "necessary",
    "required": "necessary",
    "needs": "necessary",
    "should": "normative_necessary",
    "shall": "strict_necessary",

    # Alignment & Correspondence
    "aligns with": "bijective_correspondence",
    "corresponds to": "bijective_correspondence",
    "maps to": "morphism",

    # Validation
    "satisfies": "satisfies_predicate",
    "fulfills": "satisfies_predicate",
    "validates": "satisfies_predicate",
    "implements": "realization",
    "realizes": "realization",
}

# Category detection from context
CATEGORY_INFERENCE_PATTERNS = {
    "input|output|file|stream": "I/O",
    "format|serialization": "Serialization",
    "database|storage": "CRUD",
    "encrypt|secure": "Cryptography",
    "add|collection": "Collection",
    "resource|connection": "Resource",
}


@dataclass
class LogicTuple:
    """
    A logic tuple representing a claim.

    Format: { subject: string, predicate: string, object: string }
    Predicate MUST come from specification terms in Logic Vernacular Ontology.
    """
    subject: str
    predicate: str  # Must be from LOGIC_VERNACULAR_MAPPINGS values
    object: str
    source: str  # 'imperative', 'declarative', 'test', 'code'

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            'subject': self.subject,
            'predicate': self.predicate,
            'object': self.object,
            'source': self.source
        }

    def matches(self, other: 'LogicTuple', semantic: bool = True) -> bool:
        """
        Check if this tuple matches another tuple.

        Args:
            other: Another LogicTuple to compare
            semantic: If True, use semantic matching (embeddings). If False, exact match.

        Returns:
            True if tuples are semantically equivalent
        """
        if not semantic:
            # Exact match
            return (
                self.subject.lower() == other.subject.lower() and
                self.predicate == other.predicate and
                self.object.lower() == other.object.lower()
            )
        else:
            # Semantic matching (simplified - could use embeddings)
            return (
                self._semantic_match(self.subject, other.subject) and
                self.predicate == other.predicate and
                self._semantic_match(self.object, other.object)
            )

    def _semantic_match(self, s1: str, s2: str) -> bool:
        """Simplified semantic matching (can be enhanced with embeddings)."""
        # Normalize and compare
        s1_norm = s1.lower().strip()
        s2_norm = s2.lower().strip()

        # Exact match
        if s1_norm == s2_norm:
            return True

        # Substring match (loose)
        if s1_norm in s2_norm or s2_norm in s1_norm:
            return True

        return False


@dataclass
class ClaimGraph:
    """
    Claim graph representing requirements at different levels.
    """
    imperative_claims: List[LogicTuple] = field(default_factory=list)
    declarative_claims: List[LogicTuple] = field(default_factory=list)
    test_claims: List[LogicTuple] = field(default_factory=list)
    code_claims: List[LogicTuple] = field(default_factory=list)


@dataclass
class PhaseAlignment:
    """Alignment score for a single phase (bidirectional)."""
    forward_ratio: float  # Mapped claims from source / total source claims
    backward_ratio: float  # Mapped claims from target / total target claims
    score: float  # sqrt(forward * backward)
    forward_mapped: int
    forward_total: int
    backward_mapped: int
    backward_total: int


@dataclass
class BijectiveRequirementsResult:
    """Result of bijective requirements evaluation."""
    score: float  # 0-1 scalar
    claim_graph: ClaimGraph
    phase1_alignment: PhaseAlignment  # Imperative ↔ Declarative
    phase2_alignment: PhaseAlignment  # Declarative ↔ Test
    phase3_alignment: PhaseAlignment  # Test ↔ Code
    violations: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class BijectiveRequirementsEvaluator:
    """
    Evaluates bijective requirements alignment using Logic Vernacular Ontology.

    Uses deterministic claim extraction with ontology-based predicate mapping.
    """

    def __init__(self, use_llm: bool = True):
        """
        Initialize evaluator.

        Args:
            use_llm: Whether to use LLM for claim extraction (default: True)
                     If False, uses simple regex-based extraction (less accurate)
        """
        self.use_llm = use_llm

    def evaluate(
        self,
        requirements: str,
        diff: str,
        file_contents: Dict[str, str]
    ) -> BijectiveRequirementsResult:
        """
        Evaluate bijective requirements alignment using only VISIBLE data.

        IMPORTANT: Does NOT use hidden test code. Instead, generates an "assumed
        specification" from requirements through category theory completeness.

        Args:
            requirements: Natural language requirements (visible problem statement)
            diff: Git diff of code changes
            file_contents: Map of file paths to their full content

        Returns:
            BijectiveRequirementsResult with score in [0, 1]

        Note:
            Three-phase alignment without hidden test data:
            Phase 1: Imperative → Declarative (extract formal requirements)
            Phase 2: Declarative → Assumed Spec (category completeness expansion)
            Phase 3: Assumed Spec → Code (implementation alignment)

            The "assumed spec" (test_claims) represents what SHOULD be tested
            based on category theory completeness - e.g., if requirements mention
            "write", the assumed spec includes "read" as its dual.
        """
        # Build claim graph (generates assumed spec from requirements)
        claim_graph = self._build_claim_graph(requirements, diff, file_contents)

        # Phase 1: Imperative ↔ Declarative
        phase1 = self._compute_alignment(
            claim_graph.imperative_claims,
            claim_graph.declarative_claims
        )

        # Phase 2: Declarative ↔ Assumed Spec (from category completeness)
        phase2 = self._compute_alignment(
            claim_graph.declarative_claims,
            claim_graph.test_claims  # "test_claims" = assumed spec
        )

        # Phase 3: Assumed Spec ↔ Code
        phase3 = self._compute_alignment(
            claim_graph.test_claims,
            claim_graph.code_claims
        )

        # Overall score: 3-way geometric mean
        overall_score = (phase1.score * phase2.score * phase3.score) ** (1/3)

        # Generate violations and recommendations
        violations = self._generate_violations(phase1, phase2, phase3)
        recommendations = self._generate_recommendations(
            claim_graph,
            phase1,
            phase2,
            phase3
        )

        return BijectiveRequirementsResult(
            score=overall_score,
            claim_graph=claim_graph,
            phase1_alignment=phase1,
            phase2_alignment=phase2,
            phase3_alignment=phase3,
            violations=violations,
            recommendations=recommendations
        )

    def _build_claim_graph(
        self,
        requirements: str,
        diff: str,
        file_contents: Dict[str, str]
    ) -> ClaimGraph:
        """
        Build claim graph from VISIBLE sources only (no hidden test data).

        Generates:
        1. Imperative claims (from requirements)
        2. Declarative claims (formalized requirements)
        3. Assumed spec claims (category completeness expansion of declarative)
        4. Code claims (from diff)

        The "assumed spec" represents what SHOULD be tested based on category
        theory completeness, WITHOUT seeing the hidden FAIL_TO_PASS tests.
        """
        graph = ClaimGraph()

        # Extract imperative claims from requirements
        graph.imperative_claims = self._extract_imperative_claims(requirements)

        # Expand to declarative specification
        graph.declarative_claims = self._expand_to_declarative(
            graph.imperative_claims,
            requirements
        )

        # Generate assumed spec from declarative claims through category completeness
        # This is the emergent completeness property: if declarative mentions "write",
        # the assumed spec includes "read" as its category-theoretic dual
        graph.test_claims = self._generate_assumed_spec(graph.declarative_claims)

        # Extract code claims from diff
        graph.code_claims = self._extract_code_claims(diff, file_contents)

        return graph

    def _extract_imperative_claims(self, requirements: str) -> List[LogicTuple]:
        """
        Extract imperative claims from natural language requirements.

        Uses LLM with Logic Vernacular Ontology for robust extraction.
        """
        claims = []

        if self.use_llm:
            claims = self._extract_imperative_claims_llm(requirements)
            # Fallback to regex if LLM fails or returns no claims
            if not claims:
                claims = self._extract_imperative_claims_regex(requirements)
        else:
            claims = self._extract_imperative_claims_regex(requirements)

        return claims

    def _extract_imperative_claims_llm(self, requirements: str) -> List[LogicTuple]:
        """
        Extract imperative claims using LLM with Logic Vernacular Ontology prompt.

        Uses gpt-5-mini (or configured model) for robust natural language understanding.
        """
        try:
            from openai import OpenAI
        except ImportError:
            # Fallback to regex if OpenAI not available
            return []

        # Get model from environment or use default
        model = os.getenv('BIJECTIVE_REQUIREMENTS_MODEL', 'gpt-5-mini')

        client = OpenAI()

        prompt = f"""Extract imperative claims from the following software requirements.

REQUIREMENTS:
{requirements}

TASK:
Identify all imperative statements that describe:
1. Features to support/add/implement
2. Operations that need to be handled (especially I/O operations like read/write)
3. Functionality requirements

For each claim, extract:
- subject: The component/context being modified (e.g., "RST", "output", "format")
- object: What needs to be supported/added (e.g., "header_rows", "parameter")
- predicate: The relationship (use these terms from Logic Vernacular Ontology):
  * "implement_category_complete" - for supporting/adding features
  * "implements_operation" - for handling/processing operations
  * "necessary" - for must/required features

IMPORTANT:
- Extract multi-word phrases (e.g., "header rows" not just "header")
- For I/O operations, recognize that supporting "write X" often implies "read X" is needed too
- Focus on what the requirements are asking to be implemented

OUTPUT FORMAT (JSON array):
[
  {{"subject": "component", "predicate": "predicate_type", "object": "feature"}},
  ...
]

Respond with ONLY the JSON array, no explanation."""

        try:
            # Use OpenAI Responses API
            response = client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": "You are a requirements analyst extracting formal claims from natural language. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
            )

            content = response.output_text.strip()

            # Extract JSON from response (might have markdown code blocks)
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].split('```')[0].strip()

            # Parse JSON
            claims_data = json.loads(content)

            # Convert to LogicTuple objects
            claims = []
            for claim_dict in claims_data:
                claims.append(LogicTuple(
                    subject=claim_dict.get('subject', ''),
                    predicate=claim_dict.get('predicate', ''),
                    object=claim_dict.get('object', ''),
                    source='imperative'
                ))

            return claims

        except Exception as e:
            # Log error but don't fail - fallback to regex
            print(f"Warning: LLM claim extraction failed: {e}")
            return []

    def _extract_imperative_claims_regex(self, requirements: str) -> List[LogicTuple]:
        """
        Regex-based claim extraction (deterministic but limited).

        Enhanced to handle multi-word phrases like "header rows".
        """
        claims = []

        # Pattern 1: "support X in Y" (handles multi-word X)
        # Captures: "support header rows in RestructuredText output"
        pattern1 = r'(support|supports|add|implement|handle)\s+([\w\s]+?)\s+(?:in|for|to)\s+([\w\s]+?)(?:\s+output|\s+format|$|\.|\n)'
        for match in re.finditer(pattern1, requirements, re.IGNORECASE):
            verb = match.group(1).lower()
            obj = match.group(2).strip()
            context = match.group(3).strip()

            # Map verb to specification term using ontology
            predicate = LOGIC_VERNACULAR_MAPPINGS.get(verb, verb)

            claims.append(LogicTuple(
                subject=context,
                predicate=predicate,
                object=obj,
                source='imperative'
            ))

        # Pattern 2: Simpler "support X" without explicit context
        if not claims:
            pattern2 = r'(support|supports|add|implement|handle)\s+([\w\s]+?)(?:\s+in|$|\.|\n)'
            for match in re.finditer(pattern2, requirements, re.IGNORECASE):
                verb = match.group(1).lower()
                obj = match.group(2).strip()

                # Map verb to specification term using ontology
                predicate = LOGIC_VERNACULAR_MAPPINGS.get(verb, verb)

                claims.append(LogicTuple(
                    subject='system',  # Generic context
                    predicate=predicate,
                    object=obj,
                    source='imperative'
                ))

        return claims

    def _expand_to_declarative(
        self,
        imperative_claims: List[LogicTuple],
        requirements: str
    ) -> List[LogicTuple]:
        """
        Expand imperative claims to declarative specification.

        Key insight: "support X" → "implement all duals in X's category"
        Example: "support header_rows in RST output"
          → write(header_rows) [explicit]
          → read(header_rows) [implicit, inferred from category]
        """
        declarative = []

        for claim in imperative_claims:
            # If predicate is "implement_category_complete", expand to duals
            if claim.predicate == "implement_category_complete":
                # Infer category from context
                category = self._infer_category(requirements, claim)

                # Generate dual operations based on category
                duals = self._get_category_duals(category)

                for dual_op in duals:
                    declarative.append(LogicTuple(
                        subject=dual_op,
                        predicate="implement_category_complete",
                        object=claim.object,
                        source='declarative'
                    ))
            else:
                # Pass through non-category claims
                declarative.append(LogicTuple(
                    subject=claim.subject,
                    predicate=claim.predicate,
                    object=claim.object,
                    source='declarative'
                ))

        return declarative

    def _infer_category(self, context: str, claim: LogicTuple) -> str:
        """Infer operation category from context."""
        context_lower = context.lower()

        for pattern, category in CATEGORY_INFERENCE_PATTERNS.items():
            if re.search(pattern, context_lower):
                return category

        return "Unknown"

    def _get_category_duals(self, category: str) -> List[str]:
        """Get expected dual operations for a category."""
        duals_map = {
            "I/O": ["read", "write"],
            "Serialization": ["encode", "decode"],
            "CRUD": ["create", "delete"],
            "State": ["get", "set"],
            "Collection": ["add", "remove"],
            "Resource": ["acquire", "release"],
        }
        return duals_map.get(category, [])

    def _generate_assumed_spec(self, declarative_claims: List[LogicTuple]) -> List[LogicTuple]:
        """
        Generate assumed specification from declarative claims through category completeness.

        This is the KEY method for emergent completeness: it takes the declarative
        specification and expands it to include all category-theoretic duals that
        SHOULD be present, WITHOUT looking at hidden test code.

        Example:
            Declarative: "write(header_rows)"
            → Assumed spec: ["write(header_rows)", "read(header_rows)"]

            Category theory says: if write exists, read must exist (I/O duals)

        Args:
            declarative_claims: Formalized requirements

        Returns:
            Assumed specification with category-theoretic completeness
        """
        assumed_spec = []
        seen_operations = set()

        # First, include all declarative claims as-is
        for claim in declarative_claims:
            assumed_spec.append(LogicTuple(
                subject=claim.subject,
                predicate=claim.predicate,
                object=claim.object,
                source='assumed_spec'
            ))
            seen_operations.add(claim.subject)

        # Now expand with category-theoretic duals
        # This is where we catch missing operations: if code has write() but
        # not read(), this will add read() to assumed spec, causing phase3 misalignment
        dual_pairs = [
            ('read', 'write'),
            ('write', 'read'),
            ('encode', 'decode'),
            ('decode', 'encode'),
            ('get', 'set'),
            ('set', 'get'),
            ('add', 'remove'),
            ('remove', 'add'),
            ('create', 'delete'),
            ('delete', 'create'),
            ('acquire', 'release'),
            ('release', 'acquire'),
            ('open', 'close'),
            ('close', 'open'),
            ('start', 'stop'),
            ('stop', 'start'),
            ('lock', 'unlock'),
            ('unlock', 'lock'),
        ]

        for claim in declarative_claims:
            # Check if this operation has a category-theoretic dual
            for op1, op2 in dual_pairs:
                if claim.subject == op1 and op2 not in seen_operations:
                    # Add the dual to assumed spec
                    assumed_spec.append(LogicTuple(
                        subject=op2,
                        predicate=claim.predicate,
                        object=claim.object,
                        source='assumed_spec_dual'  # Mark as inferred dual
                    ))
                    seen_operations.add(op2)

        return assumed_spec

    def _extract_test_claims(self, test_code: str) -> List[LogicTuple]:
        """Extract claims from test code."""
        claims = []

        # Pattern: function calls in tests
        # Example: QTable.read(..., header_rows=[...])
        pattern = r'(\w+)\s*\.\s*(\w+)\s*\([^)]*(\w+)\s*='
        for match in re.finditer(pattern, test_code):
            subject = match.group(2)  # Method name (read, write, etc.)
            param = match.group(3)    # Parameter name

            claims.append(LogicTuple(
                subject=subject,
                predicate="works_with",
                object=param,
                source='test'
            ))

        return claims

    def _extract_code_claims(
        self,
        diff: str,
        file_contents: Dict[str, str]
    ) -> List[LogicTuple]:
        """Extract claims from code implementation."""
        claims = []

        # Pattern: function definitions with parameters
        # Example: def write(self, lines, header_rows=None):
        pattern = r'def\s+(\w+)\s*\([^)]*(\w+)\s*='
        for match in re.finditer(pattern, diff):
            func_name = match.group(1)
            param = match.group(2)

            claims.append(LogicTuple(
                subject=func_name,
                predicate="implements",
                object=param,
                source='code'
            ))

        # Also check TypeScript/JavaScript
        pattern = r'function\s+(\w+)\s*\([^)]*(\w+)\s*:'
        for match in re.finditer(pattern, diff):
            func_name = match.group(1)
            param = match.group(2)

            claims.append(LogicTuple(
                subject=func_name,
                predicate="implements",
                object=param,
                source='code'
            ))

        return claims

    def _compute_alignment(
        self,
        source_claims: List[LogicTuple],
        target_claims: List[LogicTuple]
    ) -> PhaseAlignment:
        """
        Compute bidirectional alignment between two claim sets.

        Returns: PhaseAlignment with score = sqrt(forward * backward)
        """
        if not source_claims or not target_claims:
            # If either is empty, return neutral (1.0)
            return PhaseAlignment(
                forward_ratio=1.0,
                backward_ratio=1.0,
                score=1.0,
                forward_mapped=0,
                forward_total=len(source_claims),
                backward_mapped=0,
                backward_total=len(target_claims)
            )

        # Forward: source → target
        forward_mapped = 0
        for src_claim in source_claims:
            if any(src_claim.matches(tgt_claim) for tgt_claim in target_claims):
                forward_mapped += 1

        forward_ratio = forward_mapped / len(source_claims)

        # Backward: target → source
        backward_mapped = 0
        for tgt_claim in target_claims:
            if any(tgt_claim.matches(src_claim) for src_claim in source_claims):
                backward_mapped += 1

        backward_ratio = backward_mapped / len(target_claims)

        # Geometric mean (bijection score)
        score = (forward_ratio * backward_ratio) ** 0.5

        return PhaseAlignment(
            forward_ratio=forward_ratio,
            backward_ratio=backward_ratio,
            score=score,
            forward_mapped=forward_mapped,
            forward_total=len(source_claims),
            backward_mapped=backward_mapped,
            backward_total=len(target_claims)
        )

    def _generate_violations(
        self,
        phase1: PhaseAlignment,
        phase2: PhaseAlignment,
        phase3: PhaseAlignment
    ) -> List[str]:
        """Generate violation messages."""
        violations = []

        if phase1.score < 0.7:
            violations.append(
                f"Imperative ↔ Declarative alignment: {phase1.score:.2f} < 0.70 "
                f"(forward: {phase1.forward_mapped}/{phase1.forward_total}, "
                f"backward: {phase1.backward_mapped}/{phase1.backward_total})"
            )

        if phase2.score < 0.7:
            violations.append(
                f"Declarative ↔ Test alignment: {phase2.score:.2f} < 0.70 "
                f"(forward: {phase2.forward_mapped}/{phase2.forward_total}, "
                f"backward: {phase2.backward_mapped}/{phase2.backward_total})"
            )

        if phase3.score < 0.7:
            violations.append(
                f"Test ↔ Code alignment: {phase3.score:.2f} < 0.70 "
                f"(forward: {phase3.forward_mapped}/{phase3.forward_total}, "
                f"backward: {phase3.backward_mapped}/{phase3.backward_total})"
            )

        return violations

    def _generate_recommendations(
        self,
        claim_graph: ClaimGraph,
        phase1: PhaseAlignment,
        phase2: PhaseAlignment,
        phase3: PhaseAlignment
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        # Phase 3 (Test → Code) is most actionable
        if phase3.score < 0.7:
            # Find test claims not implemented in code
            for test_claim in claim_graph.test_claims:
                if not any(test_claim.matches(code_claim) for code_claim in claim_graph.code_claims):
                    recommendations.append(
                        f"Test requires {test_claim.subject}({test_claim.object}) "
                        f"but code doesn't implement it"
                    )

        # Phase 2 (Declarative → Test)
        if phase2.score < 0.7:
            for decl_claim in claim_graph.declarative_claims:
                if not any(decl_claim.matches(test_claim) for test_claim in claim_graph.test_claims):
                    recommendations.append(
                        f"Specification requires {decl_claim.subject}({decl_claim.object}) "
                        f"but no test validates it"
                    )

        return recommendations


# =============================================================================
# Helper Functions
# =============================================================================

def evaluate_bijective_requirements(
    requirements: str,
    diff: str,
    file_contents: Dict[str, str],
    use_llm: bool = True
) -> BijectiveRequirementsResult:
    """
    Evaluate bijective requirements alignment using only VISIBLE data.

    IMPORTANT: This function deliberately does NOT accept test_code to avoid
    overfitting to hidden FAIL_TO_PASS tests. Bijective alignment is assessed
    between requirements (problem statement) and code implementation only.

    Args:
        requirements: Natural language requirements (visible problem statement only)
        diff: Git diff of code changes
        file_contents: Map of file paths to their full content
        use_llm: Whether to use LLM for claim extraction

    Returns:
        BijectiveRequirementsResult with score in [0, 1]

    Note:
        Bijective alignment is evaluated between requirements and code only.
        No test code is used to avoid overfitting to hidden acceptance criteria.
        The emergent property is that structural completeness (category theory,
        algebraic duals) should catch missing requirements without seeing tests.
    """
    evaluator = BijectiveRequirementsEvaluator(use_llm=use_llm)
    return evaluator.evaluate(requirements, diff, file_contents)
