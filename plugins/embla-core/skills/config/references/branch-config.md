# Domain 2 — Branch Format Configuration

Collect branch naming conventions. Covers: `masterBranch`, `featureBranchFormat`,
`bugBranchFormat`, `hotfixBranchFormat`, `releaseBranchFormat`.

Also generates `.claude/branch-conventions.md` after collection.

---

## Token Legend

Show this legend before asking any branch format question:

```
Available tokens for branch formats:
  {sprint}            — sprint prefix, e.g. s224
  {jira-key}          — Jira issue key, e.g. FT-1234
  {short-description} — 3–5 word kebab-case summary, e.g. user-login-fix
  {version}           — semantic version, e.g. 1.2.0
  {type}              — issue type: feature, bug, hotfix
```

---

## Questions

Ask one at a time. Show the current value as the default if already set.

**Master branch:**
```
What is your main / production branch name?
  Common values: main, master, develop
→ Default: main
```

**Feature branch format:**
```
Format for feature branches?
  Example: s{sprint}/{jira-key}-{short-description}
  Produces: s224/FT-1234-user-login-page
→ [current value or example above]
```

**Bug branch format:**
```
Format for bug fix branches?
  Example: s{sprint}/bug/{jira-key}-{short-description}
  Produces: s224/bug/FT-1250-null-pointer-on-login
→ [current value or example above]
```

**Hotfix branch format:**
```
Format for hotfix branches (urgent production fixes)?
  Example: hotfix/{jira-key}-{short-description}
  Produces: hotfix/FT-1300-payment-gateway-timeout
→ [current value or example above]
```

**Release branch format:**
```
Format for release branches?
  Example: release/s{sprint}   or   release/v{version}
  Produces: release/s224        or   release/v2.1.0
→ [current value or example above]
```

---

## Short Description Rules

After collecting formats, remind the user (do not ask):

```
Short description rules (applies to all branch formats):
  - kebab-case: lowercase, hyphens only
  - 3–5 words maximum
  - Describe the change, not the ticket: user-login-page not fix-jira-issue
  - No special characters
```

---

## Generated: `.claude/branch-conventions.md`

After Phase 4 confirmation, generate this file using the collected values.
Replace each `{token}` with the actual configured value:

    # Branch Naming Conventions

    ## Master Branch
    Production-ready branch: {masterBranch}

    ## Feature Branch
    Format:  {featureBranchFormat}
    Example: s224/FT-1234-user-login-page

    ## Bug Fix Branch
    Format:  {bugBranchFormat}
    Example: s224/bug/FT-1250-null-pointer-on-login

    ## Hotfix Branch
    Format:  {hotfixBranchFormat}
    Example: hotfix/FT-1300-payment-gateway-timeout

    ## Release Branch
    Format:  {releaseBranchFormat}
    Example: release/s224

    ---

    ## Short Description Rules
    - Use kebab-case (lowercase, hyphen-separated)
    - 3–5 words maximum
    - Describe the feature/fix, not the ticket
    - No special characters, no spaces

    ## Sprint Number
    Infer from current branch (e.g. s224/feature/... → sprint s224). Ask developer if unclear.
