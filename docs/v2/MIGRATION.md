# Repository and API migration

Development version `2.0.0-dev.1` separates the generic engine from software-specific implementations. Existing v1 commits and releases remain available. This development revision deliberately moves the legacy root exports and CLI to their own package; it does not silently translate legacy rule results into v2 observations.

| Capability | Owner | Consumer change |
| --- | --- | --- |
| Composition, cards, budgets, calibration, decisions, admission and repair orchestration | [quality-gate-sgd](https://github.com/andrew-templeton/quality-gate-sgd) | Continue `import { v2 } from 'quality-gate-sgd'`; direct named core exports are also available. `dist/v2/*` remains available. |
| TypeScript/ESLint/coverage/Sonar collection, legacy rules and defaults, cache, code-symbol addressing, prioritization and software experiments | [quality-sgd-software](https://github.com/andrew-templeton/quality-sgd-software) | Import the existing software APIs from `quality-sgd-software`. Its repository owns the `quality-gate` CLI and software MCP server. |
| SonarQube v2 assertion and optional remediation nudges | [quality-sgd-sonarqube](https://github.com/andrew-templeton/quality-sgd-sonarqube) | Import `sonarqubeModule` and `sonarNudges` from the external package; follow its configuration migration and example. |
| Isogloss text-fold diagnostic | [Isogloss integration](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) | Keep the separately built and pinned Isogloss checkout. There is no Isogloss implementation or special export in core. |
| Rendered view coverage and semantic fold-inventory report predicates | Core `renderedLegibilityModule` | In dev.2 use `{ policy, reportPath?, costUpperBound? }` and declare `RENDER_INPUT` in the evaluation context. Operator-owned policy remains separate from candidate measurements. This is a communication report predicate, not a software metric collector. |
| Assertion-zoo resource | Core `RESOURCES` and `readResource` exports | Register these transport-neutral descriptors with a caller-supplied server, or use `quality-gate-v2 zoo`. Core no longer starts or imports the legacy software MCP server. |

The repositories are public source releases, not newly published npm registry versions. Clone/build the linked repositories or pin reviewed Git commits. When installing more than one checkout into an application, keep one reviewed host version and run its composition checks against the selected module revisions.

## Legacy software imports

```js
// Previously imported from the original quality-gate-sgd root:
import { extractTypescriptMetrics, evaluateRules } from 'quality-sgd-software';

// Generic v2 code keeps its existing namespace:
import { v2 } from 'quality-gate-sgd';
```

The software package preserves its existing metric/rule semantics and collector failure fixes. Missing legacy ceiling metrics are still optional. A legacy pass is not automatically a complete v2 gate pass. A new v2 software adapter must establish collection success, completeness, revision identity and applicable scope, and represent unavailable evidence explicitly. That work is tracked in the [dependency graph](../work/README.md).

## External Sonar module

The external module owns its report validation, configuration identity, model card and optional remediation metadata. Its [README](https://github.com/andrew-templeton/quality-sgd-sonarqube) describes the exact API and migration from the former reader callback. A complete-looking report is still caller-supplied evidence; the module does not launch or authenticate a server scan. A remediation description never authorizes execution by itself.

## Package boundary

Core has no runtime package dependencies. Its build first removes obsolete generated output, and `npm run check:package` verifies the actual package file list, exports and CLI boundary. This prevents old compiled collectors or software experiments from remaining in a package after their sources have moved.

Development version `2.0.0-dev.2` requires [explicit assertion contracts](CONTRACTS.md) by default and adds [durable execution](DURABLE-EXECUTION.md). Legacy assertions need an explicit compiler opt-in; the CLI uses the strict protocol. Recompile and rebaseline when migrating. Independent module conformance and the combined [API review](API-REVIEW.md) remain separate release requirements. No stable API or domain qualification is implied by this development version.
