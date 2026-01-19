# AGENTS Notes

- Context: user requested evaluation of academic/paper docs and incorporation of a shared addressing scheme for target-space gradients.
- Key idea: target-space gradients require a consistent address space across all axes; for TypeScript we prefer the compiler symbol graph (qualified symbols + edges) with file:line fallback; for prose, use paragraph/sentence/word indices or a topic graph.
- Docs updated: `paper/quality-gate-sgd.tex`, `docs/CONCEPT.md`, `docs/theory/DIFFERENTIABILITY.md`, `docs/theory/TOPOLOGY.md`, `docs/theory/GEOMETRY.md`, `docs/theory/CONVERGENCE.md`, `docs/theory/CLAIMS.md`.
- Related plan: `docs/plan-unified-symbol-support.md` describes the symbol table and mapping work that backs the addressing scheme.
- Address fitness implemented in code: symbol call graph stats + mapping/size metrics wired into `--symbols` output.
- Open questions: compare symbol graph vs file/line addressing on convergence; add addressing fitness metrics to the preregistration.
