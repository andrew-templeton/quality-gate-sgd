#!/usr/bin/env python3
"""
Test script to verify new quality dimensions catch the astropy-14182 issue.

The issue: Agent modified write() to support header_rows but missed read().
Expected: Algebraic dimension should score < 0.70 and flag missing read() dual.
"""

from quality_gate.dimension_algebraic import evaluate_algebraic_completeness
from quality_gate.dimension_documentation import evaluate_documentation_completeness
from quality_gate.dimension_bijective import evaluate_bijective_requirements


# Simplified diff (agent only modified write(), missed read())
DIFF = """diff --git a/astropy/io/ascii/rst.py b/astropy/io/ascii/rst.py
index abc123..def456 100644
--- a/astropy/io/ascii/rst.py
+++ b/astropy/io/ascii/rst.py
@@ -10,7 +10,7 @@ class RST(Basic):
-    def write(self, lines):
+    def write(self, lines, header_rows=None):
         '''Write table as RestructuredText.'''
+        if header_rows:
+            # Handle header rows
+            pass
         return lines
"""

FILE_CONTENTS = {
    "astropy/io/ascii/rst.py": """class RST(Basic):
    '''RestructuredText table format.'''

    def read(self, lines):
        '''Read RST table.'''
        return Table()

    def write(self, lines, header_rows=None):
        '''Write table as RestructuredText.'''
        if header_rows:
            pass
        return lines
"""
}

REQUIREMENTS = "Please support header_rows in RestructuredText output"

TEST_CODE = """
def test_rst_with_header_rows():
    table = QTable.read(lines, format='ascii.rst', header_rows=[1, 2])
    output = table.write(format='ascii.rst', header_rows=[1, 2])
    assert len(output) > 0
"""


def main():
    print("=" * 80)
    print("Testing astropy-14182: Agent missed read() when modifying write()")
    print("=" * 80)
    print()

    # Test Dimension 7: Algebraic Completeness
    print("Dimension 7: Algebraic Completeness")
    print("-" * 80)
    algebraic_result = evaluate_algebraic_completeness(DIFF, FILE_CONTENTS, use_llm=False)
    print(f"Score: {algebraic_result.score:.2f} (threshold: 0.70)")
    print(f"Lexical score: {algebraic_result.lexical_score:.2f}")
    print()
    print("Categories detected:")
    for cat in algebraic_result.categories:
        print(f"  - {cat.category.value}: {cat.actual_duals}/{cat.expected_duals} duals present")
        print(f"    Completeness: {cat.completeness_ratio:.2f}")
        if cat.missing_duals:
            print(f"    Missing: {', '.join(cat.missing_duals)}")
    print()
    print("Violations:")
    for v in algebraic_result.violations:
        print(f"  - {v}")
    print()
    print("Recommendations:")
    for r in algebraic_result.recommendations:
        print(f"  - {r}")
    print()

    # Expected result: Score should be 0.50 (1 out of 2 duals present)
    if algebraic_result.score < 0.70:
        print("✅ PASS: Algebraic dimension correctly caught missing read() operation")
    else:
        print("❌ FAIL: Algebraic dimension did not catch missing read() operation")
    print()
    print()

    # Test Dimension 6: Documentation Completeness
    print("Dimension 6: Documentation Completeness")
    print("-" * 80)
    doc_result = evaluate_documentation_completeness(DIFF, FILE_CONTENTS)
    print(f"Score: {doc_result.score:.2f} (threshold: 0.70)")
    print(f"Symbol ratio: {doc_result.symbol_ratio:.2f}")
    print(f"File ratio: {doc_result.file_ratio:.2f}")
    print(f"Directory ratio: {doc_result.directory_ratio:.2f}")
    print()
    print("Metrics:")
    print(f"  Documented symbols: {doc_result.metrics.documented_symbols}/{doc_result.metrics.declared_symbols}")
    print(f"  Documented files: {doc_result.metrics.documented_files}/{doc_result.metrics.total_files}")
    print(f"  Documented directories: {doc_result.metrics.documented_directories}/{doc_result.metrics.total_directories}")
    print()
    print("Recommendations:")
    for r in doc_result.recommendations[:3]:
        print(f"  - {r}")
    print()
    print()

    # Test Dimension 8: Bijective Requirements
    print("Dimension 8: Bijective Requirements Alignment")
    print("-" * 80)
    bijective_result = evaluate_bijective_requirements(
        REQUIREMENTS,
        TEST_CODE,
        DIFF,
        FILE_CONTENTS,
        use_llm=False
    )
    print(f"Score: {bijective_result.score:.2f} (threshold: 0.70)")
    print()
    print("Claim Graph:")
    print(f"  Imperative claims: {len(bijective_result.claim_graph.imperative_claims)}")
    for claim in bijective_result.claim_graph.imperative_claims:
        print(f"    - {claim.subject} {claim.predicate} {claim.object}")
    print(f"  Declarative claims: {len(bijective_result.claim_graph.declarative_claims)}")
    for claim in bijective_result.claim_graph.declarative_claims:
        print(f"    - {claim.subject} {claim.predicate} {claim.object}")
    print(f"  Test claims: {len(bijective_result.claim_graph.test_claims)}")
    for claim in bijective_result.claim_graph.test_claims:
        print(f"    - {claim.subject} {claim.predicate} {claim.object}")
    print(f"  Code claims: {len(bijective_result.claim_graph.code_claims)}")
    for claim in bijective_result.claim_graph.code_claims:
        print(f"    - {claim.subject} {claim.predicate} {claim.object}")
    print()
    print("Phase Alignments:")
    print(f"  Phase 1 (Imperative ↔ Declarative): {bijective_result.phase1_alignment.score:.2f}")
    print(f"  Phase 2 (Declarative ↔ Test): {bijective_result.phase2_alignment.score:.2f}")
    print(f"  Phase 3 (Test ↔ Code): {bijective_result.phase3_alignment.score:.2f}")
    print()
    print("Recommendations:")
    for r in bijective_result.recommendations[:3]:
        print(f"  - {r}")
    print()

    if bijective_result.score < 0.70:
        print("✅ PASS: Bijective dimension detected incomplete requirements alignment")
    else:
        print("⚠️  WARNING: Bijective dimension may not have caught the issue")
    print()
    print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Dimension 6 (Documentation): {doc_result.score:.2f}")
    print(f"Dimension 7 (Algebraic): {algebraic_result.score:.2f}")
    print(f"Dimension 8 (Bijective): {bijective_result.score:.2f}")
    print()

    # Overall assessment
    implementation_score = (
        0.10 * doc_result.score +
        0.05 * algebraic_result.score +
        0.05 * bijective_result.score
    ) / 0.20

    print(f"Implementation Score (Group B): {implementation_score:.2f}")
    print()

    if algebraic_result.score < 0.70:
        print("✅ SUCCESS: The new algebraic dimension successfully detected")
        print("   the missing read() operation that the original 5 dimensions missed!")
        print()
        print("   This confirms that Dimension 7 (Algebraic Completeness) addresses")
        print("   the gap in the quality gate system.")
    else:
        print("❌ ISSUE: Expected algebraic dimension to catch the missing dual operation.")
        print("   Need to investigate why detection failed.")

    print()


if __name__ == "__main__":
    main()
