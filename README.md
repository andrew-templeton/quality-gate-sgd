# quality-gate-sgd

Composable quality assertions, documented guarantees, and budgeted improvement loops.

## Development engine

The core composes independently maintained assertion modules into required/advisory gates. It provides assertion cards, a discoverable taxonomy, independent cost units, finite decision-value calculations, conservative nudge conflict handling, admission with deadbands/cooldowns/cycle detection, calibration primitives, and optional repair orchestration.

The API is experimental (`2.0.0-dev.2`). The [consumer API review](docs/v2/API-REVIEW.md) records remaining requirements before stabilization. The [directed work graph](docs/work/README.md) links implementation, validation and release dependencies; [graph.json](docs/work/graph.json) is its machine-readable source.

```sh
npm ci
npm run build
npm test
npm run plan:check
npm run check:package
node dist/v2/cli.js run examples/v2/communication.mjs
```

```js
import { v2 } from 'quality-gate-sgd';
// Direct imports such as { compileGate, BudgetLedger } are also available.
```

The communication example is a synthetic integration fixture. A passing fixture checks composition and accounting, not browser pixels or reader comprehension.

## Independently maintained modules

| Repository | Responsibility |
| --- | --- |
| [quality-gate-sgd](https://github.com/andrew-templeton/quality-gate-sgd) | Generic contracts, composition, budgets, calibration, candidate admission and the communication render-report predicate |
| [quality-sgd-software](https://github.com/andrew-templeton/quality-sgd-software) | Existing software collectors, legacy rules, CLI/MCP, symbol addressing and software experiment infrastructure |
| [quality-sgd-sonarqube](https://github.com/andrew-templeton/quality-sgd-sonarqube) | External SonarQube v2 report assertion and optional remediation nudges |
| [Isogloss](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) | Default external language/legibility example, owned and versioned with its implementation |

The core does not install or re-export these external implementations. Software-specific imports and the old `quality-gate` CLI move to their owner; see the [migration guide](docs/v2/MIGRATION.md). Public Git repositories are available as source checkouts; this change does not publish new npm registry versions.

Start with the [v2 guide](docs/v2/README.md), [calibration protocol](docs/v2/CALIBRATION.md), [repair orchestration](docs/v2/REMEDIATION.md), and [validation record](docs/v2/VALIDATION.md). The [legacy software documentation](https://github.com/andrew-templeton/quality-sgd-software) explains the original metric and rule APIs.

A composed pass means that the required predicates and their prerequisites passed under their declared assumptions. It does not establish universal adequacy, independent confidence, or guaranteed convergence. The historical [theory](docs/theory/CLAIMS.md) and [paper](paper/quality-gate-sgd.tex) remain research context; software implementation references now belong to the external software repository.
