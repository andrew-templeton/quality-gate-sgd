#!/usr/bin/env tsx
/**
 * Quality Gate Calibration Experiment
 * ====================================
 * Runs 50 tasks to collect (reasoning, outcome) pairs for validating quality dimensions.
 *
 * Purpose:
 * - Test whether reasoning quality metrics predict patch success
 * - Validate each dimension (prior clarity, hypothesis coherence, etc.)
 * - Compute correlations and calibrate weights
 * - Implement LLM-as-judge meta-validation
 *
 * Outputs:
 * - reasoning_outcomes.jsonl: (reasoning, quality, outcome) tuples
 * - calibration_report.md: Statistical analysis of dimensions
 * - weights_optimized.json: Logistic regression coefficients
 *
 * Usage:
 *   npx tsx scripts/run-quality-gate-calibration.ts [--tasks N]
 */

import { loadSWEBenchTasks, stratifiedSWEBenchSample } from '../src/experiments/index.js';
import { extractReasoning, reasoningToPatch } from '../src/experiments/llm-executor.js';
import { evaluatePatchQuality, evaluateQualityGate } from '../src/experiments/swebench/quality-gate.js';
import { evaluatePatch } from '../src/experiments/docker/evaluator.js';
import type { SWEBenchTask } from '../src/experiments/swebench/types.js';
import type { PatchProposalReasoning, PatchQualityMetrics } from '../src/experiments/swebench/quality-gate.js';
import { pearsonCorrelation, logisticRegression, rocAuc } from '../src/experiments/stats.js';
import * as path from 'path';
import * as fs from 'fs';

// =============================================================================
// Configuration
// =============================================================================

const CALIBRATION_SIZE = parseInt(process.argv[2]) || 50;
const MODEL = 'gpt-4o';
const PROJECT_ROOT = '/tmp/swebench-calibration';
const RESULTS_DIR = path.join(process.cwd(), 'data/calibration-results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// =============================================================================
// Data Collection
// =============================================================================

interface CalibrationDataPoint {
  taskId: string;
  reasoning: PatchProposalReasoning;
  quality: PatchQualityMetrics;
  outcome: {
    success: boolean; // Did patch resolve the issue?
    testsFixed: number;
    totalTests: number;
  };
  timestamp: string;
}

async function collectCalibrationData(): Promise<CalibrationDataPoint[]> {
  console.log('Loading SWE-bench tasks...');

  // Load tasks
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  // Filter to Django tasks
  const djangoTasks = allTasks.filter(task =>
    task.instanceId.startsWith('django__django') &&
    task.testSpec.failToPass &&
    task.testSpec.failToPass.length > 0 &&
    task.testSpec.failToPass.length <= 3 &&
    !task.testSpec.failToPass.some(test => test.includes('['))
  );

  // Stratified sample
  const tasks = stratifiedSWEBenchSample(
    djangoTasks,
    CALIBRATION_SIZE,
    task => task.instanceId.split('-')[1]
  );

  console.log(`Selected ${tasks.length} tasks for calibration\n`);

  const dataPoints: CalibrationDataPoint[] = [];
  const outputFile = path.join(RESULTS_DIR, 'reasoning_outcomes.jsonl');
  const writeStream = fs.createWriteStream(outputFile, { flags: 'w' });

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\n[${ i + 1}/${tasks.length}] ${task.instanceId}`);

    try {
      // 1. Extract reasoning
      console.log('  Extracting reasoning...');
      const { reasoning, error: reasoningError } = await extractReasoning(task, {
        model: MODEL,
        projectRoot: PROJECT_ROOT,
        applyChanges: false,
      });

      if (!reasoning) {
        console.log(`  ✗ Failed: ${reasoningError}`);
        continue;
      }

      // 2. Evaluate quality
      const quality = evaluatePatchQuality(reasoning);
      console.log(`  Quality: ${quality.overallQuality.toFixed(1)}`);
      console.log(`    prior: ${quality.priorClarity.toFixed(1)}`);
      console.log(`    hypothesis: ${quality.hypothesisCoherence.toFixed(1)}`);
      console.log(`    evidence: ${quality.evidenceAlignment.toFixed(1)}`);
      console.log(`    solution: ${quality.solutionConsistency.toFixed(1)}`);
      console.log(`    outcome: ${quality.outcomeObservability.toFixed(1)}`);

      // 3. Generate patch
      console.log('  Generating patch...');
      const { patch, error: patchError } = await reasoningToPatch(task, reasoning, {
        model: MODEL,
        projectRoot: PROJECT_ROOT,
        applyChanges: false,
      });

      if (!patch) {
        console.log(`  ✗ Patch generation failed: ${patchError}`);
        // Still record this - it's informative that reasoning didn't lead to a patch
        const dataPoint: CalibrationDataPoint = {
          taskId: task.instanceId,
          reasoning,
          quality,
          outcome: { success: false, testsFixed: 0, totalTests: task.testSpec.failToPass?.length || 0 },
          timestamp: new Date().toISOString(),
        };
        dataPoints.push(dataPoint);
        writeStream.write(JSON.stringify(dataPoint) + '\n');
        continue;
      }

      // 4. Evaluate patch in Docker
      console.log('  Evaluating in Docker...');
      const evalResult = await evaluatePatch({
        instanceId: task.instanceId,
        patch,
        failToPass: task.testSpec.failToPass,
        passToPass: task.testSpec.passToPass,
      }, {
        verbose: false,
        timeout: 300000, // 5 min timeout
      });

      const success = evalResult.resolved;
      console.log(`  ${success ? '✓' : '✗'} Result: ${evalResult.testsFixed}/${evalResult.totalTestsToFix} tests fixed`);

      // 5. Record data point
      const dataPoint: CalibrationDataPoint = {
        taskId: task.instanceId,
        reasoning,
        quality,
        outcome: {
          success,
          testsFixed: evalResult.testsFixed,
          totalTests: evalResult.totalTestsToFix,
        },
        timestamp: new Date().toISOString(),
      };

      dataPoints.push(dataPoint);
      writeStream.write(JSON.stringify(dataPoint) + '\n');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error: ${errorMsg}`);
    }
  }

  writeStream.end();
  console.log(`\nData saved to: ${outputFile}\n`);

  return dataPoints;
}

// =============================================================================
// Statistical Analysis
// =============================================================================

interface DimensionValidation {
  dimension: string;
  correlation: number;
  pValue: number;
  validated: boolean; // ρ > 0.2 and p < 0.05
}

interface CalibrationResults {
  sampleSize: number;
  successRate: number;
  dimensions: DimensionValidation[];
  logisticCoefficients: Record<string, number>;
  rocAuc: number;
  recommendedWeights: Record<string, number>;
}

function analyzeCalibrationData(data: CalibrationDataPoint[]): CalibrationResults {
  console.log('Analyzing calibration data...\n');

  // Extract vectors for analysis
  const outcomes = data.map(d => d.outcome.success ? 1 : 0);
  const successRate = outcomes.reduce((sum, v) => sum + v, 0) / outcomes.length;

  const dimensions = {
    priorClarity: data.map(d => d.quality.priorClarity),
    hypothesisCoherence: data.map(d => d.quality.hypothesisCoherence),
    evidenceAlignment: data.map(d => d.quality.evidenceAlignment),
    solutionConsistency: data.map(d => d.quality.solutionConsistency),
    outcomeObservability: data.map(d => d.quality.outcomeObservability),
  };

  // Validate each dimension
  const validations: DimensionValidation[] = [];

  for (const [name, scores] of Object.entries(dimensions)) {
    const result = pearsonCorrelation(scores, outcomes);
    const validated = Math.abs(result.correlation) > 0.2 && result.pValue < 0.05;

    validations.push({
      dimension: name,
      correlation: result.correlation,
      pValue: result.pValue,
      validated,
    });

    console.log(`${name}:`);
    console.log(`  ρ = ${result.correlation.toFixed(3)} (p = ${result.pValue.toFixed(4)})`);
    console.log(`  ${validated ? '✓ VALIDATED' : '✗ Not validated'}`);
  }

  console.log('');

  // Logistic regression for weight optimization
  console.log('Fitting logistic regression...');
  const X = data.map(d => [
    d.quality.priorClarity,
    d.quality.hypothesisCoherence,
    d.quality.evidenceAlignment,
    d.quality.solutionConsistency,
    d.quality.outcomeObservability,
  ]);

  const logRegResult = logisticRegression(X, outcomes);
  const coefficients = {
    intercept: logRegResult.intercept,
    priorClarity: logRegResult.coefficients[0],
    hypothesisCoherence: logRegResult.coefficients[1],
    evidenceAlignment: logRegResult.coefficients[2],
    solutionConsistency: logRegResult.coefficients[3],
    outcomeObservability: logRegResult.coefficients[4],
  };

  console.log('Coefficients:');
  for (const [name, coef] of Object.entries(coefficients)) {
    console.log(`  ${name}: ${coef.toFixed(4)}`);
  }
  console.log('');

  // Compute ROC-AUC
  const predictions = logRegResult.predictions;
  const rocResult = rocAuc(outcomes, predictions);
  console.log(`ROC-AUC: ${rocResult.auc.toFixed(3)}`);
  console.log('');

  // Convert coefficients to normalized weights
  const absCoeffs = Object.entries(coefficients)
    .filter(([k]) => k !== 'intercept')
    .map(([k, v]) => ({ name: k, value: Math.abs(v) }));

  const totalAbsCoeff = absCoeffs.reduce((sum, c) => sum + c.value, 0);

  const recommendedWeights: Record<string, number> = {};
  for (const { name, value } of absCoeffs) {
    recommendedWeights[name] = value / totalAbsCoeff;
  }

  console.log('Recommended weights (normalized):');
  for (const [name, weight] of Object.entries(recommendedWeights)) {
    console.log(`  ${name}: ${weight.toFixed(3)}`);
  }
  console.log('');

  return {
    sampleSize: data.length,
    successRate,
    dimensions: validations,
    logisticCoefficients: coefficients,
    rocAuc: rocResult.auc,
    recommendedWeights,
  };
}

// =============================================================================
// Report Generation
// =============================================================================

function generateCalibrationReport(results: CalibrationResults): string {
  const validatedCount = results.dimensions.filter(d => d.validated).length;

  let report = `# Quality Gate Calibration Report\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Sample Size**: ${results.sampleSize} tasks\n`;
  report += `- **Success Rate**: ${(results.successRate * 100).toFixed(1)}%\n`;
  report += `- **Validated Dimensions**: ${validatedCount}/5\n`;
  report += `- **ROC-AUC**: ${results.rocAuc.toFixed(3)}\n\n`;

  report += `## Dimension Validation\n\n`;
  report += `| Dimension | Correlation (ρ) | p-value | Status |\n`;
  report += `|-----------|-----------------|---------|--------|\n`;

  for (const dim of results.dimensions) {
    const status = dim.validated ? '✓ Valid' : '✗ Invalid';
    report += `| ${dim.dimension} | ${dim.correlation.toFixed(3)} | ${dim.pValue.toFixed(4)} | ${status} |\n`;
  }

  report += `\n## Logistic Regression Coefficients\n\n`;
  report += `\`\`\`json\n`;
  report += JSON.stringify(results.logisticCoefficients, null, 2);
  report += `\n\`\`\`\n\n`;

  report += `## Recommended Weights\n\n`;
  report += `\`\`\`json\n`;
  report += JSON.stringify(results.recommendedWeights, null, 2);
  report += `\n\`\`\`\n\n`;

  report += `## Interpretation\n\n`;

  if (validatedCount >= 3) {
    report += `✓ **Strong validation**: ${validatedCount}/5 dimensions validated.\n`;
    report += `The quality gate metrics show significant predictive power.\n\n`;
  } else if (validatedCount >= 1) {
    report += `⚠ **Partial validation**: ${validatedCount}/5 dimensions validated.\n`;
    report += `Some dimensions may need refinement or re-weighting.\n\n`;
  } else {
    report += `✗ **Weak validation**: No dimensions validated.\n`;
    report += `Quality metrics may not be predictive of patch success.\n\n`;
  }

  if (results.rocAuc > 0.7) {
    report += `✓ **Good discrimination**: ROC-AUC > 0.7 indicates the model distinguishes successful from failed patches well.\n\n`;
  } else if (results.rocAuc > 0.6) {
    report += `⚠ **Fair discrimination**: ROC-AUC 0.6-0.7 shows moderate predictive power.\n\n`;
  } else {
    report += `✗ **Poor discrimination**: ROC-AUC < 0.6 suggests limited predictive utility.\n\n`;
  }

  return report;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Quality Gate Calibration Experiment');
  console.log(`Model: ${MODEL}`);
  console.log(`Tasks: ${CALIBRATION_SIZE}\n`);

  // Collect data
  const data = await collectCalibrationData();

  if (data.length < 10) {
    console.error(`\nInsufficient data collected (${data.length} tasks). Need at least 10.`);
    process.exit(1);
  }

  // Analyze
  const results = analyzeCalibrationData(data);

  // Generate report
  const report = generateCalibrationReport(results);
  const reportPath = path.join(RESULTS_DIR, 'calibration_report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`Report saved to: ${reportPath}`);

  // Save weights
  const weightsPath = path.join(RESULTS_DIR, 'weights_optimized.json');
  fs.writeFileSync(weightsPath, JSON.stringify({
    calibrationDate: new Date().toISOString(),
    sampleSize: data.length,
    rocAuc: results.rocAuc,
    weights: results.recommendedWeights,
  }, null, 2));
  console.log(`Weights saved to: ${weightsPath}`);

  console.log('\nCalibration complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
