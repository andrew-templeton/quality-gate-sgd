/**
 * Trajectory Logging for MCP Server
 * ==================================
 * Provides logging infrastructure for capturing agent interactions
 * with the quality gate MCP server.
 *
 * This enables detailed analysis of how agents use gate feedback.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
/**
 * Create a trajectory logger that writes to a JSONL file.
 * Uses synchronous file operations for simplicity and test reliability.
 */
export function createTrajectoryLogger(outputPath) {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Create/touch file if it doesn't exist
    if (!fs.existsSync(outputPath)) {
        fs.writeFileSync(outputPath, '');
    }
    const events = [];
    let eventCounter = 0;
    let closed = false;
    /**
     * Generate event ID.
     */
    function generateEventId() {
        return `evt-${Date.now()}-${++eventCounter}`;
    }
    /**
     * Write an event to the log.
     */
    function writeEvent(event) {
        events.push(event);
        if (!closed) {
            fs.appendFileSync(outputPath, JSON.stringify(event) + '\n');
        }
    }
    return {
        logGateQuery(data) {
            writeEvent({
                eventId: generateEventId(),
                timestamp: Date.now(),
                type: 'gate_query',
                data,
            });
        },
        logSuggestion(data) {
            writeEvent({
                eventId: generateEventId(),
                timestamp: Date.now(),
                type: 'suggestion_received',
                data,
            });
        },
        log(type, data) {
            writeEvent({
                eventId: generateEventId(),
                timestamp: Date.now(),
                type,
                data,
            });
        },
        getEvents() {
            return [...events];
        },
        flush() {
            // No-op with sync writes
        },
        close() {
            closed = true;
        },
    };
}
/**
 * Create a no-op logger for when trajectory capture is disabled.
 */
export function createNullLogger() {
    return {
        logGateQuery() { },
        logSuggestion() { },
        log() { },
        getEvents() {
            return [];
        },
        flush() { },
        close() { },
    };
}
/**
 * Middleware wrapper for MCP tool handlers to capture calls.
 */
export function withTrajectoryLogging(logger, toolName, handler) {
    return async (params) => {
        const startTime = Date.now();
        try {
            const result = await handler(params);
            // Log based on tool type
            if (toolName === 'check_gate' || toolName === 'evaluate') {
                const gateResult = result;
                logger.logGateQuery({
                    qualityScore: gateResult.qualityScore ?? 0,
                    passed: gateResult.passed ?? false,
                    metrics: gateResult.metrics ?? {},
                    condition: gateResult.condition ?? 'unknown',
                });
            }
            else if (toolName === 'get_suggestions' || toolName === 'suggest_fix') {
                const suggestions = result;
                logger.logSuggestion({
                    suggestions: Array.isArray(suggestions) ? suggestions : [],
                    gateEnabled: true,
                });
            }
            else {
                // Generic logging for other tools
                logger.log('gate_query', {
                    tool: toolName,
                    params,
                    result,
                    durationMs: Date.now() - startTime,
                });
            }
            return result;
        }
        catch (error) {
            logger.log('error', {
                tool: toolName,
                params,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime,
            });
            throw error;
        }
    };
}
/**
 * Analyze a trajectory and produce summary statistics.
 */
export function analyzeTrajectory(events) {
    const gateQueries = [];
    const suggestions = [];
    const errors = [];
    const qualityTrajectory = [];
    const passTrajectory = [];
    const queryTimestamps = [];
    const suggestionTypes = {};
    for (const event of events) {
        switch (event.type) {
            case 'gate_query':
                gateQueries.push(event);
                qualityTrajectory.push(event.data?.qualityScore ?? 0);
                passTrajectory.push(event.data?.passed ?? false);
                queryTimestamps.push(event.timestamp);
                break;
            case 'suggestion_received':
                suggestions.push(event);
                const eventSuggestions = event.data?.suggestions ?? [];
                for (const s of eventSuggestions) {
                    suggestionTypes[s.type] = (suggestionTypes[s.type] ?? 0) + 1;
                }
                break;
            case 'error':
                errors.push(event);
                break;
        }
    }
    // Compute query intervals
    const queryIntervals = [];
    for (let i = 1; i < queryTimestamps.length; i++) {
        queryIntervals.push(queryTimestamps[i] - queryTimestamps[i - 1]);
    }
    // Compute duration
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const durationMs = firstEvent && lastEvent
        ? lastEvent.timestamp - firstEvent.timestamp
        : 0;
    return {
        totalEvents: events.length,
        gateQueries: gateQueries.length,
        suggestionsReceived: suggestions.length,
        errors: errors.length,
        qualityTrajectory,
        passTrajectory,
        durationMs,
        queryIntervals,
        suggestionTypes,
    };
}
/**
 * Compute comparison metrics from trajectory summary.
 */
export function computeTrajectoryMetrics(summary) {
    const { qualityTrajectory, passTrajectory, queryIntervals, suggestionsReceived } = summary;
    // Iterations to pass
    const firstPassIndex = passTrajectory.findIndex(p => p);
    const iterationsToPass = firstPassIndex >= 0 ? firstPassIndex + 1 : Infinity;
    // Score metrics
    const finalScore = qualityTrajectory[qualityTrajectory.length - 1] ?? 0;
    const maxScore = Math.max(...qualityTrajectory, 0);
    // Improvement metrics
    let totalImprovement = 0;
    let monotonicCount = 0;
    for (let i = 1; i < qualityTrajectory.length; i++) {
        const delta = qualityTrajectory[i] - qualityTrajectory[i - 1];
        totalImprovement += delta;
        if (delta >= 0)
            monotonicCount++;
    }
    const avgImprovement = qualityTrajectory.length > 1
        ? totalImprovement / (qualityTrajectory.length - 1)
        : 0;
    const monotonicRate = qualityTrajectory.length > 1
        ? monotonicCount / (qualityTrajectory.length - 1)
        : 1;
    // Query interval
    const avgQueryInterval = queryIntervals.length > 0
        ? queryIntervals.reduce((a, b) => a + b, 0) / queryIntervals.length
        : 0;
    return {
        iterationsToPass,
        finalScore,
        maxScore,
        avgImprovement,
        monotonicRate,
        avgQueryInterval,
        totalSuggestions: suggestionsReceived,
    };
}
//# sourceMappingURL=trajectory.js.map