---
name: commit-and-push
description: Stage, commit, push, and create a pull request when one does not exist
disable-model-invocation: true
allowed-tools: Bash(git commit *) Bash(git push *) Bash(git add *) Bash(git diff *) Bash(gh pr view *) Bash(gh pr create *)
---

## Changed files
!`git status --short`

## Change summary
!`git diff --stat`

## Recent commit style
!`git log --oneline -10`

Commit and push the current changes:

1. Look at the changed files above and decide whether they form one logical change or several distinct groups of related files (e.g., an unrelated fix in another package, a config/tooling change alongside a feature, changes to two independent features)
   - If you need to inspect a specific file's diff to decide or to write a message, run `git diff -- <path>` for just that file first
2. If everything is one logical change, run a single chained command: `git add -A && git commit -m "message" && git push`
3. If there are distinct groups, create one commit per group: for each group run `git add <group files> && git commit -m "message"`, each with its own 1-line message, then push once at the end with `git push`
   - Only split when the grouping is clear-cut; when in doubt, prefer a single commit
   - A group is defined by relatedness (same feature/fix/concern), not by directory
   - Generated files belong in the same commit as the source change that produced them
4. Check whether the current branch already has a pull request with `gh pr view`
5. If no pull request exists, create one targeting the repository's default branch with `gh pr create --fill`

Rules:
- Do NOT ask the user for a commit message — generate one yourself
- Keep the commit message to a single line, concise and descriptive
- Follow the commit message style from the recent commits shown above
- Do not commit files that likely contain secrets (.env, credentials, etc.)
- NEVER change directory — no `cd`, no `git -C`, no `pushd`. Run all commands from the current working directory
