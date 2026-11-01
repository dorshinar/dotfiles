---
name: scratch-workspace
description: Create a throwaway Herdr worktree space for one-offs or experiments not tied to a Jira ticket. Auto-names the branch `scratch-MMDD-HHMM` off origin/develop and uses the standard layout (Claude + a setup-then-hunk pane). Use when the user asks for a scratch, throwaway, experiment, or playground space/workspace/worktree.
---

# Scratch Worktree Space

Do not ask for a branch name. Run the `/checkout` script directly:

```bash
~/.claude/skills/checkout/checkout.sh scratch-$(date +%m%d-%H%M) --label scratch
```

If the user gave a hint ("scratch for testing preload"), append it kebab-cased: `scratch-$(date +%m%d-%H%M)-testing-preload`. Pass `--base {REF}` only if the user names a different base.

Report the JSON result like `/checkout` does. Teardown: `~/.claude/skills/checkout/teardown.sh {checkout_path} --delete-branch`.
