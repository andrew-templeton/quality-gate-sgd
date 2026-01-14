/**
 * MCP Module
 * ==========
 * Model Context Protocol integration for quality-gate-sgd.
 */

// Server
export { createMcpServer, runMcpServer } from './server.js';

// Tools
export {
  TOOLS,
  handleRun,
  handleScore,
  handleSuggest,
  handleTrajectory,
  handleExplain,
} from './tools.js';

// Resources
export {
  RESOURCES,
  readResource,
  handleDimensionsResource,
  handleRulesResource,
  handleFitnessResource,
  handleConvergenceResource,
  handleGeometryResource,
} from './resources.js';
