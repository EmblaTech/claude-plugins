# Pipeline Runner Detection

Read by `setup` in SKILL.md when top-level `options → runs-on: self.hosted` is detected in `base_pipeline`.

---

## Step 1 — Extract runner labels

Read the top-level `options → runs-on` entry only. Individual steps' own `runs-on:` values are not scanned — Bitbucket Pipelines runner assignment doesn't cascade between sibling steps, so another step's self-hosted declaration can't affect our new step, which declares no `runs-on` of its own and only inherits execution environment via this pipeline-wide default.

Collect the unique set of labels from this entry.

## Step 2 — Map labels to platform recommendation

Apply this mapping (first match wins — check in the order listed):

| Labels contain | Platform | Recommendation |
|---|---|---|
| `windows` | Windows | `node:24` is a Linux image and will fail on Windows runners. Use a Windows-compatible Node image such as `node:24-nanoserver-ltsc2022`, or the Windows-compatible equivalent from your internal registry. |
| `arm64` | Linux ARM64 | `node:24` supports arm64 via multi-arch manifest and should work. If using a private registry, ensure the arm64 layer is mirrored. |
| `linux` | Linux x64 | `node:24` should be pullable from Docker Hub. If the runner is air-gapped or uses a private registry, provide the internal mirror URL of `node:24`. |
| No match | Unknown | Runner platform unclear from labels. Verify that your runner can pull `node:24` from Docker Hub before proceeding. |

## Step 3 — Print this exact prompt

Print the following, substituting `<labels>` with the comma-separated label list and `<Recommendation>` with the matching text from Step 2:

```
⚠️ Self-hosted runner detected (labels: <labels>).

<Recommendation>

How would you like to proceed?
  [1] Use recommended workaround — enter your internal node:24 mirror URL now
  [2] Enter a custom image manually
  [3] Keep default node:24 and proceed

Your choice (1 / 2 / 3):
```

## Step 4 — Handle user response

**If user enters [1]:**
Print: `"Enter your internal node:24 mirror URL:"`
- Non-empty input → use as the Docker image for the AI PR Review step
- Blank input → re-prompt once: `"URL cannot be empty. Enter your mirror URL, or press Enter again to use node:24:"`
  - Blank again → use `node:24` and print: `"Falling back to node:24."`

**If user enters [2]:**
Print: `"Enter the full image name to use:"`
- Non-empty input → use as the Docker image for the AI PR Review step
- Blank input → re-prompt once: `"Image name cannot be empty. Enter the image name, or press Enter again to use node:24:"`
  - Blank again → use `node:24` and print: `"Falling back to node:24."`

**If user enters [3]:**
Use `node:24` unchanged. No further prompts.

The resolved image name replaces `node:24` in the `image:` field of the AI PR Review step only.
It is not stored in `embla.json`. The written `bitbucket-pipelines.yml` is the permanent record.
