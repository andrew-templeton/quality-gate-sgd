# Public installed-package demonstration

This runner installs supplied core, Isogloss, software and Sonar tarballs into a fresh consumer. Every runtime stage uses public package imports. It runs discovery/configuration, a controlled repair experiment, an actual durable interruption/resume, historical Sonar replay, a finite verifier/decision program, and actual rendered communication composition.

```sh
node examples/v2/public-end-to-end/run.mjs \
  /path/quality-gate-sgd-2.0.0-dev.3.tgz \
  /path/isogloss-0.6.0-dev.0.tgz \
  /path/quality-sgd-software-0.1.0-dev.2.tgz \
  /path/quality-sgd-sonarqube-0.2.0-dev.0.tgz \
  /tmp/quality-sgd-new-public-run
```

## Build the public input packages

These commands create disposable source checkouts and build the four public revisions used by the recorded run. Run the demonstration command from the current core checkout containing this orchestration bundle; the separately pinned host input below predates the bundle and contains the fixture/runtime files it consumes.

```sh
quality_sgd_packages=$(mktemp -d)
mkdir "$quality_sgd_packages/tarballs"
git clone https://github.com/andrew-templeton/quality-gate-sgd.git "$quality_sgd_packages/core"
git -C "$quality_sgd_packages/core" checkout --detach 5b97e70323ec299bb80ff201368c9eee48ffbe86
git clone https://github.com/andrew-templeton/isogloss.git "$quality_sgd_packages/isogloss"
git -C "$quality_sgd_packages/isogloss" checkout --detach 5947611
git clone https://github.com/andrew-templeton/quality-sgd-software.git "$quality_sgd_packages/software"
git -C "$quality_sgd_packages/software" checkout --detach 13308ba910bd0f64db5e242de692e0af592539ce
git clone https://github.com/andrew-templeton/quality-sgd-sonarqube.git "$quality_sgd_packages/sonar"
git -C "$quality_sgd_packages/sonar" checkout --detach b5fd533cdef1d814139c5e324fa9039ebd472d7c
for quality_sgd_module in core isogloss software sonar; do
  (
    cd "$quality_sgd_packages/$quality_sgd_module" &&
    npm ci &&
    npm run build &&
    npm pack --ignore-scripts --pack-destination "$quality_sgd_packages/tarballs"
  ) || exit 1
done
node examples/v2/public-end-to-end/run.mjs \
  "$quality_sgd_packages/tarballs/quality-gate-sgd-2.0.0-dev.3.tgz" \
  "$quality_sgd_packages/tarballs/isogloss-0.6.0-dev.0.tgz" \
  "$quality_sgd_packages/tarballs/quality-sgd-software-0.1.0-dev.2.tgz" \
  "$quality_sgd_packages/tarballs/quality-sgd-sonarqube-0.2.0-dev.0.tgz" \
  "$quality_sgd_packages/results"
```

Use Node 22.23.2 for the tested environment. The source lockfiles pin build dependencies; each new run records its actual tarball and runtime-file hashes. A changed build artifact must be identified by its new hash even if its package version is unchanged. These commands neither publish to npm nor modify the source repositories' public branches.

The output directory must be new. This demonstration was tested on Node 22.23.2 with npm and a POSIX local filesystem for its SIGKILL/dead-writer recovery exercise. Use that tested Node version; the optional tooling has stricter runtime requirements than the core engine's package declaration. Installation explicitly includes Playwright 1.63.0, ESLint 9.39.2 and TypeScript 5.9.3. The script explicitly installs Chromium through Playwright; it may download the browser if it is absent from the local cache. All of these dependencies belong to this optional demonstration consumer.

The installed package directories are verified to be materialized from tarballs. Existing example files are copied from the installed core tarball. The small orchestration bundle beside `run.mjs` is copied into the consumer and its source hashes are recorded. The consumer has no runtime import of a checkout and clears development host/Isogloss overrides and `NODE_PATH`.

Outputs are retained for inspection:

- `inputs.json`: package versions, repository URLs, supplied tarball hashes, copied runner/fixture source hashes, installed core implementation digests and npm lock digest.
- `consumer/package-lock.json`: exact resolved installation, including transitive dependency integrities.
- `commands.json`, `stage-commands.json`: executed commands, exit status, deadlines, stdout/stderr digests and measured wall times.
- `stages/`: independent workflow, repair, durability, Sonar, finite and rendered records, including actual source reports, receipts and browser PNGs.
- `report.json`: expected demonstrations verified, stage-specific costs, and explicit scope statuses. Human calibration and composition utility remain `unverified`, with **zero real ballots**.
- `failure.json`: a bounded run's failure information, if a required stage fails. Failed stages do not silently fall back to fixtures or transfer old qualifications.

The finite wrapper calls the packaged program's exported function with the installed public `v2` namespace and an independently verified installed-byte manifest. It never calls the program's development loader. Its record replay preserves missing/unavailable cases and uses the declared constructed finite population; it does not qualify unseen populations.

The Sonar stage checks packaged prior signed live evidence and performs four current local gate evaluations. It makes zero new server contacts/analyses and does not recollect the historical fixture source files. The report states that trust in the signing key comes from the supplied package.

The durable stage uses the installed software module's actual TypeScript collector and a separate behavior assertion. A real subprocess applies one fixed patch and fsyncs its receipt. Its parent receives SIGKILL **after the repair outcome is persisted and before settlement**. Resume settles that saved outcome once, runs both required postrepair assertions and retains the full budget. A second completed-run resume dispatches no additional work. This adds one explicit integration crash point; the core's dedicated crash suite covers the wider phase matrix and unknown-outcome reconciliation.

See [PUBLIC-END-TO-END.md](../../../docs/v2/PUBLIC-END-TO-END.md) for the stage meanings, expected costs and empirical limits. The checked-in compact `evidence.json` is a receipt of the recorded run; the full generated consumer is preserved at the explicit run path reported during execution.

Run `node examples/v2/public-end-to-end/record.mjs /path/to/completed-run` for a read-only audit of the output: it verifies supplied tarballs, copied source bytes, the install lock, report digest, durable journal/receipts, outcomes and zero-ballot scope. An optional second path writes a new compact receipt without overwriting an existing file. This audit does not rerun the browser or authenticate the time of execution independently.
