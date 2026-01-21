/**
 * Experiment Visualization
 * ========================
 * ASCII-based visualization for experiment trajectories and results.
 */

import type {
  ExperimentRun,
  ExperimentBatch,
  HypothesisResult,
  IterationRecord,
} from './types.js';
import { describe } from './stats.js';

// =============================================================================
// Sparkline Charts
// =============================================================================

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Generate ASCII sparkline from an array of values.
 */
export function sparkline(values: number[], options: { width?: number } = {}): string {
  if (values.length === 0) return '(no data)';

  const width = options.width ?? values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Resample if needed
  let data = values;
  if (values.length > width) {
    data = resample(values, width);
  }

  return data
    .map((v) => {
      const normalized = (v - min) / range;
      const index = Math.min(Math.floor(normalized * SPARK_CHARS.length), SPARK_CHARS.length - 1);
      return SPARK_CHARS[index];
    })
    .join('');
}

/**
 * Resample array to a new length using linear interpolation.
 */
function resample(values: number[], newLength: number): number[] {
  const result: number[] = [];
  const ratio = (values.length - 1) / (newLength - 1);

  for (let i = 0; i < newLength; i++) {
    const idx = i * ratio;
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    const weight = idx - low;

    if (high >= values.length) {
      result.push(values[values.length - 1]);
    } else {
      result.push(values[low] * (1 - weight) + values[high] * weight);
    }
  }

  return result;
}

// =============================================================================
// Run Visualization
// =============================================================================

/**
 * Generate a summary visualization for a single run.
 */
export function visualizeRun(run: ExperimentRun): string {
  const lines: string[] = [];

  lines.push(`Run: ${run.runId.slice(0, 8)}...`);
  lines.push(`Task: ${run.taskId}`);
  lines.push(`Condition: ${run.condition.name}`);
  lines.push('');

  // Quality score trajectory
  const scores = run.iterations.map((i) => i.qualityScore);
  lines.push(`Quality: ${sparkline(scores, { width: 40 })}`);
  lines.push(`         ${scores[0].toFixed(1)} → ${scores[scores.length - 1].toFixed(1)}`);
  lines.push('');

  // Pass/fail markers
  const passMarkers = run.iterations.map((i) => (i.passed ? '✓' : '·')).join('');
  lines.push(`Status:  ${passMarkers.slice(0, 40)}`);
  lines.push('');

  // Outcome
  const outcomeIcon = run.outcome.passed ? '✓' : '✗';
  lines.push(`Outcome: ${outcomeIcon} ${run.outcome.stopReason}`);
  if (run.outcome.iterationsToPass) {
    lines.push(`Passed at iteration: ${run.outcome.iterationsToPass}`);
  }
  lines.push(`Iterations: ${run.iterations.length}`);
  lines.push(`Monotonic rate: ${(run.outcome.monotonicRate * 100).toFixed(1)}%`);
  lines.push(`Wasted iterations: ${run.outcome.wastedIterations}`);

  return lines.join('\n');
}

/**
 * Generate a comparison view for two runs (e.g., baseline vs treatment).
 */
export function compareRuns(baseline: ExperimentRun, treatment: ExperimentRun): string {
  const lines: string[] = [];

  lines.push('┌─────────────────────────────────────────────────────┐');
  lines.push('│              Run Comparison                          │');
  lines.push('├─────────────────────────────────────────────────────┤');

  const baseScores = baseline.iterations.map((i) => i.qualityScore);
  const treatScores = treatment.iterations.map((i) => i.qualityScore);

  lines.push(`│ Baseline  (${baseline.condition.name.padEnd(15)}): ${sparkline(baseScores, { width: 20 })} │`);
  lines.push(`│ Treatment (${treatment.condition.name.padEnd(15)}): ${sparkline(treatScores, { width: 20 })} │`);
  lines.push('├─────────────────────────────────────────────────────┤');

  const baseIter = baseline.outcome.iterationsToPass ?? baseline.iterations.length;
  const treatIter = treatment.outcome.iterationsToPass ?? treatment.iterations.length;
  const iterDiff = treatIter - baseIter;
  const iterSign = iterDiff < 0 ? '' : '+';

  lines.push(`│ Iterations:  ${baseIter.toString().padStart(3)} vs ${treatIter.toString().padStart(3)} (${iterSign}${iterDiff})`.padEnd(52) + '│');
  lines.push(`│ Passed:      ${(baseline.outcome.passed ? '✓' : '✗').padStart(3)} vs ${(treatment.outcome.passed ? '✓' : '✗').padStart(3)}`.padEnd(52) + '│');
  lines.push(`│ Monotonic:   ${(baseline.outcome.monotonicRate * 100).toFixed(0).padStart(2)}% vs ${(treatment.outcome.monotonicRate * 100).toFixed(0).padStart(2)}%`.padEnd(52) + '│');
  lines.push('└─────────────────────────────────────────────────────┘');

  return lines.join('\n');
}

// =============================================================================
// Batch Visualization
// =============================================================================

/**
 * Generate a summary visualization for a batch.
 */
export function visualizeBatch(batch: ExperimentBatch): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════╗');
  lines.push(`║  Experiment Batch: ${batch.batchId.slice(0, 8)}...`.padEnd(55) + '║');
  lines.push(`║  Design: ${batch.design}  |  Runs: ${batch.runs.length}`.padEnd(55) + '║');
  lines.push('╠════════════════════════════════════════════════════════╣');

  // Group by condition
  const byCondition = new Map<string, ExperimentRun[]>();
  for (const run of batch.runs) {
    const key = run.condition.name;
    const existing = byCondition.get(key) ?? [];
    existing.push(run);
    byCondition.set(key, existing);
  }

  for (const [condition, runs] of byCondition) {
    const passRate = runs.filter((r) => r.outcome.passed).length / runs.length;
    const iterToPass = runs
      .filter((r) => r.outcome.iterationsToPass !== undefined)
      .map((r) => r.outcome.iterationsToPass!);
    const avgIter = iterToPass.length > 0
      ? iterToPass.reduce((a, b) => a + b, 0) / iterToPass.length
      : NaN;

    lines.push(`║  ${condition}`.padEnd(55) + '║');
    lines.push(`║    Pass rate: ${(passRate * 100).toFixed(0)}%  |  Avg iterations: ${avgIter.toFixed(1)}`.padEnd(55) + '║');

    // Mini distribution of iterations
    if (iterToPass.length > 0) {
      const dist = sparkline(iterToPass.sort((a, b) => a - b), { width: 30 });
      lines.push(`║    Distribution: ${dist}`.padEnd(55) + '║');
    }

    lines.push('║'.padEnd(55) + '║');
  }

  lines.push('╚════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

// =============================================================================
// Hypothesis Result Visualization
// =============================================================================

/**
 * Generate a visual summary of hypothesis results.
 */
export function visualizeResults(results: HypothesisResult[]): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║                    Hypothesis Results                         ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');

  for (const result of results) {
    const icon = result.supported ? '✓' : '✗';
    const color = result.supported ? 'SUPPORTED' : 'NOT SUPPORTED';

    lines.push(`║  ${result.hypothesis}: ${icon} ${color}`.padEnd(63) + '║');

    // Effect size bar
    const effectSize = result.test.effectSize;
    const effectBar = effectSizeBar(effectSize);
    lines.push(`║    Effect: ${effectBar}  d=${effectSize.toFixed(2)}`.padEnd(63) + '║');

    // P-value indicator
    const pStars = pValueStars(result.test.pValue);
    lines.push(`║    p-value: ${result.test.pValue.toFixed(4)} ${pStars}`.padEnd(63) + '║');

    lines.push('║'.padEnd(63) + '║');
  }

  // Summary
  const supported = results.filter((r) => r.supported).length;
  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push(`║  Summary: ${supported}/${results.length} hypotheses supported`.padEnd(63) + '║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * Generate an effect size bar visualization.
 */
function effectSizeBar(d: number): string {
  const absD = Math.abs(d);
  const width = 20;
  const center = width / 2;

  // Map d to bar position (capped at |d| = 2)
  const offset = Math.min(absD, 2) / 2 * center;
  const position = d < 0 ? center - offset : center + offset;

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i === center) {
      bar += '│';
    } else if ((d < 0 && i >= position && i < center) || (d >= 0 && i > center && i <= position)) {
      bar += '█';
    } else {
      bar += '·';
    }
  }

  return `[${bar}]`;
}

/**
 * Generate significance stars for p-value.
 */
function pValueStars(p: number): string {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

// =============================================================================
// Box Plot (ASCII)
// =============================================================================

/**
 * Generate ASCII box plot for a distribution.
 */
export function boxPlot(values: number[], options: { width?: number; label?: string } = {}): string {
  const width = options.width ?? 50;
  const label = options.label ?? '';

  if (values.length === 0) {
    return `${label.padEnd(12)} (no data)`;
  }

  const stats = describe(values);
  const min = stats.min;
  const max = stats.max;
  const range = max - min || 1;

  // Map to positions
  const mapPos = (v: number) => Math.round(((v - min) / range) * (width - 1));

  const minPos = mapPos(min);
  const q1Pos = mapPos(stats.q25);
  const medPos = mapPos(stats.median);
  const q3Pos = mapPos(stats.q75);
  const maxPos = mapPos(max);

  // Build the plot
  let plot = '';
  for (let i = 0; i < width; i++) {
    if (i === minPos || i === maxPos) {
      plot += '|';
    } else if (i > minPos && i < q1Pos) {
      plot += '─';
    } else if (i >= q1Pos && i <= q3Pos) {
      if (i === medPos) {
        plot += '│';
      } else {
        plot += '█';
      }
    } else if (i > q3Pos && i < maxPos) {
      plot += '─';
    } else {
      plot += ' ';
    }
  }

  return `${label.padEnd(12)} ${plot}`;
}

/**
 * Generate multiple box plots for comparison.
 */
export function comparativeBoxPlots(
  data: Array<{ label: string; values: number[] }>
): string {
  const lines: string[] = [];

  // Find global min/max
  const allValues = data.flatMap((d) => d.values);
  const globalMin = Math.min(...allValues);
  const globalMax = Math.max(...allValues);

  lines.push(`Min: ${globalMin.toFixed(2)}`.padStart(62) + ` Max: ${globalMax.toFixed(2)}`);
  lines.push('');

  for (const { label, values } of data) {
    lines.push(boxPlot(values, { label, width: 50 }));
  }

  return lines.join('\n');
}

// =============================================================================
// Iteration Timeline
// =============================================================================

/**
 * Generate a timeline visualization for iterations.
 */
export function iterationTimeline(iterations: IterationRecord[]): string {
  const lines: string[] = [];

  lines.push('Iteration Timeline');
  lines.push('──────────────────');

  for (const iter of iterations.slice(0, 20)) {
    const passIcon = iter.passed ? '✓' : '·';
    const delta = iter.delta ?? 0;
    const deltaStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    const deltaBar = delta > 0 ? '▲' : delta < 0 ? '▼' : '─';

    let targetInfo = '';
    if (iter.target) {
      targetInfo = ` → ${iter.target.type}:${iter.target.id.slice(0, 15)}`;
    }

    lines.push(
      `${iter.iteration.toString().padStart(3)}. ${passIcon} Q=${iter.qualityScore.toFixed(2).padStart(6)} ${deltaBar}${deltaStr.padStart(6)}${targetInfo}`
    );
  }

  if (iterations.length > 20) {
    lines.push(`... and ${iterations.length - 20} more iterations`);
  }

  return lines.join('\n');
}

// =============================================================================
// Export Summary Table
// =============================================================================

/**
 * Generate a markdown table summarizing all results.
 */
export function resultsTable(results: HypothesisResult[]): string {
  const lines: string[] = [];

  lines.push('| Hypothesis | Result | Effect Size | p-value | 95% CI |');
  lines.push('|------------|--------|-------------|---------|--------|');

  for (const result of results) {
    const status = result.supported ? '✓ Supported' : '✗ Not Supported';
    const effect = result.test.effectSize.toFixed(3);
    const pValue = result.test.pValue < 0.001 ? '<0.001' : result.test.pValue.toFixed(3);
    const ci = `[${result.test.ci95[0].toFixed(2)}, ${result.test.ci95[1].toFixed(2)}]`;

    lines.push(`| ${result.hypothesis} | ${status} | ${effect} | ${pValue} | ${ci} |`);
  }

  return lines.join('\n');
}
