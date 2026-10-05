# Domain 3 — Commit Message Format

Collect the commit message convention. Covers: `commitMessageFormat`.

Also generates `.claude/commit-conventions.md` after collection.

---

## Question

Show three preset options and allow a custom format:

```
What commit message format does this project use?

  1. Conventional Commits
     Format:  {type}({scope}): {description}
     Example: feat(auth): add JWT login endpoint

  2. Jira-prefixed
     Format:  {jira-key} {type}: {description}
     Example: FT-1234 feat: add JWT login endpoint

  3. Combined (Jira + Conventional)
     Format:  {type}({scope}): {jira-key} {description}
     Example: feat(auth): FT-1234 add JWT login endpoint

  4. Custom — type your own format

→ Default: 3 (Combined)
```

If `4` is chosen, ask:
```
Enter your commit message format.
Available tokens: {type}, {scope}, {jira-key}, {description}
Example: [{jira-key}] {type}: {description}
→
```

---

## Token Legend

```
{type}       — conventional type: feat, fix, docs, chore, refactor, test, style, perf, ci
{scope}      — component or area in parentheses, e.g. auth, api, ui (optional)
{jira-key}   — Jira issue key, e.g. FT-1234
{description} — short imperative summary, lowercase, no period
```

---

## Generated: `.claude/commit-conventions.md`

After Phase 4 confirmation, generate this file using the collected value.
Replace each `{token}` with the actual configured value and derive a concrete example:

    # Commit Message Conventions

    ## Format
    {commitMessageFormat}

    ## Example
    {concrete example derived from the chosen format, e.g. feat(auth): FT-1234 add JWT login endpoint}

    ## Commit Types
    | Type       | When to use                                              |
    |------------|----------------------------------------------------------|
    | feat       | New feature or user-facing functionality                 |
    | fix        | Bug fix                                                  |
    | docs       | Documentation only                                       |
    | refactor   | Code change that neither fixes a bug nor adds a feature  |
    | test       | Adding or updating tests                                 |
    | chore      | Build, tooling, dependency updates                       |
    | style      | Formatting, whitespace (no logic change)                 |
    | perf       | Performance improvement                                  |
    | ci         | CI/CD pipeline changes                                   |

    ## Rules
    - Use imperative mood: "add login endpoint" not "added" or "adds"
    - Lowercase first letter, no period at the end
    - Keep the description under 72 characters
    - Include the Jira key when the commit closes or progresses a ticket
