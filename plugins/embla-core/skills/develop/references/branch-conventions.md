# Branch Naming Conventions

All branches must follow these formats exactly.

## Feature Branch
For new features or functionality.

```
sprint-no/feature/JIRA-ticket-number/short-description
```

Example:
```
s100/feature/EM-1024/user-authentication
```

## Bug Fix (Patch) Branch
For fixing bugs or issues.

```
sprint-no/patch/JIRA-ticket-number/short-description
```

Example:
```
s100/patch/EM-1050/user-auth-null-not-handled
```

## Release Branch
For preparing and managing releases.

```
release/version-number
```

Example:
```
release/1.0.0
```

## Master Branch
The primary stable and production-ready branch.

```
master
```

---

## Short Description Rules

- Use kebab-case (lowercase, hyphen-separated)
- 3–5 words maximum
- Describe the feature/fix, not the ticket: `user-authentication` not `fix-jira-ticket`
- No special characters, no spaces

## Sprint Number

- Infer from the current branch (e.g. current branch `s224/feature/...` → sprint `s224`)
- Ask the developer if the current branch has no sprint prefix
