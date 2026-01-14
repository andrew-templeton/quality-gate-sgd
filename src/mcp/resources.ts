/**
 * MCP Resource Handlers
 * =====================
 * Implements the resource handlers for the MCP server.
 */

import { getAllDimensions, generateDimensionsDoc } from '../dimensions/index.js';
import { loadRules } from '../rules.js';
import { getDefaultFitnessConfig } from '../fitness.js';

// =============================================================================
// Resource Definitions
// =============================================================================

export const RESOURCES = [
  {
    uri: 'quality://dimensions',
    name: 'Available Dimensions',
    description: 'List of all valid quality dimensions with metadata',
    mimeType: 'application/json',
  },
  {
    uri: 'quality://rules',
    name: 'Current Rules',
    description: 'Current rules.json configuration',
    mimeType: 'application/json',
  },
  {
    uri: 'quality://fitness',
    name: 'Fitness Configuration',
    description: 'Current fitness function weights and configuration',
    mimeType: 'application/json',
  },
  {
    uri: 'quality://theory/convergence',
    name: 'Convergence Theory',
    description: 'Documentation on quality convergence theorem',
    mimeType: 'text/markdown',
  },
  {
    uri: 'quality://theory/geometry',
    name: 'Quality Geometry',
    description: 'Documentation on the quality space geometry',
    mimeType: 'text/markdown',
  },
];

// =============================================================================
// Resource Handlers
// =============================================================================

export function handleDimensionsResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const dimensions = getAllDimensions();
  const content = {
    totalDimensions: dimensions.length,
    dimensions: dimensions.map(d => ({
      path: d.path,
      displayName: d.displayName,
      description: d.description,
      unit: d.unit,
      direction: d.direction,
      continuity: d.continuity,
      defaultWeight: d.defaultWeight,
      category: d.category,
    })),
  };

  return {
    contents: [{
      uri: 'quality://dimensions',
      mimeType: 'application/json',
      text: JSON.stringify(content, null, 2),
    }],
  };
}

export function handleRulesResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  try {
    const rules = loadRules();
    return {
      contents: [{
        uri: 'quality://rules',
        mimeType: 'application/json',
        text: JSON.stringify(rules, null, 2),
      }],
    };
  } catch (error) {
    return {
      contents: [{
        uri: 'quality://rules',
        mimeType: 'application/json',
        text: JSON.stringify({
          error: 'No rules.json found',
          message: 'Run `npx quality-gate-sgd init` to create a rules file',
        }, null, 2),
      }],
    };
  }
}

export function handleFitnessResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const config = getDefaultFitnessConfig();
  const dimensions = getAllDimensions();

  const content = {
    aggregation: config.aggregation,
    totalWeight: Object.values(config.weights).reduce((sum, w) => sum + w, 0),
    weightsByCategory: {
      coverage: dimensions
        .filter(d => d.category === 'coverage')
        .reduce((sum, d) => sum + (config.weights[d.path] ?? d.defaultWeight), 0),
      errors: dimensions
        .filter(d => d.category === 'errors')
        .reduce((sum, d) => sum + (config.weights[d.path] ?? d.defaultWeight), 0),
      quality: dimensions
        .filter(d => d.category === 'quality')
        .reduce((sum, d) => sum + (config.weights[d.path] ?? d.defaultWeight), 0),
    },
    weights: config.weights,
  };

  return {
    contents: [{
      uri: 'quality://fitness',
      mimeType: 'application/json',
      text: JSON.stringify(content, null, 2),
    }],
  };
}

export function handleConvergenceResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const content = `# Convergence Theorem

## Statement

For any codebase with initial quality state q₀ and target quality state q*, an LLM coding agent equipped with:
1. A monotonic quality gate that rejects regressions
2. A fitness function with gradient visibility

will converge to q* in finite iterations with probability 1, provided:
- The target is reachable (∃ path from q₀ to q*)
- The agent can make incremental progress (∂Q/∂x > 0 for some reachable x)

## Intuition

The monotonic constraint creates a "ratchet" effect - quality can only go up, never down. Combined with gradient information showing which improvements have the largest impact, the agent performs a form of coordinate descent in quality space.

## Key Properties

### Monotonicity
- Once a metric improves, it cannot regress
- This eliminates oscillation and ensures forward progress
- Implemented via "monotonic" rules in rules.json

### Gradient Visibility
- The fitness function provides a scalar quality measure
- The gradient shows which dimensions to prioritize
- Higher gradient = more fitness improvement per unit effort

### Fitness Function
The fitness function Q: Metrics → ℝ maps the metric vector to a scalar:
- Coverage metrics: linear scaling (0-100)
- Error counts: exponential decay (100 * e^(-x/10))
- Weighted sum across all dimensions

## Convergence Rate

In practice, convergence depends on:
1. **Starting distance**: |q* - q₀|
2. **Step size**: How much each fix improves metrics
3. **Dimension correlation**: Whether fixing one issue helps others

Typical trajectories show:
- Fast initial progress (low-hanging fruit)
- Gradual slowdown as easy fixes are exhausted
- Asymptotic approach to targets

## Using the Tools

\`\`\`
quality_gate_score      # Current fitness (0-100)
quality_gate_suggest    # Next best fix by gradient
quality_gate_trajectory # Historical convergence data
\`\`\`
`;

  return {
    contents: [{
      uri: 'quality://theory/convergence',
      mimeType: 'text/markdown',
      text: content,
    }],
  };
}

export function handleGeometryResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const content = `# Quality Space Geometry

## The Quality Space

Code quality forms a multi-dimensional space where each dimension represents a measurable aspect:

\`\`\`
Q = (coverage.unit.branches, coverage.unit.statements, typescript.errors, eslint.errors, ...)
\`\`\`

Each dimension has properties that affect optimization:
- **Direction**: higher-better or lower-better
- **Continuity**: smooth, discrete, or binary
- **Weight**: Importance in fitness function

## Dimension Types

### Coverage Dimensions (smooth, higher-better)
- Continuous values 0-100%
- Small code changes → small metric changes
- Ideal for gradient descent

### Error Counts (discrete, lower-better)
- Integer values ≥ 0
- Fixing one error → -1 to count
- Step function behavior

### Quality Scores (mixed)
- SonarQube metrics vary
- Some smooth (duplication %), some discrete (bug count)

## Coordinate Descent

The quality gate system implements coordinate descent:

1. **Select dimension**: Choose dimension with highest gradient
2. **Improve**: Make targeted fix to improve that dimension
3. **Verify**: Ensure no regressions via monotonic rules
4. **Repeat**: Continue until fitness target reached

## Constraint Satisfaction

The quality space has hard constraints (floors/ceilings):

\`\`\`
coverage.unit.branches >= 70    # Floor
typescript.errors <= 0          # Ceiling
\`\`\`

These define the feasible region. The fitness function guides within this region.

## Monotonic Trajectories

Monotonic rules create a partial ordering in quality space:
- q₁ ≤ q₂ if all monotonic dimensions improve or stay same
- Progress is irreversible (ratchet effect)
- Guarantees convergence (no cycles)

## Fitness Landscape

The fitness function creates a landscape:
- Higher fitness = better quality
- Gradient points toward improvement
- Local maxima are rare due to independent dimensions

\`\`\`
Q(metrics) = Σ wᵢ · normalize(metricᵢ)
\`\`\`

Where normalize maps each metric to 0-100 scale based on direction.
`;

  return {
    contents: [{
      uri: 'quality://theory/geometry',
      mimeType: 'text/markdown',
      text: content,
    }],
  };
}

// =============================================================================
// Resource Router
// =============================================================================

export function readResource(uri: string): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} | undefined {
  switch (uri) {
    case 'quality://dimensions':
      return handleDimensionsResource();
    case 'quality://rules':
      return handleRulesResource();
    case 'quality://fitness':
      return handleFitnessResource();
    case 'quality://theory/convergence':
      return handleConvergenceResource();
    case 'quality://theory/geometry':
      return handleGeometryResource();
    default:
      return undefined;
  }
}
