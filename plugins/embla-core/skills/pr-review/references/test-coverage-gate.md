# Phase 4.5 — Test Coverage Gate

Reads `coveragePct` from the `coverage` agent result (Phase 3).

If the `coverage` agent did not run — excluded by Phase 2.7's judgment — **skip this gate entirely** and render the gate row as not-applicable.

## Threshold Resolution

Use the threshold already resolved in SKILL.md's Runtime Resolution table (`REVIEW_COVERAGE_THRESHOLD` env var → `embla.json` → `settings.json` → `80`) — do not re-derive it here.

## Local Mode (dev / lead)

- If `coveragePct` < threshold **and** `--force-coverage` flag was passed:
  - Log: `test-coverage-gate bypassed (--force-coverage)` and continue.
- If `coveragePct` < threshold **and** no flag:
  - `AskUserQuestion`: "Test coverage is {N}% (threshold: {T}%). Continue?" — options: Force / Skip / Abort
  - If Abort → stop.
- If `coveragePct` ≥ threshold:
  - Log: `test-coverage-gate passed: {N}% (threshold: {T}%)` and continue.

## Pipeline Mode

Behaviour is driven by the `REVIEW_COVERAGE_GATE` environment variable (default: `fail`).

| Value | Behaviour |
|---|---|
| `skip` | Bypass gate entirely. Log: `test-coverage-gate skipped (REVIEW_COVERAGE_GATE=skip)` |
| `warn` | If coveragePct < threshold: post warning comment to Bitbucket, then continue (exit 0) |
| `fail` | If coveragePct < threshold: post warning comment to Bitbucket, set `passed: false` in the Gate Result below, and continue — Phase 5 onward still runs. The orchestrator decides the final exit code after Phase 7 (see pipeline-mode.md → "Exit Code Logic") |

Warning comment text (for `warn` and `fail`):
```
test-coverage-gate: Estimated test coverage is {N}% (threshold: {T}%). Add tests before merging. -- review
```

## Gate Result

Return this object to the orchestrator after the gate resolves:

```json
{"gate": "test-coverage-gate", "passed": true, "coveragePct": 84, "threshold": 80, "bypassed": false, "bypassReason": ""}
```

- `passed`: false if the gate blocked or triggered `fail` action
- `bypassed`: true when `--force-coverage` used (local) or `REVIEW_COVERAGE_GATE=skip` (pipeline)
- `bypassReason`: `"--force-coverage"` or `"REVIEW_COVERAGE_GATE=skip"` or `""` if not bypassed
