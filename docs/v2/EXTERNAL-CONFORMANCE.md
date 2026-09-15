# Independent module conformance

The host and domain modules were packed separately, installed into new temporary consumers, and exercised through public package exports. Isogloss and the software/Sonar collectors remain external dependencies selected by the application; none is a core runtime dependency.

| Module | Public source revision | Checked scope |
| --- | --- | --- |
| `isogloss@0.6.0-dev.0` | [5947611](https://github.com/andrew-templeton/isogloss/commit/5947611) | Versioned text binding, configuration/build identity, unavailable preflight, qualification invalidation and blocked prerequisites; installed communication composition |
| `quality-sgd-sonarqube@0.2.0-dev.0` | [b5fd533](https://github.com/andrew-templeton/quality-sgd-sonarqube/commit/b5fd533) | Eight installed status/preflight cases, discovery, identity changes, stale qualification, prerequisite blocking and unexecuted nudge data |
| `quality-sgd-software@0.1.0-dev.1` | [256084e](https://github.com/andrew-templeton/quality-sgd-software/commit/256084e) | Installed public types and TypeScript collection/host composition; a later installed ESLint experiment exposed an ordering defect under investigation below |
| `quality-sgd-software@0.1.0-dev.2` | [13308ba](https://github.com/andrew-templeton/quality-sgd-software/commit/13308ba) | Corrected path ordering; real installed ESLint pass/fail, public host types, and complete repair/admission experiment |

The shared host artifact was `quality-gate-sgd@2.0.0-dev.2`, SHA-256 `68884f3a9262bdb7fd3cb1d7bb2a0fd1f44b2d84d7e4b304e225a137f5c3b346`. It includes the versioned contracts, durable execution, typed prerequisite outputs and workflow/context APIs. The [workflow guide](WORKFLOWS.md) records the other independently installed artifact hashes and executable commands.

The Sonar installed artifact hash was `a47cdf8633bb21faffaa8666559c6c3b73d9a2431a92b35f3f026babec19cbb4`. Its `test/installed.mjs` accepts `QUALITY_SGD_PACKAGE=/absolute/path/to/host.tgz`; its host declaration suite checks structural type compatibility. Its signed live record was also replayed independently: both current fixture source manifests and Ed25519 signatures matched the exact recorded evaluator, the issue fixture failed, the clean fixture passed, and tampering remained unavailable. That is a read-only verification of earlier actual scans, not a new scan or a scanner accuracy study.

The Isogloss `tools/check-quality-sgd.mjs` exercises the adapter against an installed host entry; its public consumer type fixture checks structural assignability. The staged study implementation separately passed 140 tests, including actual HTTP phase/restart/privacy checks. Automated actors remain labeled test actors and cannot count as human readers.

## Preserved negative result

The initial installed repair experiment using software `0.1.0-dev.1` could not collect an unchanged ESLint fixture. Initial stamps sorted mixed relative and absolute paths, while the subsequent check sorted already-absolute paths. A source root sorting before the installed tool root changed array order and produced unavailable evidence. This was a false unavailability defect, not a clean-report pass. Version `0.1.0-dev.2` canonicalizes paths before sorting and deduplicates equivalent references. Twenty collector cases and the real installed pass/fail layout regression passed. The complete repair experiment then rejected a lint-clean behavior regression and admitted the faithful repair; its [record and commands](../../examples/v2/repair-validation/README.md) retain both the initial failure and corrected outcome. The original TypeScript/protocol results above retain their stated narrower scope.

The corrected software runtime was exercised from tarball SHA-256 `a36c7cff82005637a40e034fcb2e51f94935173056fdfea60a6aea178ab8d851`. The final published-source artifact adds the successful validation documentation without changing runtime code; its SHA-256 is `d32d603a3c891ba6318a6c768e847ce49220987a62067e891923a62e6b0fc27b`.

## Interpretation and migration

Missing declarations, malformed data and incompatible schema versions are rejected before paid evaluation. A shape-valid but stale or incomplete report can still be unavailable after dispatch; protocol compatibility does not establish evidence authenticity or completeness. Changing a relevant evaluator/configuration/applicability identity invalidates its old qualification and comparison baseline. Explicit rebaselining retains durable spending history.

These checks establish interoperability and the exercised deterministic predicates. They do not qualify semantic extraction, human comprehension, model judgments, general software correctness or composite decision utility. No npm registry release or promotion of development versions is implied.
