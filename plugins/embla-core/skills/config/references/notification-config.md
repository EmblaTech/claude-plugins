# Domain 5 — Notifications, Sprint & Review Thresholds

Covers: `teamsWebhookUrl`, `reviewSlaHours`, `publicHolidays`, `sprint.*`,
`reviewerMode`, `prSizeGateThreshold`, `testCoverageThreshold`, `publishThreshold`.

All fields in this domain are optional. Show defaults clearly so the user can accept them quickly.

---

## Step 1 — Teams Webhook (optional)

```
Does this project use Microsoft Teams for review notifications?
  If yes, paste the incoming webhook URL here.
  If no, press Enter to skip.

  How to find: Teams channel → ⋯ → Connectors → Incoming Webhook → copy URL
  Example: https://outlook.office.com/webhook/...

→ [current value or blank]
```

If skipped, `teamsWebhookUrl` is written as `""`. Steps 2 and 3 are still asked.

---

## Step 2 — Review SLA & Public Holidays

Only ask if `teamsWebhookUrl` is set. Otherwise skip silently.

```
How many working hours before an unreviewed PR triggers a Teams notification?
  Example: 24 (notify if PR has no review after 1 working day)
→ Default: 24
```

```
Any public holidays to exclude from the SLA calculation?
  Enter as comma-separated dates (YYYY-MM-DD), or press Enter to skip.
  Example: 2026-01-01, 2026-08-09, 2026-12-25
→ [current value or blank]
```

---

## Step 3 — Sprint Configuration

These values are used by the `plan` skill.

```
What is your sprint naming pattern?
  Tokens: {number} — sprint number, {year} — 4-digit year
  Example: S{number} - {year}   →   S224 - 2026
→ Default: S{number} - {year}
```

```
How many weeks does a sprint last?
→ Default: 2
```

```
What is your Jira board ID?
  How to find: open your Jira board → the URL contains /boards/{ID}
  Example: https://emblaftdev.atlassian.net/jira/software/projects/FT/boards/42
                                                                               ^^
→ [current value or blank]
```

```
Optional: sprint goal format?
  Tokens: {epic}, {stage}, {end-date}
  Example: Deliver {epic} to {stage} by {end-date}
  Press Enter to skip.
→ [current value or blank]
```

---

## Step 4 — Review Mode & Thresholds

Show all four values together as a group with defaults pre-filled. User can accept all or change individually.

```
Review settings (press Enter to accept all defaults):

  Reviewer mode       dev     — dev: interactive, no auto-post
                               lead: interactive, posts to Bitbucket
                               pipeline: non-interactive, always posts
  PR size threshold   300     — lines changed; PRs above this trigger a warning
  Test coverage       80      — minimum coverage % to pass the gate
  Publish threshold   60      — minimum confidence score (0–100) to post a comment

Accept all defaults? (yes / customise)
```

On `customise`, ask each field one at a time with its description.
