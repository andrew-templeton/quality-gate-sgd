#!/usr/bin/env python3
# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
SWE-agent Quality Gate Experiment v2

Uses SWE-agent's run-batch CLI with proper instance filtering.
Runs baseline then treatment, compares results.
"""

import sys
import os
import json
import time
import subprocess
from pathlib import Path
from typing import List, Dict
import argparse

# Hard tasks (15 most complex by patch length)
HARD_TASKS = [
    "django__django-11019",
    "scikit-learn__scikit-learn-10297",
    "matplotlib__matplotlib-24265",
    "pallets__flask-5063",
    "matplotlib__matplotlib-18869",
    "sympy__sympy-14308",
    "django__django-16820",
    "sphinx-doc__sphinx-7686",
    "sympy__sympy-18199",
    "sympy__sympy-20322",
    "scikit-learn__scikit-learn-25638",
    "sympy__sympy-20049",
    "sympy__sympy-23191",
    "matplotlib__matplotlib-25442",
    "django__django-13265",
]


def run_swe_agent_batch(
    task_ids: List[str],
    model: str,
    output_dir: Path,
    condition: str,
    config_path: str = "/tmp/SWE-agent/config/default.yaml",
) -> Dict:
    """
    Run SWE-agent on a batch of tasks.

    Args:
        task_ids: List of SWE-bench instance IDs
        model: Model name (e.g., gpt-4o)
        output_dir: Where to save results
        condition: 'baseline' or 'treatment'
        config_path: Path to SWE-agent config

    Returns:
        Results dictionary
    """
    # Create filter string for specific instances
    filter_str = "|".join(task_ids)

    # Build command
    cmd = [
        sys.executable, "-m", "sweagent", "run-batch",
        "--config", config_path,
        "--agent.model.name", model,
        "--agent.model.per_instance_cost_limit", "5.0",
        "--agent.model.temperature", "0.0",
        "--instances.type", "swe_bench",
        "--instances.subset", "lite",
        "--instances.split", "test",
        f"--instances.filter={filter_str}",
        "--instances.evaluate", "true",
        "--output_dir", str(output_dir / condition),
        "--num_workers", "1",  # Sequential for clean comparison
    ]

    print(f"\n{'='*70}")
    print(f"RUNNING: {condition.upper()}")
    print(f"{'='*70}")
    print(f"Model: {model}")
    print(f"Tasks: {len(task_ids)}")
    print(f"Output: {output_dir / condition}")
    print(f"{'='*70}\n")

    # Set API key
    env = os.environ.copy()
    if os.path.exists(os.path.expanduser('~/.openai')):
        with open(os.path.expanduser('~/.openai')) as f:
            env['OPENAI_API_KEY'] = f.read().strip()

    start_time = time.time()

    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=False,  # Show output in real-time
            timeout=7200,  # 2 hour timeout for batch
        )

        success = result.returncode == 0

    except subprocess.TimeoutExpired:
        print("Timeout expired!")
        success = False
    except Exception as e:
        print(f"Error: {e}")
        success = False

    duration = time.time() - start_time

    # Load results from output directory
    results = load_results(output_dir / condition)

    return {
        'condition': condition,
        'model': model,
        'tasks': len(task_ids),
        'success': success,
        'duration_seconds': duration,
        'results': results,
    }


def load_results(output_dir: Path) -> Dict:
    """Load results from SWE-agent output directory."""
    results = {
        'resolved': 0,
        'total': 0,
        'instances': [],
    }

    # Look for results file
    results_file = output_dir / "results.json"
    if results_file.exists():
        with open(results_file) as f:
            data = json.load(f)
            results['resolved'] = data.get('resolved', 0)
            results['total'] = data.get('total', 0)
            results['instances'] = data.get('instances', [])
    else:
        # Try to find individual trajectory files
        for traj_file in output_dir.glob("**/*.traj"):
            results['total'] += 1
            try:
                with open(traj_file) as f:
                    traj = json.load(f)
                    if traj.get('info', {}).get('resolved', False):
                        results['resolved'] += 1
                    results['instances'].append({
                        'instance_id': traj.get('instance_id', 'unknown'),
                        'resolved': traj.get('info', {}).get('resolved', False),
                    })
            except Exception as e:
                print(f"Error loading {traj_file}: {e}")

    return results


def run_experiment(
    task_ids: List[str],
    model: str,
    output_dir: Path,
    conditions: List[str] = ['baseline', 'treatment'],
) -> Dict:
    """
    Run the full experiment.

    Args:
        task_ids: SWE-bench instance IDs
        model: Model to use
        output_dir: Output directory
        conditions: Conditions to run

    Returns:
        Summary with comparison
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'#'*70}")
    print("SWE-AGENT QUALITY GATE EXPERIMENT")
    print(f"{'#'*70}")
    print(f"Model: {model}")
    print(f"Tasks: {len(task_ids)}")
    print(f"Conditions: {conditions}")
    print(f"{'#'*70}\n")

    all_results = {}

    for condition in conditions:
        # For treatment, we'd use a config that includes quality gate
        # For now, both use same config (baseline for validation)
        config_path = "/tmp/SWE-agent/config/default.yaml"

        # TODO: For treatment, use config with quality gate hook
        # This requires modifying SWE-agent's submission review

        result = run_swe_agent_batch(
            task_ids=task_ids,
            model=model,
            output_dir=output_dir,
            condition=condition,
            config_path=config_path,
        )

        all_results[condition] = result

    # Compute summary
    summary = compute_summary(all_results)

    # Save summary
    summary_file = output_dir / "experiment_summary.json"
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"\n{'#'*70}")
    print("EXPERIMENT SUMMARY")
    print(f"{'#'*70}")
    print(json.dumps(summary, indent=2))

    return summary


def compute_summary(all_results: Dict) -> Dict:
    """Compute experiment summary."""
    summary = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
    }

    for condition, data in all_results.items():
        results = data.get('results', {})
        resolved = results.get('resolved', 0)
        total = results.get('total', 0)

        summary[condition] = {
            'resolved': resolved,
            'total': total,
            'pass_rate': resolved / total if total > 0 else 0,
            'duration_seconds': data.get('duration_seconds', 0),
        }

    # Compute improvement if both conditions present
    if 'baseline' in summary and 'treatment' in summary:
        baseline_rate = summary['baseline'].get('pass_rate', 0)
        treatment_rate = summary['treatment'].get('pass_rate', 0)
        summary['improvement_pp'] = (treatment_rate - baseline_rate) * 100

    return summary


def main():
    parser = argparse.ArgumentParser(description='SWE-agent Quality Gate Experiment')
    parser.add_argument('--model', default='gpt-4o', help='Model to use')
    parser.add_argument('--tasks', type=int, default=15, help='Number of hard tasks')
    parser.add_argument('--conditions', nargs='+', default=['baseline', 'treatment'])
    parser.add_argument('--output', default='python/experiments/results')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    task_ids = HARD_TASKS[:args.tasks]

    print(f"Selected {len(task_ids)} hard tasks:")
    for tid in task_ids:
        print(f"  - {tid}")

    if args.dry_run:
        print(f"\n[DRY RUN]")
        print(f"Model: {args.model}")
        print(f"Conditions: {args.conditions}")
        print(f"Would run {len(task_ids)} tasks per condition")
        return 0

    summary = run_experiment(
        task_ids=task_ids,
        model=args.model,
        output_dir=Path(args.output),
        conditions=args.conditions,
    )

    baseline_rate = summary.get('baseline', {}).get('pass_rate', 0) * 100
    treatment_rate = summary.get('treatment', {}).get('pass_rate', 0) * 100
    improvement = summary.get('improvement_pp', 0)

    print(f"\n{'='*70}")
    print("FINAL RESULTS")
    print(f"{'='*70}")
    print(f"Baseline:  {baseline_rate:.1f}%")
    print(f"Treatment: {treatment_rate:.1f}%")
    print(f"Improvement: {improvement:+.1f} pp")

    return 0


if __name__ == "__main__":
    sys.exit(main())
