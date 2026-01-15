/**
 * Location-Aware Optimization Target Types
 * =========================================
 * Types for discrete-differentiable optimization targets.
 *
 * Key insight: Instead of just computing ∂Q/∂dimension, we compute
 * ∂Q/∂target where target = (file, symbol, issue_cluster).
 *
 * This gives us "discrete differentiability" - we can compute
 * "if I fix X, I expect Y improvement" for each enumerable move.
 */
export {};
//# sourceMappingURL=types.js.map