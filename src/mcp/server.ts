/**
 * MCP Server
 * ==========
 * Model Context Protocol server for quality-gate-sgd.
 * Provides tools and resources for Claude integration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  TOOLS,
  handleRun,
  handleScore,
  handleSuggest,
  handleTrajectory,
  handleExplain,
} from './tools.js';

import {
  RESOURCES,
  readResource,
} from './resources.js';

// =============================================================================
// Server Creation
// =============================================================================

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'quality-gate-sgd',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // ---------------------------------------------------------------------------
  // Tool Handlers
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'quality_gate_run':
        return handleRun(args as { coverageOnly?: boolean });

      case 'quality_gate_score':
        return handleScore(args as { coverageOnly?: boolean });

      case 'quality_gate_suggest':
        return handleSuggest(args as { limit?: number; coverageOnly?: boolean });

      case 'quality_gate_trajectory':
        return handleTrajectory();

      case 'quality_gate_explain':
        return handleExplain(args as { topic: string });

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  // ---------------------------------------------------------------------------
  // Resource Handlers
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const result = readResource(uri);

    if (!result) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    return result;
  });

  return server;
}

// =============================================================================
// Server Runner
// =============================================================================

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}
