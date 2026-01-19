/**
 * Address Fitness Metrics
 * =======================
 * Diagnostics for how well an addressing scheme supports target-space gradients.
 */
import type { ExtractedIssues } from '../targets/types.js';
import type { SymbolTable } from './types.js';
import { type SymbolCallGraphStats } from './call-graph.js';
export interface AddressFitnessStats {
    addressSpace: {
        symbolCount: number;
        fileCount: number;
        topLevelSymbolCount: number;
    };
    mapping: {
        totalIssues: number;
        lineIssues: number;
        fileIssues: number;
        mappedIssues: number;
        mappedLineIssues: number;
        mappedFileIssues: number;
        unmappedIssues: number;
        overallMappingRate: number;
        lineMappingRate: number;
        fileMappingRate: number;
    };
    size: {
        minSloc: number;
        medianSloc: number;
        p90Sloc: number;
        p95Sloc: number;
        maxSloc: number;
        avgSloc: number;
    };
    graph?: SymbolCallGraphStats;
    assessment: {
        status: 'fit' | 'mixed' | 'unfit';
        reasons: string[];
    };
}
export interface AddressFitnessOptions {
    includeCallGraph?: boolean;
}
export declare function computeAddressFitness(symbolTable: SymbolTable, extractedIssues: ExtractedIssues, options?: AddressFitnessOptions): AddressFitnessStats;
export declare function formatAddressFitness(stats: AddressFitnessStats): string;
//# sourceMappingURL=fitness.d.ts.map