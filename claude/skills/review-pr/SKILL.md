---
name: review-pr
description: Review a GitHub PR - analyze changes and add inline comments. Use when reviewing pull requests.
argument-hint: '[pr-number-or-url]'
allowed-tools: Bash(gh:*, git:*), Read, Glob, Grep, Task
metadata:
  author: wiz
  version: '1.0'
---

# Review Pull Request

Review a GitHub PR by analyzing changes and adding comments directly on the PR.

## Instructions

### Step 1: Get PR Information

```bash
# If PR number provided
gh pr view <pr-number> --json title,body,author,baseRefName,headRefName,number

# If no PR number, get PR for current branch
gh pr view --json title,body,author,baseRefName,headRefName,number
```

### Step 2: Get the Diff

```bash
gh pr diff <pr-number>
```

### Step 3: Get Existing Comments

```bash
gh api "repos/{owner}/{repo}/pulls/<pr-number>/comments" \
  --jq '[ .[] | { user: .user.login, diff_hunk, line, start_line, body } ]'
```

### Step 4: Analyze and Read Files

For each changed file, read the full file to understand context:
- Use `Read` tool to examine modified files
- Use `Grep` to find related code patterns
- Check if changes align with existing patterns

### Step 5: Add Inline Comments

For issues or suggestions on specific lines, add inline review comments:

```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments \
  --method POST \
  -f body="Your comment here" \
  -f commit_id="$(gh pr view <pr-number> --json headRefOid -q .headRefOid)" \
  -f path="path/to/file.tsx" \
  -f line=42 \
  -f side="RIGHT"
```

**Parameters:**
- `path`: Relative path to the file from repo root
- `line`: Line number in the new version of the file
- `side`: Use `RIGHT` for additions/modifications, `LEFT` for deletions
- `body`: Your review comment

For multi-line comments:
```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments \
  --method POST \
  -f body="Your comment here" \
  -f commit_id="$(gh pr view <pr-number> --json headRefOid -q .headRefOid)" \
  -f path="path/to/file.tsx" \
  -f start_line=40 \
  -f line=45 \
  -f start_side="RIGHT" \
  -f side="RIGHT"
```

### Step 6: Add General Comments

For comments not tied to specific lines (architecture, approach, missing tests, etc.):

```bash
gh pr comment <pr-number> --body "Your general comment here"
```

### Step 7: Submit Final Review (if requested)

Only submit a formal review verdict if the user asks:

```bash
# Approve
gh pr review <pr-number> --approve

# Request changes
gh pr review <pr-number> --request-changes --body "Summary of required changes"

# Comment only (no approval/rejection)
gh pr review <pr-number> --comment
```

## What to Look For

- Security issues (XSS, injection, exposed secrets)
- Missing error handling
- `any` types in TypeScript
- Missing translations for user-facing strings
- Unnecessary re-renders
- Console.log statements
- Commented-out code
- Missing or incomplete tests
- Deviations from project patterns

## Getting Repo Info

To get owner and repo for API calls:
```bash
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'
```
