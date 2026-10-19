---
name: merge-develop
description: Fetch origin/develop and merge it into the current branch, resolve any merge conflicts, then commit and push. Use when the user asks to merge develop, sync with develop, or update the branch from develop.
allowed-tools: Bash(git fetch *) Bash(git merge *) Bash(git branch *) Bash(git status *) Bash(git push *) Bash(git stash *)
---

Run the following yourself with the Bash tool, in order — do not use `!` pre-execution, since a failing pre-execution command aborts before you're even invoked and you'd never see the error to react to it:

1. `git branch --show-current`
2. `git fetch origin develop`
3. `git merge origin/develop --no-edit`
4. `git status --short`

Act on the merge output:

1. **"Already up to date."** — report that the branch is current with develop and stop. Do not commit or push.
2. **Merge refused because of local changes** — run `git stash push -u`, then `git merge origin/develop --no-edit` again and continue with the matching case below (clean → case 4; conflicts → case 5). After the push succeeds, run `git stash pop`. If the pop itself conflicts, resolve the conflicts in the working tree but do NOT commit them — they are the user's uncommitted work.
3. **Merge already in progress** (from a previous attempt) — finish it: resolve any remaining conflicts as in case 5, then invoke `/commit-and-push`.
4. **Clean merge** (fast-forward or merge commit created automatically) — run `git push` and report the result. There is nothing to commit.
5. **Merge conflicts** — resolve them yourself:
   - Use the `frontend-skills:resolving-merge-conflicts` skill.
   - When every conflict is resolved, invoke `/commit-and-push` — during an in-progress merge its commit completes the merge commit, then it pushes.
6. **Fetch or merge failed with `index.lock` / "Another git process seems to be running"** — check `ps aux | grep git` for a process actually working in this worktree. If nothing is running and the lock file is stale, remove it (`rm <path>/index.lock`) and re-run the failed command (fetch or merge). If a git process is genuinely active, stop and tell the user to let it finish rather than removing the lock.

Report which case applied, what came in from develop (briefly), and any conflicts you resolved with a one-line rationale each.
