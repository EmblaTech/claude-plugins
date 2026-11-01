# Remove-and-test check for doubtful lines

Run the same agent tasks on two copies of the repo. Copy A has the line. Copy B does not. Grade the results without knowing which copy is which. If B fails where A passes, keep the line.

1. **Tasks.** Write 3-4 real prompts. Each prompt must need the doubtful lines to succeed. Do not mention the line in the prompt. Give each task a pass/fail rule that a grader can check from the transcript and the diff.
2. **Copies.** Make one `git worktree` for each variant, task and run. Put the copies outside the repo and outside all folders that have a CLAUDE.md. Claude loads each CLAUDE.md from the working folder up to the root. In each copy, commit the variant edits with a neutral message. Then `git diff HEAD` shows only the agent's work.
3. **Runs.** Do 3 or more runs for each variant and task. One run gives random results. Use the same model for all runs. Remove the user's own setup and stop the agent from asking questions:

   ```sh
   claude -p "$PROMPT Make reasonable assumptions and finish without asking questions." \
     --model <pinned> --setting-sources project,local \
     --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
     --output-format stream-json --verbose --no-session-persistence \
     --allowedTools Read Grep Glob Edit Write "Bash(git log:*)" "Bash(git blame:*)" "Bash(git show:*)" "Bash(git diff:*)" \
     --disallowedTools "Bash(git push:*)" < /dev/null
   ```

   The user's `~/.claude/CLAUDE.md` still loads. It is the same in all variants. Do one test run first. Make sure that it finishes, that no needed tool is blocked, and that the output is saved.
4. **Grade without labels.** Give the grader the runs of each task with random labels. Remove the copy paths and the instruction-file text from the transcripts.
5. **Decide.** Compare the pass count first. Compare cost (turns, tokens) second. A cost difference counts only if it is larger than the difference between runs of the same variant.
6. **Clean up.** Run `git worktree remove` for each copy. Then run `git worktree prune`.
