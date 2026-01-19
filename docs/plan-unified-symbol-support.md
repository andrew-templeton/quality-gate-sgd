# Plan: Unified Symbol Support for quality-gate-sgd

## Problem Statement

Currently, each quality axis (coverage, TypeScript, ESLint, SonarQube) extracts issues with different location models:

| Axis | Current Location Model | Symbol Info |
|------|----------------------|-------------|
| Coverage | file + line/col from Istanbul | Function name from `fnMap.name` only |
| TypeScript | file + line/col | None |
| ESLint | file + line/col | None |
| SonarQube | file + line | None |
| Dependency Graph | file-level imports | None |

**Limitations:**
1. Can't say "symbol X has issues across multiple axes"
2. Can't normalize issue density per symbol (issues/lines in symbol)
3. Branch coverage has NO symbol context (just line numbers)
4. Aggregation is file-level or Istanbul-function-level (incomplete)

## Proposed Solution: Unified Symbol Table

Build a TypeScript AST-based symbol table that all axes map into.

### Phase 1: Symbol Extraction (`src/symbols/extract.ts`)

Use TypeScript compiler API to build symbol table:

```typescript
interface UnifiedSymbol {
  id: string;                    // "src/auth/service.ts::UserService.validateToken"
  file: string;
  name: string;
  qualifiedName: string;         // "UserService.validateToken"
  kind: SymbolKind;              // 'class' | 'method' | 'function' | 'const' | 'arrow' | 'type'
  parent?: string;               // Parent symbol ID (for methods)
  exported: boolean;
  loc: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  lineCount: number;             // For density normalization
}

type SymbolKind =
  | 'class'
  | 'method'
  | 'function'
  | 'arrow'
  | 'const'
  | 'variable'
  | 'type'
  | 'interface'
  | 'enum';
```

**Implementation approach:**
1. Use `ts.createProgram()` to parse TypeScript files
2. Walk the AST with `ts.forEachChild()`
3. Extract declarations: `FunctionDeclaration`, `MethodDeclaration`, `ClassDeclaration`, `VariableDeclaration` (for arrow functions/consts)
4. Build parent-child relationships for class methods
5. Track `export` modifiers

### Phase 2: Location-to-Symbol Mapping (`src/symbols/mapper.ts`)

Given a `{file, line, column}`, find which symbol contains it:

```typescript
interface SymbolMapper {
  // Build index for a file
  indexFile(file: string, symbols: UnifiedSymbol[]): void;

  // Find symbol containing a location (O(log n) via interval tree)
  findSymbol(file: string, line: number, column?: number): UnifiedSymbol | undefined;

  // Find all symbols in a line range
  findSymbolsInRange(file: string, startLine: number, endLine: number): UnifiedSymbol[];
}
```

**Implementation:**
- Use an interval tree per file for O(log n) lookup
- Fallback to linear scan for small files

### Phase 3: Enhanced Issue Extraction

Modify each extractor to attach symbol info:

#### Coverage (`targets/extract.ts`)
```typescript
// Current (line 194-210):
issues.push({
  file: filePath,
  line: loc.start.line,
  // ... no symbol
});

// Enhanced:
const symbol = symbolMapper.findSymbol(filePath, loc.start.line);
issues.push({
  file: filePath,
  line: loc.start.line,
  symbol: symbol?.qualifiedName,
  symbolId: symbol?.id,
  // ...
});
```

#### TypeScript (`targets/extract.ts`)
```typescript
// Line 326-340 - add symbol lookup after parsing error location
const symbol = symbolMapper.findSymbol(err.file, err.line, err.column);
```

#### ESLint (`targets/extract.ts`)
```typescript
// Line 387-404 - add symbol lookup
const symbol = symbolMapper.findSymbol(fileResult.filePath, msg.line, msg.column);
```

#### SonarQube (`targets/extract.ts`)
```typescript
// Line 502-515 - add symbol lookup
const symbol = symbolMapper.findSymbol(filePath, issue.line);
```

### Phase 4: Symbol-Level Aggregation (`targets/aggregate.ts`)

Update aggregation to group by symbol ID:

```typescript
// Current grouping key (line ~50):
if (granularity === 'symbol' && issue.symbol) {
  key = `${issue.file}::${issue.symbol}`;  // Istanbul function name only
}

// Enhanced:
if (granularity === 'symbol' && issue.symbolId) {
  key = issue.symbolId;  // Full qualified symbol ID
}
```

### Phase 5: Symbol-Aware Metrics (`src/symbols/metrics.ts`)

New normalized metrics:

```typescript
interface SymbolMetrics {
  symbolId: string;
  qualifiedName: string;
  file: string;
  lineCount: number;

  // Issue counts by axis
  coverage: {
    uncoveredBranches: number;
    uncoveredStatements: number;
    branchCoverage: number;  // If determinable
  };
  typescript: {
    errorCount: number;
    errorCodes: string[];
  };
  eslint: {
    errorCount: number;
    warningCount: number;
    rules: string[];
  };
  sonarqube: {
    bugCount: number;
    smellCount: number;
    vulnerabilityCount: number;
  };

  // Normalized
  issueDensity: number;      // total issues / lineCount
  coverageGap: number;       // 1 - branchCoverage (0-1)
  qualityScore: number;      // Weighted combination
}
```

### Phase 6: Graph Integration

Extend dependency graph to symbol level:

```typescript
// Current: file -> file dependencies
// Enhanced: symbol -> symbol dependencies (for function calls)

interface SymbolDependency {
  from: string;  // symbolId
  to: string;    // symbolId
  type: 'import' | 'call' | 'extends' | 'implements';
}
```

This is optional/future work - file-level graph + symbol-level issues is already useful.

## File Structure

```
src/symbols/
├── index.ts           # Public API
├── types.ts           # UnifiedSymbol, SymbolKind, etc.
├── extract.ts         # TS AST walker to build symbol table
├── mapper.ts          # Location -> Symbol lookup
├── metrics.ts         # Symbol-level quality metrics
└── cache.ts           # Cache symbol tables per file (by mtime)
```

## Implementation Order

1. **`src/symbols/types.ts`** - Type definitions
2. **`src/symbols/extract.ts`** - AST walker (core complexity)
3. **`src/symbols/mapper.ts`** - Location lookup
4. **`src/symbols/index.ts`** - Public API
5. **Update `targets/extract.ts`** - Add symbol lookup to each extractor
6. **Update `targets/types.ts`** - Add `symbolId` to `LocatedIssue`
7. **Update `targets/aggregate.ts`** - Symbol-level aggregation
8. **`src/symbols/metrics.ts`** - Normalized per-symbol metrics
9. **Update CLI** - Add `--symbol-metrics` command

## Dependencies

- `typescript` (already used for type-checking, need compiler API)
- No new external dependencies required

## Testing Strategy

1. Unit tests for AST extraction on sample files
2. Unit tests for location->symbol mapping
3. Integration test: run on quality-sgd itself, verify symbols extracted
4. Comparison test: `--deep` mode before/after should show richer symbol info

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Performance (AST parsing) | Cache symbol tables by file mtime |
| Large codebases | Lazy load per-file, don't build full graph upfront |
| Complex TS patterns | Start with common patterns, iterate |
| Arrow functions in objects | Track variable declaration that holds arrow |

## Success Criteria

1. `npx quality-gate-sgd suggest --deep` shows qualified symbol names like `UserService.validateToken`
2. Coverage branches map to containing function symbols
3. Issue density normalized per symbol is available in JSON output
4. No significant performance regression (<2x slower on full extraction)
