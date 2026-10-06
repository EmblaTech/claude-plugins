# Evaluation and iteration

Source: Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), read 2026-10-06. Condensed and adapted for this repo.

## Evaluations first

Write evaluations **before** extensive documentation, so the skill solves observed problems rather than imagined ones:

1. **Find gaps:** run Claude on representative tasks without the skill; record the specific failures and missing context.
2. **Write three scenarios** that exercise those gaps.
3. **Baseline:** measure Claude without the skill.
4. **Minimal instructions:** write just enough to close the gaps.
5. **Iterate:** rerun the scenarios, compare with the baseline, refine.

Scenario shape:

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF file and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Reads the PDF with an appropriate library or CLI tool",
    "Extracts text from every page",
    "Saves the text to output.txt"
  ]
}
```

There is no built-in runner. In this repo, record the three scenarios and their observed results in the PR's **Test Plan**.

## Claude A / Claude B

- **Claude A** helps you write and refine the skill.
- **Claude B** is a fresh session with the skill installed, doing real tasks.

New skill: solve the task once with Claude A using normal prompting, note the context you kept supplying, then ask Claude A to capture that as a skill. Have it cut explanations Claude already knows and move bulky material (schemas, API detail) into reference files. Test with Claude B on similar tasks.

Existing skill: give Claude B real work, note where it struggles or surprises you, bring the current SKILL.md and the specific observation back to Claude A ("B forgot to filter test accounts on the regional report"). Typical fixes: make the rule more prominent, use stronger wording ("MUST filter"), or restructure the workflow. Retest with Claude B. Repeat.

## Test across models

Skills behave differently per model. Test on every model the skill will run on:
- **Haiku:** is there enough guidance?
- **Sonnet:** is it clear and efficient?
- **Opus:** does it avoid over-explaining?

In this repo `pr-review` runs Haiku subagents for eligibility and confidence scoring, so instructions those subagents follow are tested on Haiku.

## Team feedback

Share the skill with teammates and ask: does it activate when expected, are the instructions clear, what is missing? Fold the answers into the next iteration.
