# Jira ticket pre-fetch

The D1 ticket half for `tracker.provider: jira` (see `pipeline-rules.md`). Setup replaces the tracker marker entry in the host template with the block below, re-indented to that template's script indentation (a host whose script is one `run:` block, like GitHub, takes only the lines under `- |`). Copy it verbatim; it is host-neutral because it reads the PR title and source branch from `docs/reviews/pr-context.json`, which the host's own pre-fetch writes first.

The matching `pr-review-tools.json` entry is `"tracker": {"provider": "jira", "method": "prefetch"}`.

```yaml
- |
  ( set +e
    command -v jq >/dev/null 2>&1 || { apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq jq >/dev/null 2>&1; }
    JIRA_KEY=$(jq -r '"\(.pr.title // "") \(.pr.source_branch // "")"' docs/reviews/pr-context.json 2>/dev/null \
      | grep -oE '[A-Z][A-Z0-9]+-[0-9]+' | head -n1)
    if [ -z "$JIRA_KEY" ]; then
      echo "Ticket pre-fetch: no Jira key in PR title or branch name — requirement agent will report the missing link"
      exit 0
    fi
    printf 'user = "%s:%s"\n' "${ATLASSIAN_USER_EMAIL:-$BITBUCKET_EMAIL}" "$ATLASSIAN_API_TOKEN" | curl -s -K - \
      -H "Accept: application/json" \
      "https://$ATLASSIAN_SITE_NAME.atlassian.net/rest/api/2/issue/$JIRA_KEY" \
      | jq '{key, summary: .fields.summary, description: .fields.description, issuetype: .fields.issuetype.name, status: .fields.status.name, labels: .fields.labels, parent: (if .fields.parent then {key: .fields.parent.key, summary: .fields.parent.fields.summary} else null end), custom: ([.fields | to_entries[] | select(.key | startswith("customfield_")) | select(.value != null) | {(.key): .value}] | add)}' \
      > /tmp/ticket.json 2>/dev/null
    if jq -e '.key' /tmp/ticket.json >/dev/null 2>&1; then
      mv /tmp/ticket.json docs/reviews/ticket.json
      echo "Ticket pre-fetch: $JIRA_KEY -> docs/reviews/ticket.json"
    else
      echo "Ticket pre-fetch: fetch or parse failed for $JIRA_KEY — requirement agent will run without ticket context"
    fi
  ) || true
```

Why this shape, beyond D1:
- REST **v2**, so `description` is plain text rather than ADF JSON.
- Jira is pre-fetched rather than served by an MCP server because the review needs one read, and an MCP server's whole tool schema enters every turn's context regardless of `--allowedTools`. The Atlassian credentials also stay out of the review process's environment: only this root-shell block reads them.
- The key comes from `grep -oE` over `jq` output, never from shell interpolation of PR text (D3). The key reaches the URL only after matching `[A-Z][A-Z0-9]+-[0-9]+`.
- `${ATLASSIAN_USER_EMAIL:-$BITBUCKET_EMAIL}` keeps Bitbucket projects set up before the multi-provider change working without a new variable.
