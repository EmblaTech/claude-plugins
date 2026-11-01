# Probe doubtful lines

An ablation: run the same agent tasks on the file with the line (A) and without it (B), grade blind, keep the line if B fails where A passes.

1. **Tasks.** Write 3-4 realistic prompts whose success depends on the doubtful lines, each with a binary pass criterion a grader can check from the transcript and diff. The prompt does not hint at the line.
2. **Copies.** One `git worktree` per variant × task × run, created outside the repo and outside any folder with a CLAUDE.md: Claude loads every CLAUDE.md from the working directory up. Commit the variant edits there with a neutral message, so `git diff HEAD` shows only the agent's work.
3. **Runs.** n ≥ 3 per cell; one run is noise. Same pinned model for all. Isolate from the user's setup and keep the run non-interactive:

   ```sh
   claude -p "$PROMPT Make reasonable assumptions and finish without asking questions." \
     --model <pinned> --setting-sources project,local \
     --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
     --output-format stream-json --verbose --no-session-persistence \
     --allowedTools Read Grep Glob Edit Write "Bash(git log:*)" "Bash(git blame:*)" "Bash(git show:*)" "Bash(git diff:*)" \
     --disallowedTools "Bash(git push:*)" < /dev/null
   ```

   The user's `~/.claude/CLAUDE.md` still loads; it is the same in every variant. Smoke-test one run first: it finishes, no needed tool is denied, output is captured.
4. **Grade blind.** Give the grader each task's runs under shuffled labels, with worktree paths and instruction-file contents scrubbed from the transcripts.
5. **Judge** by pass count first, cost (turns, tokens) second; a cost gap counts only when it exceeds the run-to-run spread.
6. **Clean up**: `git worktree remove` every copy, then `git worktree prune`.
