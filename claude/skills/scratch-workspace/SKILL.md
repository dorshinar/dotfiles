---
name: scratch-workspace
description: Create a throwaway Herdr worktree workspace for one-offs or experiments not tied to a Jira ticket. Auto-names the branch `scratch-MMDD-HHMM` off origin/develop and uses the standard 4-pane layout. Use when the user asks for a scratch, throwaway, experiment, or playground workspace/worktree.
---

# Scratch Worktree Workspace

Do not ask for a branch name. Generate one and run the `/new-workspace` script directly:

```bash
~/.claude/skills/new-workspace/new-workspace.sh --branch scratch-$(date +%m%d-%H%M) --label scratch
```

If the user gave a short hint (e.g. "scratch for testing preload"), append it kebab-cased: `scratch-$(date +%m%d-%H%M)-testing-preload`. Pass `--base {REF}` only if the user names a different base.

Report the JSON result (`workspace_id`, `checkout_path`, `agent_name`, panes) the same way `/new-workspace` does, and remind the user that setup keeps running in `bottom_left` until it prints `SETUP-DONE`.

## Teardown

```bash
herdr worktree remove --workspace {workspace_id}
```

Scratch branches are disposable — delete the local branch after removing the workspace.
