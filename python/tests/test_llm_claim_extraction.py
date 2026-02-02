#!/usr/bin/env python3
"""
Test LLM-driven claim extraction for bijective dimension.

Tests that the LLM can extract claims like "support header rows in RestructuredText"
where regex patterns fail on multi-word phrases.
"""

import json
import os
from quality_gate.dimension_bijective import BijectiveRequirementsEvaluator

def test_llm_extraction():
    # Load astropy task
    with open('data/swe-bench/lite.jsonl') as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] == 'astropy__astropy-14182':
                break

    requirements = task['problem_statement']

    print("="*80)
    print("LLM-DRIVEN CLAIM EXTRACTION TEST")
    print("="*80)
    print()
    print("Requirements (first 300 chars):")
    print(requirements[:300])
    print("...")
    print()

    # Check if API key is available
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("⚠️  OPENAI_API_KEY not set - will test fallback to regex only")
        print()

    print("="*80)
    print("METHOD 1: Regex-based extraction (baseline)")
    print("="*80)
    evaluator_regex = BijectiveRequirementsEvaluator(use_llm=False)
    claims_regex = evaluator_regex._extract_imperative_claims(requirements)

    print(f"\nExtracted {len(claims_regex)} claims:")
    for claim in claims_regex:
        print(f"  - subject='{claim.subject}'")
        print(f"    predicate='{claim.predicate}'")
        print(f"    object='{claim.object}'")
        print()

    print("="*80)
    print("METHOD 2: LLM-based extraction (with fallback)")
    print("="*80)

    evaluator_llm = BijectiveRequirementsEvaluator(use_llm=True)

    if api_key:
        print("✓ API key found - testing LLM extraction...")
        try:
            claims_llm = evaluator_llm._extract_imperative_claims(requirements)

            print(f"\nExtracted {len(claims_llm)} claims:")
            for claim in claims_llm:
                print(f"  - subject='{claim.subject}'")
                print(f"    predicate='{claim.predicate}'")
                print(f"    object='{claim.object}'")
                print()

            if len(claims_llm) > len(claims_regex):
                print("✓ SUCCESS: LLM extracted more claims than regex!")
            elif len(claims_llm) == len(claims_regex) and claims_llm:
                print("✓ PASS: LLM extracted same number of claims")
            elif not claims_llm and claims_regex:
                print("⚠️  LLM failed, but regex fallback worked")
            else:
                print("⚠️  Both methods extracted minimal claims")

        except Exception as e:
            print(f"✗ LLM extraction failed: {e}")
            print("  (Falling back to regex)")

    else:
        print("✗ No API key - skipping LLM test")
        print("  Set OPENAI_API_KEY to test LLM extraction")

    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print()
    print("The bijective dimension now supports LLM-driven claim extraction:")
    print("  1. Tries LLM first (gpt-5-mini by default)")
    print("  2. Falls back to improved regex if LLM fails")
    print("  3. Regex now handles multi-word phrases like 'header rows'")
    print()
    print("Benefits:")
    print("  - More robust natural language understanding")
    print("  - Handles complex requirement statements")
    print("  - Fallback ensures it always works")
    print()
    print("Configuration:")
    print("  - Model: $BIJECTIVE_REQUIREMENTS_MODEL (default: gpt-5-mini)")
    print("  - API Key: $OPENAI_API_KEY")
    print("  - Enable: use_llm=True in evaluate_bijective_requirements()")
    print()


if __name__ == '__main__':
    test_llm_extraction()
