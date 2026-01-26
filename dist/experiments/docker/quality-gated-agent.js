/**
 * Quality-Gated LLM Agent with Docker Evaluation
 * ===============================================
 * An experiment agent that uses quality-gated reasoning:
 * 1. Extracts structured reasoning from LLM
 * 2. Evaluates reasoning quality using Bayesian dimensions
 * 3. Only generates patches if reasoning passes quality gate
 * 4. Provides feedback for iterative refinement
 * 5. Evaluates final patches using Docker-based SWE-bench harness
 */
import { extractReasoning, reasoningToPatch } from '../llm-executor.js';
import { evaluatePatch } from './evaluator.js';
import { evaluatePatchQuality, evaluateQualityGate, generateQualityFeedback, DEFAULT_QUALITY_GATE } from '../swebench/quality-gate.js';
import { extractCodeFromDocker } from './code-extractor.js';
// =============================================================================
// Agent Implementation
// =============================================================================
/**
 * Create a quality-gated LLM agent that evaluates reasoning before execution.
 */
export function createQualityGatedAgent(task, config) {
    const targetScore = config.targetScore ?? 100;
    const verbose = config.verbose ?? false;
    const maxReasoningIterations = config.maxReasoningIterations ?? 3;
    const qualityGateConfig = config.qualityGate ?? DEFAULT_QUALITY_GATE;
    const extractCode = config.extractCode !== false; // Default to true
    // Track state
    let currentScore = 0;
    let lastEvaluation = null;
    let iterationCount = 0;
    let reasoningAttempts = [];
    // Log helper
    const log = (msg) => {
        if (verbose) {
            console.error(`[QualityGatedAgent] ${msg}`);
        }
    };
    return {
        async initialize(experimentTask, experimentConfig) {
            currentScore = 0;
            lastEvaluation = null;
            iterationCount = 0;
            reasoningAttempts = [];
            log(`Initialized for task ${experimentTask.id}`);
            log(`  Quality gate threshold: ${qualityGateConfig.minOverallQuality}`);
            log(`  Max reasoning iterations: ${maxReasoningIterations}`);
            log(`  Target score: ${targetScore}`);
        },
        async getSuggestion(experimentConfig) {
            // For quality-gated mode, suggestions could be based on which
            // reasoning dimensions scored lowest
            if (reasoningAttempts.length > 0) {
                const lastAttempt = reasoningAttempts[reasoningAttempts.length - 1];
                const quality = lastAttempt.quality;
                // Find weakest dimension
                const dimensions = [
                    { name: 'priorClarity', score: quality.priorClarity },
                    { name: 'hypothesisCoherence', score: quality.hypothesisCoherence },
                    { name: 'evidenceAlignment', score: quality.evidenceAlignment },
                    { name: 'solutionConsistency', score: quality.solutionConsistency },
                    { name: 'outcomeObservability', score: quality.outcomeObservability },
                ];
                const weakest = dimensions.reduce((min, d) => d.score < min.score ? d : min);
                return {
                    type: 'dimension',
                    id: weakest.name,
                    expectedDeltaQ: (100 - weakest.score) * 0.2, // Rough estimate
                };
            }
            return null;
        },
        async executeIteration(iteration, suggestion, experimentConfig) {
            iterationCount = iteration;
            log(`Iteration ${iteration}`);
            // ===================================================================
            // PHASE 1: Reasoning Extraction & Quality Gate
            // ===================================================================
            let reasoning = null;
            let quality = null;
            let gateResult = null;
            // Extract code from Docker if enabled
            let codeExtraction = null;
            if (extractCode) {
                try {
                    log(`  Extracting code from Docker...`);
                    codeExtraction = await extractCodeFromDocker(task, {
                        verbose,
                        maxFiles: 10,
                        registry: config.docker?.registry,
                        arch: config.docker?.arch,
                    });
                    log(`    Extracted ${codeExtraction.filesExtracted} files`);
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    log(`  Code extraction failed: ${errorMsg}`);
                    // Continue without code context
                }
            }
            // Try up to maxReasoningIterations to pass the quality gate
            for (let reasoningIter = 1; reasoningIter <= maxReasoningIterations; reasoningIter++) {
                log(`  Reasoning iteration ${reasoningIter}/${maxReasoningIterations}`);
                // Extract reasoning from LLM (with code context if available)
                const llmConfig = codeExtraction ? {
                    ...config.llm,
                    projectRoot: codeExtraction.projectRoot,
                    codeRetrieval: {
                        maxFiles: 10,
                        maxLinesPerFile: 500,
                        includeTree: true,
                    },
                } : config.llm;
                const { reasoning: extractedReasoning, error: extractError } = await extractReasoning(task, llmConfig);
                if (!extractedReasoning) {
                    log(`  Failed to extract reasoning: ${extractError}`);
                    if (reasoningIter === maxReasoningIterations) {
                        // Cleanup code extraction
                        if (codeExtraction) {
                            codeExtraction.cleanup();
                        }
                        return {
                            success: false,
                            actualDeltaQ: 0,
                            targetMatched: false,
                            error: `Failed to extract reasoning after ${maxReasoningIterations} attempts: ${extractError}`,
                        };
                    }
                    continue; // Try again
                }
                reasoning = extractedReasoning;
                // Evaluate reasoning quality
                quality = evaluatePatchQuality(reasoning);
                gateResult = evaluateQualityGate(reasoning, qualityGateConfig);
                log(`  Quality: ${quality.overallQuality.toFixed(1)} (threshold: ${qualityGateConfig.minOverallQuality})`);
                log(`    priorClarity: ${quality.priorClarity.toFixed(1)}`);
                log(`    hypothesisCoherence: ${quality.hypothesisCoherence.toFixed(1)}`);
                log(`    evidenceAlignment: ${quality.evidenceAlignment.toFixed(1)}`);
                log(`    solutionConsistency: ${quality.solutionConsistency.toFixed(1)}`);
                log(`    outcomeObservability: ${quality.outcomeObservability.toFixed(1)}`);
                // Store attempt
                const attempt = {
                    reasoning,
                    quality,
                    passed: gateResult.passes,
                    feedback: gateResult.passes ? undefined : generateQualityFeedback(gateResult),
                };
                reasoningAttempts.push(attempt);
                if (gateResult.passes) {
                    log(`  ✓ Quality gate PASSED on attempt ${reasoningIter}`);
                    break;
                }
                else {
                    log(`  ✗ Quality gate FAILED on attempt ${reasoningIter}`);
                    log(`  Feedback: ${attempt.feedback?.slice(0, 200)}...`);
                    if (reasoningIter === maxReasoningIterations) {
                        log(`  Maximum reasoning iterations reached without passing gate`);
                        return {
                            success: false,
                            actualDeltaQ: 0,
                            targetMatched: false,
                            error: `Reasoning quality insufficient after ${maxReasoningIterations} attempts`,
                        };
                    }
                    // TODO: Incorporate feedback into next reasoning attempt
                    // For now, we just retry - in the future, we'd pass feedback to the LLM
                }
            }
            if (!reasoning || !quality || !gateResult?.passes) {
                return {
                    success: false,
                    actualDeltaQ: 0,
                    targetMatched: false,
                    error: 'Failed to generate acceptable reasoning',
                };
            }
            // ===================================================================
            // PHASE 2: Patch Generation from Validated Reasoning
            // ===================================================================
            try {
                log(`  Generating patch from validated reasoning...`);
                const { patch: patchContent, error: patchError } = await reasoningToPatch(task, reasoning, config.llm);
                if (!patchContent) {
                    log(`  Failed to generate patch: ${patchError}`);
                    return {
                        success: false,
                        actualDeltaQ: 0,
                        targetMatched: false,
                        error: `Failed to generate patch: ${patchError}`,
                    };
                }
                log(`  Generated patch (${patchContent.split('\n').length} lines)`);
                // ===================================================================
                // PHASE 3: Docker Evaluation
                // ===================================================================
                log(`  Evaluating patch in Docker...`);
                const evalResult = await evaluatePatch({
                    instanceId: task.instanceId,
                    patch: patchContent,
                    failToPass: task.testSpec.failToPass,
                    passToPass: task.testSpec.passToPass,
                }, config.docker);
                lastEvaluation = evalResult;
                log(`  Evaluation: resolved=${evalResult.resolved}, testsFixed=${evalResult.testsFixed}/${evalResult.totalTestsToFix}`);
                // Calculate new score
                const previousScore = currentScore;
                if (evalResult.totalTestsToFix > 0) {
                    currentScore = (evalResult.testsFixed / evalResult.totalTestsToFix) * 100;
                }
                else {
                    currentScore = evalResult.resolved ? 100 : 0;
                }
                const deltaQ = currentScore - previousScore;
                return {
                    success: deltaQ > 0,
                    actualDeltaQ: deltaQ,
                    targetMatched: suggestion !== null,
                };
            }
            finally {
                // Cleanup code extraction
                if (codeExtraction) {
                    codeExtraction.cleanup();
                }
            }
        },
        async evaluate(experimentConfig) {
            // Add quality metrics to the evaluation result
            const lastAttempt = reasoningAttempts[reasoningAttempts.length - 1];
            return {
                metrics: {
                    quality: currentScore,
                    testsFixed: lastEvaluation?.testsFixed ?? 0,
                    totalTests: lastEvaluation?.totalTestsToFix ?? 0,
                    // Include reasoning quality if available
                    ...(lastAttempt ? {
                        qualityScore: lastAttempt.quality.overallQuality,
                        priorClarity: lastAttempt.quality.priorClarity,
                        hypothesisCoherence: lastAttempt.quality.hypothesisCoherence,
                        evidenceAlignment: lastAttempt.quality.evidenceAlignment,
                        solutionConsistency: lastAttempt.quality.solutionConsistency,
                        outcomeObservability: lastAttempt.quality.outcomeObservability,
                    } : {}),
                },
                qualityScore: currentScore,
                passed: currentScore >= targetScore,
            };
        },
        async cleanup() {
            log(`Cleanup: completed ${iterationCount} iterations`);
            log(`  Total reasoning attempts: ${reasoningAttempts.length}`);
            log(`  Final score: ${currentScore.toFixed(1)}`);
        },
    };
}
//# sourceMappingURL=quality-gated-agent.js.map