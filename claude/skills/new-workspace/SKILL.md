---
name: new-workspace
description: Create a new Herdr worktree workspace with the standard setup - git worktree branched off origin/develop, 4-pane layout (Claude agent top-left, hunk top-right, two shells below), and `task install codegen` running. Use when the user asks for a new workspace or worktree for a task.
---

# New Worktree Workspace

Run the bundled script — do not re-implement its steps by hand:

```bash
~/.claude/skills/new-workspace/new-workspace.sh --branch {BRANCH} [--label {TEXT}] [--base {REF}] [--agent-name {NAME}] [--path {PATH}] [--existing] [--no-hunk]
```

Pass `--existing` to open a workspace on a branch that already exists locally (checked out as-is; `--base` is ignored). Without it, an existing branch is an error. Pass `--no-hunk` to leave the top-right pane as a plain shell instead of running `hunk diff --watch`.

Defaults: label = branch name, base = `origin/develop`, agent name = lowercased branch truncated to 32 chars (must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents). The checkout lands at `~/Code/wiz/wiz-worktrees/<repo-name>/<ticket-id>` (the lowercased `WZ-XXXXX` prefix of the branch; full branch name if there is no ticket prefix) — override with `--path`.

The script blocks until the Claude agent in the top-left pane is ready for a prompt, then prints a JSON result:

- `workspace_id`, `checkout_path`, `agent_name`
- `panes`: `top_left` (Claude agent), `top_right` (`hunk diff --watch`, or a plain shell with `--no-hunk`), `bottom_left` (setup shell), `bottom_right` (spare shell)

Report these to the user (or return them to the invoking skill).

Setup (`task install codegen`) keeps running in `bottom_left` after the script exits. Anything needing dependencies or generated code must first run:

```bash
herdr pane wait-output {bottom_left} --match SETUP-DONE
```

On failure the script prints the reason to stderr and exits nonzero (not inside Herdr, branch already exists, missing tools, or a failed `herdr` call). Report the error; fix the input rather than performing the steps manually.

## Teardown (when the work is done)

```bash
herdr worktree remove --workspace {workspace_id}
```

This deletes both the checkout and the workspace. Occasionally run `git worktree prune` and delete merged local branches in the main checkout.
