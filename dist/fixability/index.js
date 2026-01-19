/**
 * Fixability Estimation
 * =====================
 * LLM-based estimation of how many issues at a symbol can be fixed in one pass.
 *
 * This helps prioritize actionable suggestions by accounting for:
 * - Code complexity
 * - Issue interdependence
 * - Whether fixes are straightforward vs. require architectural changes
 */
import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
// GPT-5 models - use nano for cost efficiency on simple classification
const GPT5_MODELS = {
    FULL: 'gpt-5',
    MINI: 'gpt-5-mini',
    NANO: 'gpt-5-nano',
};
/**
 * Extract source code for a symbol from its file.
 */
function extractSymbolCode(symbol) {
    const { file, span } = symbol.symbol;
    if (!existsSync(file)) {
        return null;
    }
    try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        // Extract lines from span (1-indexed to 0-indexed)
        const startLine = Math.max(0, span.startLine - 1);
        const endLine = Math.min(lines.length, span.endLine);
        return lines.slice(startLine, endLine).join('\n');
    }
    catch {
        return null;
    }
}
/**
 * Build the prompt for fixability estimation.
 */
function buildPrompt(symbol, code) {
    const { issues, coverageGap, issueDensity } = symbol;
    const issueList = [];
    if (issues.coverage.length > 0) {
        const branches = issues.coverage.filter(i => i.code?.includes('branch')).length;
        const funcs = issues.coverage.filter(i => i.code?.includes('function')).length;
        if (branches > 0)
            issueList.push(`${branches} uncovered branches`);
        if (funcs > 0)
            issueList.push(`${funcs} uncovered functions`);
    }
    if (issues.typescript.length > 0) {
        const codes = [...new Set(issues.typescript.map(i => i.code))].slice(0, 5);
        issueList.push(`${issues.typescript.length} TypeScript errors (${codes.join(', ')})`);
    }
    if (issues.eslint.length > 0) {
        issueList.push(`${issues.eslint.length} ESLint issues`);
    }
    if (issues.sonarqube.length > 0) {
        issueList.push(`${issues.sonarqube.length} SonarQube issues`);
    }
    return `You must analyze this code and estimate what fraction of the quality issues can be fixed in a single focused edit session.

## CODE TO ANALYZE:
\`\`\`typescript
${code}
\`\`\`

## ISSUES FOUND:
${issueList.length > 0 ? issueList.map(i => `- ${i}`).join('\n') : '- No specific issues listed, but coverage gap indicates missing tests'}

## CURRENT METRICS:
- Coverage gap: ${(coverageGap * 100).toFixed(1)}% of branches are not covered by tests
- Issue density: ${issueDensity.toFixed(3)} issues per line of code

## YOUR TASK:
Estimate what percentage of these issues a developer could realistically fix in ONE focused editing session (about 30-60 minutes).

You MUST respond with a valid JSON object containing exactly these fields:
- "score": a number between 0 and 1 representing the fraction fixable (e.g., 0.8 means 80% of issues can be fixed in one pass)
- "effort": one of "trivial", "moderate", "significant", or "major"
- "reasoning": a brief explanation (max 100 characters)

Example response:
{"score": 0.75, "effort": "moderate", "reasoning": "Simple function, tests can be added without refactoring"}

Consider these factors:
1. Can tests be added without changing the code structure?
2. Are the uncovered branches simple conditionals or complex logic?
3. Would fixing require understanding complex business logic?
4. Is the code well-structured and testable as-is?`;
}
/**
 * Validate that the parsed response has the required fields.
 */
function isValidResponse(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return false;
    const obj = parsed;
    return (typeof obj.score === 'number' &&
        typeof obj.effort === 'string' &&
        typeof obj.reasoning === 'string');
}
/**
 * Estimate fixability for a single symbol using LLM.
 * Includes retry logic for empty/invalid responses.
 */
async function estimateOne(client, symbol, model, maxRetries = 2) {
    const code = extractSymbolCode(symbol);
    if (!code) {
        return null;
    }
    // Skip very large symbols (> 200 lines) - too expensive to analyze
    if (symbol.symbol.sloc > 200) {
        return {
            symbolId: symbol.symbol.id,
            score: 0.3, // Conservative estimate for large symbols
            reasoning: 'Large symbol (>200 lines) - conservative estimate',
            estimatedEffort: 'significant',
        };
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    {
                        role: 'system',
                        content: `You are a code quality expert. You MUST respond with valid JSON containing exactly three fields:
- "score": number between 0 and 1
- "effort": one of "trivial", "moderate", "significant", "major"
- "reasoning": brief explanation string

Do NOT respond with an empty object. Always provide all three fields.`,
                    },
                    {
                        role: 'user',
                        content: buildPrompt(symbol, code),
                    },
                ],
                response_format: { type: 'json_object' },
                max_completion_tokens: 2000,
            });
            const content = response.choices[0].message.content || '{}';
            const parsed = JSON.parse(content);
            // Validate response has required fields
            if (!isValidResponse(parsed)) {
                if (attempt < maxRetries) {
                    continue; // Retry on empty/invalid response
                }
                // Final attempt failed - return conservative estimate
                return {
                    symbolId: symbol.symbol.id,
                    score: 0.5,
                    reasoning: 'LLM response invalid - using default estimate',
                    estimatedEffort: 'moderate',
                };
            }
            return {
                symbolId: symbol.symbol.id,
                score: Math.max(0, Math.min(1, parsed.score)),
                reasoning: parsed.reasoning,
                estimatedEffort: (['trivial', 'moderate', 'significant', 'major'].includes(parsed.effort)
                    ? parsed.effort
                    : 'moderate'),
            };
        }
        catch (error) {
            if (attempt < maxRetries) {
                continue; // Retry on error
            }
            console.error(`Error estimating fixability for ${symbol.symbol.qualifiedName}:`, error);
            return null;
        }
    }
    return null;
}
/**
 * Estimate fixability for a list of symbols.
 *
 * Updates symbols in place with fixabilityScore and adjustedDeltaQ.
 * After estimation, re-sorts by adjustedDeltaQ and moves estimated symbols
 * to the front of the array so they appear in output.
 */
export async function estimateFixability(symbols, options = {}) {
    const { apiKey, model = GPT5_MODELS.NANO, maxSymbols = 10, } = options;
    // Check for API key
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
        console.error('OPENAI_API_KEY not set - skipping fixability estimation');
        return [];
    }
    const client = new OpenAI({ apiKey: key });
    const estimates = [];
    const estimatedIds = new Set();
    // Only estimate top N symbols to control costs
    const toEstimate = symbols.slice(0, maxSymbols);
    for (const symbol of toEstimate) {
        const estimate = await estimateOne(client, symbol, model);
        if (estimate) {
            estimates.push(estimate);
            estimatedIds.add(symbol.symbol.id);
            // Update symbol in place
            symbol.fixabilityScore = estimate.score;
            symbol.adjustedDeltaQ = (symbol.weightedDeltaQ ?? symbol.totalDeltaQ) * estimate.score;
        }
    }
    // Re-sort: estimated symbols first (by adjustedDeltaQ), then unestimated
    if (estimates.length > 0) {
        symbols.sort((a, b) => {
            const aEstimated = estimatedIds.has(a.symbol.id);
            const bEstimated = estimatedIds.has(b.symbol.id);
            // Estimated symbols come first
            if (aEstimated && !bEstimated)
                return -1;
            if (!aEstimated && bEstimated)
                return 1;
            // Within same group, sort by best available score
            const aScore = a.adjustedDeltaQ ?? a.weightedDeltaQ ?? a.totalDeltaQ;
            const bScore = b.adjustedDeltaQ ?? b.weightedDeltaQ ?? b.totalDeltaQ;
            return bScore - aScore;
        });
    }
    return estimates;
}
//# sourceMappingURL=index.js.map