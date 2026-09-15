# A clean diagnostic can still be a bad repair

This experiment executes a real external ESLint collector, two controlled patches in separate disposable directories, and independent JavaScript behavior subprocesses. The baseline has one unused-variable error and computes a 20-unit fee correctly. The first patch clears lint but removes the fee; the complete gate rejects it because all four registered behavior cases regress. The second removes only the unused variable and is admitted after both assertions pass.

The patch worker is a fixed synthetic intervention, not an autonomous model. The four amounts `[0, 100, 200, 10000]` and expected `amount + 20` are the entire behavior population checked here. This experiment does not estimate model repair success or establish correctness for other inputs.

## Reproduce using independently installed packages

Build and pack the public core and [software module](https://github.com/andrew-templeton/quality-sgd-software), then pass their tarballs:

```sh
node examples/v2/repair-validation/check-packages.mjs \
  /path/to/quality-gate-sgd-2.0.0-dev.2.tgz \
  /path/to/quality-sgd-software-0.1.0-dev.2.tgz \
  /path/to/new-evidence.json
```

The wrapper installs both packages and `eslint@9.39.2` into an empty temporary consumer, copies only the two fixture scripts and runs their public imports. It removes the consumer and disposable candidate directories afterwards. It does not modify a source checkout or call a paid model.

The [observed evidence](evidence.json) records the rejected/accepted admissions, independently executed outputs and resource accounting. The tested host artifact SHA-256 was `68884f3a9262bdb7fd3cb1d7bb2a0fd1f44b2d84d7e4b304e225a137f5c3b346`; the software artifact was `a36c7cff82005637a40e034fcb2e51f94935173056fdfea60a6aea178ab8d851`. The public software fix is [13308ba](https://github.com/andrew-templeton/quality-sgd-software/commit/13308ba). See [external conformance](../../../docs/v2/EXTERNAL-CONFORMANCE.md) for the published artifact containing its final documentation.

## Boundaries exercised

The registered harness remains disabled until its ID is explicitly enabled. The diagnostic includes shell-looking text and an instruction to skip verification; it travels as literal stdin data, creates no marker file, and cannot remove the behavior assertion from the gate. Its suggested verification list contains only the lint assertion, while the host still evaluates both required checks. The baseline file stays unchanged, and each attempt starts in a different candidate workspace.

Spending counts actual collector, proposal, patch-process and behavior-process invocations plus assertion evaluations. A collection unit counts a collection invocation; it is not currency. The baseline collection is reserved separately, and each repair reservation includes its fresh collection. No token/dollar conversion is invented. Existing [remediation tests](../../../tests/v2/remediation.test.ts) separately exercise deadlines/cancellation, literal stdin, output bounds, unaffordable work, malformed/excess metering and candidate snapshots through real subprocesses and controlled callbacks.

The first run on software `0.1.0-dev.1` stopped as unavailable: canonical path arrays changed order even though file bytes had not changed. The module fix canonicalizes before sorting and adds a regression with independently installed tools. The failed initial experiment is preserved in the software validation history; it is not counted as a successful repair.
