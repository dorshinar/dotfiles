---
name: checkout
description: Check out a branch in a new Herdr worktree space (Claude agent on the left, a pane that runs `task install codegen` then hunk on the right, via herdr-core). Use when the user asks to check out a branch, or for a new space, workspace or worktree for a task.
allowed-tools: Bash(~/.claude/skills/checkout/checkout.sh:*)
---

Run exactly this, once, with no other tool calls before it:

```bash
~/.claude/skills/checkout/checkout.sh $ARGUMENTS
```

The first argument is the branch; an existing branch (local or on origin) is reused, otherwise it is created from `origin/develop` or `--base {REF}`. Other flags: `--task {TEXT}` (Claude's first message; `{setup}` inside it expands to the setup terminal's address), `--agent-name {NAME}`, `--path {PATH}`, `--label {TEXT}` (accepted; the app names a space after its checkout folder), `--claude-args {ARGS}`, `--no-hunk` (the right pane stays a shell after setup). The script cannot focus the new space; it appears in the app's sidebar nested under the repo.

On success it prints JSON: `space_id`, `checkout_path`, `branch`, `agent_name`, `terminals` (`claude`, `hunk`, `setup`), `task_sent`, `wait_for_setup`, `teardown`. Reply with a 4-row table (space, checkout path, branch, agent) and these two commands, nothing else:

```bash
hc read {setup} | grep -q SETUP-DONE || hc wait {setup} --output SETUP-DONE   # before anything needing deps/codegen
~/.claude/skills/checkout/teardown.sh {checkout_path} --delete-branch          # teardown
```

If `task_sent` is `false`, add one line: the first message did not land, `hc read {claude}` shows why (usually the folder-trust prompt).

On nonzero exit, report the stderr message; never perform the steps by hand.
