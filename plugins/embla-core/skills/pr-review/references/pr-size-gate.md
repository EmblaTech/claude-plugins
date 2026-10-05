# Phase 1.5 — pr-size-gate

Count `+` and `-` lines in the full diff, excluding lines that start with `---`, `+++`, `@@`, or `diff --git`.

## Threshold Resolution

Use the threshold already resolved in SKILL.md's Runtime Resolution table (`REVIEW_SIZE_THRESHOLD` env var → `embla.json` → `settings.json` → `300`) — do not re-derive it here.

## Local Mode (dev / lead)

- If total > threshold **and** `--force-size` flag was passed:
  - Log: `pr-size-gate bypassed (--force-size)` and continue.
- If total > threshold **and** no flag:
  - `AskUserQuestion`: "PR has {N} changed lines (threshold: {T}). Continue anyway?" — options: Yes / No
  - If No → stop.
- If total ≤ threshold:
  - Log: `pr-size-gate passed: {N} lines (threshold: {T})` and continue.

## Pipeline Mode

Behaviour is driven by the `REVIEW_SIZE_GATE` environment variable (default: `warn`).

| Value | Behaviour |
|---|---|
| `skip` | Bypass gate entirely. Log: `pr-size-gate skipped (REVIEW_SIZE_GATE=skip)` |
| `warn` | If total > threshold: post warning comment to Bitbucket, then continue (exit 0) |
| `fail` | If total > threshold: post warning comment to Bitbucket, set `passed: false` in the Gate Result below, and continue — Phase 2 onward still runs. The orchestrator decides the final exit code after Phase 7 (see pipeline-mode.md → "Exit Code Logic") |

Warning comment text (for `warn` and `fail`):
```
pr-size-gate: This PR has {N} changed lines (threshold: {T}). Large PRs are harder to review. Consider splitting. -- review
```

## Gate Result

Return this object to the orchestrator after the gate resolves:

```json
{"gate": "pr-size-gate", "passed": true, "lineCount": 187, "threshold": 300, "bypassed": false, "bypassReason": ""}
```

- `passed`: false if the gate blocked or triggered `fail` action
- `bypassed`: true when `--force-size` used (local) or `REVIEW_SIZE_GATE=skip` (pipeline)
- `bypassReason`: `"--force-size"` or `"REVIEW_SIZE_GATE=skip"` or `""` if not bypassed
