# Jira trigger for ai-develop

The known trigger profile, and the worked example `workflows/ai-develop/trigger-guide.md` ports from. Fill the `<…>` values from `embla.json` and the host, then print the steps. The user builds the rule by hand in Jira; nothing here is created through an API.

## Rule

Project settings → Automation → Create rule:

1. **Trigger:** *Work item commented*. Comment type: *Comment is the main action*.
2. **Condition:** *{{smart values}} condition* — first value `{{comment.body.toLowerCase()}}`, condition `contains`, second value `@claudedev`.
3. **Condition:** *{{smart values}} condition* — first value `{{comment.author.accountId}}`, condition `does not equal`, second value `<account id of the API token's owner>`. Loop guard (AD3): the run's own comments come from that account.
4. **Action:** *Send web request*.
   - URL: `<host run-pipeline URL>` (Bitbucket: `https://api.bitbucket.org/2.0/repositories/<workspace>/<slug>/pipelines/`)
   - Method: `POST`. Web request body: *Custom data*.
   - Headers: `Content-Type: application/json`; `Authorization: <host auth value>` with **Hidden** ticked.
   - Tick *Delay execution of subsequent flow actions until we've received a response*.
5. Name the rule `Autonomous AI Development - triggered by @claudedev mention`, set the owner, save, enable.

## Bitbucket body

```json
{
  "target": {
    "type": "pipeline_ref_target",
    "ref_type": "branch",
    "ref_name": "<masterBranch>",
    "selector": { "type": "custom", "pattern": "ai-develop" }
  },
  "variables": [
    { "key": "JIRA_ISSUE_KEY", "value": "{{issue.key}}" },
    { "key": "COMMENTER_ACCOUNT_ID", "value": "{{comment.author.accountId}}" }
  ]
}
```

`Authorization` value: `Bearer <token>`, where the token is a Bitbucket repository access token with Pipelines → Write (`pipeline:write`: trigger, stop, rerun) and nothing broader (C4). Source: https://support.atlassian.com/bitbucket-cloud/docs/repository-access-token-permissions/. Project and workspace tokens also carry the scope but need Bitbucket Premium. Keep this token separate from `BITBUCKET_API_TOKEN`: it lives only in the Jira rule.

## Test

Comment `@claudedev please implement` on a test ticket. *Audit log* on the rule shows the web request's HTTP status (`201` = pipeline started); the pipeline appears under Pipelines → *ai-develop*.
