---
name: implement-worktree
description: Implement Jira tickets end-to-end, each in a fresh Herdr worktree workspace created via the new-workspace skill. Clone of frontend-skills:implement that runs the implementation in a dedicated workspace instead of the current checkout.
disable-model-invocation: true
---

# Implement Jira Ticket in a Herdr Worktree Workspace

For each ticket: derive a branch, create a workspace via `/new-workspace`, and hand the workspace's Claude agent the implement workflow. The calling session orchestrates and reports; the workspace agent does the implementation.

## Input

- **Required**: One or more Jira ticket IDs (e.g., `WZ-12345` or `WZ-12345 WZ-12346`)

Each ticket gets its own workspace, branch, and agent. Multiple tickets proceed concurrently — repeat steps 2–5 per ticket.

## Requirements

- `gh` CLI and `acli` CLI installed and authenticated
- `/new-workspace` requirements (running inside Herdr, `[worktrees].directory` configured)

## Workflow

### 1. Pre-flight Checks

**Stop immediately if any fails** — do not attempt to fix.

```bash
gh auth status
acli jira auth status
```

- For `gh`: "GitHub CLI not authenticated. Run `gh auth login` first."
- For `acli`: "Atlassian CLI not authenticated. Run `acli jira auth login` first."

### 2. Fetch Ticket Summary

Fetch only the ticket summary (use `/acli-jira` for syntax) — just enough to derive a branch name. The workspace agent gathers full context (description, parent, comments, attachments) itself in step 4.

### 3. Derive Branch Name

- Format: `WZ-XXXXX-short-description-here`
- Max 10 words after the ticket ID
- Kebab-case, lowercase
- Drop articles (a, an, the) and prepositions if needed to fit
- Compromise grammar for brevity

**Handling branch name collisions:** if taken (locally or remote), try suffixes in order: `-ui`, then `-2`, `-3`, ... until free.

### 4. Create the Workspace and Hand Off

Invoke `/new-workspace` with branch `{BRANCH}`, label `{TICKET}`, and agent name = lowercased ticket ID (e.g., `wz-12345`). From its JSON output record `{WS}` = `workspace_id`, `{P2}` = `panes.bottom_left`, and `{AGENT_NAME}` = `agent_name`.

Then prompt without `--wait` — implementation takes long and the workspace agent owns it from here:

```bash
herdr agent prompt {AGENT_NAME} "Run /frontend-skills:implement {TICKET}. You are already in a dedicated worktree on branch {BRANCH}, created from origin/develop — skip its step 4 (Create Branch) entirely; never create or switch branches. Dependency install and codegen are running in pane {P2}; before any codegen, lint, type-check, or build step, run: herdr pane wait-output {P2} --match SETUP-DONE. Do NOT commit, push, or create a PR — skip steps 8 (Lint, Commit & Push) and 9 (Create PR); instead run task agent:check, fix what it reports, and leave all changes uncommitted in the working tree for local review. End with the step 10 summary; the user will review the diff and drive commit/push/PR themselves."
```

### 5. Final Summary

Do not wait for implementation to finish. Report per ticket:

| Ticket | Branch | Workspace | Agent | Path |
| ------ | ------ | --------- | ----- | ---- |

Tell the user the workspace label to focus in the sidebar, and that `herdr agent list` shows live agent states (`working` / `blocked` / `idle`).

The workspace agent stops after implementation with all changes uncommitted — remind the user to review the diff (the top-right reviewr pane shows it) and drive commit/push/PR themselves.

When a PR merges, tear the workspace down per the `/new-workspace` teardown section (`herdr worktree remove --workspace {WS}`).
