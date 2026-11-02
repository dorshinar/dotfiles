---
name: implement-worktree
description: Implement Jira tickets end-to-end, each in a fresh Herdr worktree space created via the checkout skill. Clone of frontend-skills:implement that runs the implementation in a dedicated space instead of the current checkout.
disable-model-invocation: true
---

# Implement Jira Ticket in a Herdr Worktree Space

Input: one or more Jira ticket IDs (`WZ-12345 WZ-12346`). Per ticket: derive a branch, create a space via `/checkout`, hand its Claude agent the implement workflow as its first message. This session orchestrates and reports; the space's agent implements. Tickets run concurrently.

## 1. Branch name

Fetch only the ticket summary (`/acli-jira` for syntax); the space's agent gathers full context itself. If `acli` or `gh` report an auth error, stop and tell the user to log in.

Format `WZ-XXXXX-short-description`: kebab-case, lowercase, at most 10 words after the ID, drop articles and prepositions to fit.

## 2. Space and hand-off

Run the checkout script with the implement prompt as `--task`; the script starts Claude with it as the first message and expands `{setup}` to the address of the shell running dependency install and codegen:

```bash
~/.claude/skills/checkout/checkout.sh {BRANCH} --label {TICKET} --agent-name {lowercased ticket ID} --task "Run /frontend-skills:implement {TICKET}. You are already in a dedicated worktree on branch {BRANCH}, created from origin/develop — skip its step 4 (Create Branch) entirely; never create or switch branches. Dependency install and codegen are running in terminal {setup}; before any codegen, lint, type-check, or build step, run: hc read {setup} | grep -q SETUP-DONE || hc wait {setup} --output SETUP-DONE. Do NOT commit, push, or create a PR — skip steps 8 (Lint, Commit & Push) and 9 (Create PR); instead run task agent:check, fix what it reports, and leave all changes uncommitted in the working tree for local review. End with the step 10 summary; the user will review the diff and drive commit/push/PR themselves."
```

From its JSON take `{SPACE}` = `space_id`, `{PATH}` = `checkout_path`, `{AGENT_NAME}` = `agent_name`, `{SENT}` = `task_sent`. If `{SENT}` is `false`, Claude was not idle within 30 s so nothing was sent: run `hc read {AGENT_NAME}` to see why (usually the folder-trust prompt), tell the user, and once Claude is idle send the same prompt with `hc send {AGENT_NAME} --if idle "..."`.

## 3. Summary

Do not wait for implementation. Report per ticket:

| Ticket | Branch | Space | Agent | Path |
| ------ | ------ | ----- | ----- | ---- |

Tell the user the space appears in the app sidebar nested under the repo, named after its checkout folder, and that `hc ls` shows agent states. The agent stops with changes uncommitted; the user reviews the diff in the hunk pane and drives commit/push/PR. Teardown after merge: `~/.claude/skills/checkout/teardown.sh {PATH} --delete-branch`.
