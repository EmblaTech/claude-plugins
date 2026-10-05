# Commit Message Conventions

All commits follow the Conventional Commits specification with Jira ticket scope.

## Format

```
<type>(<JIRA-ID>): <short description>

[optional body — explain WHY, not what]
```

## Types

| Type | When to use |
|---|---|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code restructure without behaviour change |
| `test` | Adding or updating tests |
| `chore` | Build, config, dependency updates |
| `style` | Formatting, whitespace (no logic change) |

## Rules

- Scope is always the Jira ticket ID: `feat(EM-1234): ...`
- Short description: imperative mood, lowercase, no period, max 72 chars
- Body: explain motivation, not the diff — the diff is already visible
- One logical change per commit

## Examples

```
feat(EM-1234): add user authentication endpoint
```

```
fix(EM-1050): handle null session on login redirect

Session can be null when the OAuth callback arrives before the
cookie is set. Guard added in AuthGuard.canActivate().
```

```
docs(EM-1234): add dev plan for user authentication
```

```
test(EM-1234): add unit tests for AuthService.validateToken
```

## What to Avoid

| Bad | Why |
|---|---|
| `fix stuff` | No type, no scope, no context |
| `EM-1234 changes` | Not Conventional Commits format |
| `Updated code` | Describes what (visible in diff), not why |
| `WIP` | Never commit work-in-progress to shared branches |
