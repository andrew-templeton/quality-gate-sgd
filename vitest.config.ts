import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/fixtures/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        // Interactive CLI files (require user input/terminal)
        'src/cli.ts',
        'src/init.ts',
        // MCP server files (require network/stdio transport)
        'src/mcp/**',
        // Pure type definitions (no runtime code)
        'src/types.ts',
        'src/**/types.ts',
        // Re-export index files
        'src/index.ts',
        'src/**/index.ts',
      ],
    },
  },
})
