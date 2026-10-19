---
name: investigate
description: Investigate a bug report end-to-end - locate the relevant code, validate whether the bug actually reproduces or is a false positive, explain the root cause, and (if real) fix it. Use when the user reports buggy behavior, pastes a bug description, or asks to "investigate", "look into", "debug", or "figure out" why something is broken. Accepts a free-text bug report as the argument.
---

# Investigate

Turn a free-text bug report into a verdict and, when warranted, a fix. The core discipline
is **skepticism**: do not assume the report is correct. Many reports are false positives —
intended behavior, user error, stale expectations, or a misread. Confirm the bug is real by
tracing the actual code path before changing anything.

## Workflow

### 1. Understand the report

Extract from the free text:
- **Symptom** — what the user observes.
- **Expected vs. actual** — what should happen vs. what does.
- **Repro steps / trigger** — the action, input, or state that surfaces it (infer if unstated).
- **Scope** — which page, component, feature, or flow is implicated.

If the report is too vague to locate any code (no feature, no symptom, no error), ask **one**
focused clarifying question rather than guessing. Otherwise proceed.

### 2. Locate the code

Find the code that governs the reported behavior. Search by the user-facing strings, component
names, routes, error messages, or handlers mentioned in the report. Read the relevant files —
don't skim. Trace the full path from trigger (event handler, query, route) to the observed
outcome (render, mutation, side effect). Follow the state and data as they flow.

### 3. Validate — reproduce or refute

This is the heart of the skill. Reason through the traced code path against the report's
expected vs. actual and reach one of two verdicts:

- **CONFIRMED** — the code genuinely produces the wrong behavior. State the exact mechanism:
  which line/condition/state causes it, and under what inputs. Be concrete enough that the
  failure is undeniable ("when `x` is empty, `foo()` returns early and the list never renders").
- **FALSE POSITIVE / NOT REPRODUCIBLE** — the code does not do what the report claims, the
  behavior is intended by design, the expectation is wrong, or the trigger can't occur. Explain
  precisely why, citing the code. **Do not fix anything.**

Prove the verdict by **tracing the code and reasoning**. Only add or run an automated test when
one fits naturally (a test file already covers this unit, or a tiny test cleanly demonstrates
the failure). If the repo has a `/verify` or `/run` skill and observing the live behavior is the
fastest way to settle an ambiguous verdict, use it — otherwise reasoning from the code is enough.

Do not let the report's confidence pull you toward CONFIRMED. If the evidence is genuinely
ambiguous, say so and state what would resolve it, rather than forcing a verdict.

### 4. Explain

Present the situation clearly and concisely, in this order:
1. **Verdict** — CONFIRMED or FALSE POSITIVE, one line.
2. **Root cause** — the mechanism, with `file_path:line` references.
3. **Why it happens** — the conditions/inputs that trigger it (or, for a false positive, why the
   reported behavior can't occur / is intended).

### 5. Fix (only if CONFIRMED)

Apply the fix automatically — no need to stop for approval. Target the **root cause**, not the
symptom. Match the surrounding code's conventions and honor any project instructions (CLAUDE.md,
existing patterns). Keep the change minimal and focused on this bug; don't refactor beyond it.

After editing, if a natural test exists for the fixed unit, add/update it to lock in the fix.
Then run the project's lint/format/type-check **once** on the touched files (per repo
conventions — e.g. `task agent:check` in this repo) and fix anything it reports.

If FALSE POSITIVE: stop after the explanation. Suggest a next step if useful (e.g. "the real
issue may be upstream in X"), but make no code changes.

### 6. Summarize

Close with a short recap: the verdict, the root cause in one sentence, and what changed (files
touched) — or, for a false positive, why no change was made.

## Principles

- **Skepticism first.** The report is a hypothesis, not a fact. Confirm before fixing.
- **Root cause over symptom.** A fix that hides the symptom but leaves the cause is not a fix.
- **Cite the code.** Every claim about behavior should point to a specific file and line.
- **Minimal blast radius.** Change only what the bug requires.
