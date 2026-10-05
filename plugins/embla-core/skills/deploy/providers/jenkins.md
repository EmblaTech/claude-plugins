# Jenkins Provider Adapter

Implements the three-operation deploy contract for Jenkins.

Config keys read from `.claude/embla.json → deploy.jenkins.*`:
- `url` — Jenkins base URL (no trailing slash)
- `job` — exact job name as shown in the Jenkins UI
- `user` — Jenkins username for Basic Auth

Token: `JENKINS_TOKEN` env var (fallback: `.claude/settings.json → deployJenkinsToken`)

---

## Operation 1 — Trigger

Start a parameterized build with `BRANCH` set to the source branch name.

```
POST {deploy.jenkins.url}/job/{deploy.jenkins.job}/buildWithParameters
  Authorization: Basic base64("{deploy.jenkins.user}:{JENKINS_TOKEN}")
  Content-Type: application/x-www-form-urlencoded
  Body: BRANCH={branchName}
```

Expected response: **HTTP 201** with a `Location` header containing the queue item URL.

- Extract the queue item URL from the `Location` header → store as `queueItemUrl`
- Any non-201 response: stop — print status code and full response body

---

## Operation 2 — Resolve Build URL

Convert the queue item URL to the actual build URL. The queue item is pending until Jenkins assigns a build number.

```
GET {queueItemUrl}/api/json
```

- Poll every **5 seconds** until `response.executable.url` is present (not null)
- `response.executable.url` → store as `buildUrl`
- `response.executable.number` → store as `buildNumber`
- If `response.cancelled == true`: treat as `ABORTED` immediately — go to Phase 8F
- Timeout after **2 minutes** of waiting: stop — `"Error: Jenkins queue item did not start a build within 2 minutes. The job may be waiting for an available executor."`

---

## Operation 3 — Poll Build Status

Check whether a running build has finished.

```
GET {buildUrl}/api/json
```

Interpret `response.result`:

| `result` value | Return status |
|---|---|
| `null` | `running` |
| `"SUCCESS"` | `success` |
| `"FAILURE"` | `failure` |
| `"ABORTED"` | `failure` |
| anything else | `failure` |

Also return:
- `consoleUrl`: `{buildUrl}/console`
