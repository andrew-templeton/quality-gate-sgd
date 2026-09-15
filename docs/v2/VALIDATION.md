# V2 validation record

Development version `2.0.0-dev.1`, validated September 14, 2026 on Node.js 22.23.2. This revision externalizes the software implementations and adds the directed work graph. These are public Git source releases; no npm registry publication is claimed.

| Check | Result |
| --- | --- |
| Clean `npm ci` from core lockfile | Passed; core has no runtime dependencies |
| Clean TypeScript build | Passed; obsolete `dist` is removed before compilation |
| Core assertion/control tests | 123 tests in seven files passed with normal parallel file execution |
| Work-graph tests | 12 tests passed, including cycles, missing references, premature completion, readiness and stale generated-document detection |
| Graph validation/generation | 27 tasks with prerequisite-to-dependent arrows; generated Markdown matches JSON |
| Core ESLint | No errors; four non-null-assertion warnings (one source, three tests) |
| Actual core package boundary | 76 intended files; no legacy software runtime, Sonar adapter, domain dependencies or old CLI |
| Synthetic communication CLI | Three required assertions passed; three evaluation units spent |
| Installed package consumer | Packed core and Sonar packages installed into an empty project without transitive runtime dependencies; root/namespace imports and CLI worked |
| Combined external composition | Installed core plus external Sonar and linked Isogloss produced pass/fail/unavailable as expected, each accounting for two evaluation units |
| Public external repositories | Both new repositories report PUBLIC visibility and their pushed main revisions match local commits |

## External revisions

- Software gates: [`a6a7583`](https://github.com/andrew-templeton/quality-sgd-software/tree/a6a7583980a54b2068f1b234670afa041756252b), package `0.1.0-dev.0`. Clean install/build, 1,044 tests in 38 files, root/CLI/MCP smoke checks and a packed install into an empty consumer passed. [Its validation record](https://github.com/andrew-templeton/quality-sgd-software/blob/a6a7583980a54b2068f1b234670afa041756252b/docs/VALIDATION.md) distinguishes the tested TypeScript surface from external-service and Python research workflows. Portability fixes to three Python runners passed syntax and asset-path checks.
- SonarQube module: [`cc842a6`](https://github.com/andrew-templeton/quality-sgd-sonarqube/tree/cc842a657e4adfd383d9d4d63a51a7c00b3f22e6), package `0.1.0-dev.0`. Build/declarations, 34 unit tests and four real-host tests passed, including public TypeScript contract assignability. The package contains seven intended distribution files and no runtime dependencies.
- Isogloss example: [`c561ba9`](https://github.com/andrew-templeton/isogloss/tree/c561ba9bf7137d2196e8a60060b90fa9b5befb81/integrations/quality-sgd), implementation `0.5.0`. The existing integration previously passed its build/typecheck and 114 repository tests; this revision rechecked composition against the installed extracted core. Its integration remains in [draft PR 1](https://github.com/andrew-templeton/isogloss/pull/1).

## Historical checks and remaining limits

Before extraction, development revision `30a4f6b` passed 1,169 combined core/software tests serially. The software suite retains serial execution for the inherited logger/scaffold temporary-directory race reproduced on untouched baseline `95b3a41`. Those tests and that collision now belong to the software repository; the core suite passes with parallel execution.

The earlier consumer audit also exercised seven real TypeScript/ESLint subprocess cases, and the calibration examples ran successfully. Extraction preserves the collector failure hardening; it does not establish complete source coverage or change legacy optional-ceiling semantics.

These checks establish deterministic control and integration behavior. Synthetic render reports do not validate an application's pixels, and a lexical fold diagnostic does not establish comprehension. No new reader study, live SonarQube scan, paid repair run, empirical semantic-verifier qualification or full Python research evaluation was performed. The [API review](API-REVIEW.md) and [work graph](../work/README.md) retain the unresolved identity, input-contract, durability and domain-validation work.
