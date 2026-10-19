#!/bin/bash
# Open a Herdr workspace on a disposable branch at the head of a PR or branch, for review.
# Usage: review-workspace.sh --kind <thermo|migration> --target <PR URL | PR number | branch> [--dry-run]
set -euo pipefail

die() { echo "review-workspace: $*" >&2; exit 1; }

KIND="" TARGET="" DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --kind) KIND="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
case "$KIND" in thermo|migration) ;; *) die "--kind must be thermo or migration" ;; esac
[ -n "$TARGET" ] || die "--target is required"
command -v gh >/dev/null 2>&1 || die "gh not found in PATH"
command -v jq >/dev/null 2>&1 || die "jq not found in PATH"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository"
WORKTREES_DIR="${WORKTREES_DIR:-$HOME/Code/wiz/wiz-worktrees}"

PR="" TITLE="" PR_URL="" HEAD_REF="" HEAD_SHA="" BASE_REF="origin/develop"
case "$TARGET" in
  http*://github.com/*/pull/*) PR=$(printf '%s' "$TARGET" | sed -E 's#.*/pull/([0-9]+).*#\1#') ;;
  \#[0-9]*|[0-9]*) PR="${TARGET#\#}" ;;
  *)
    HEAD_REF="${TARGET#origin/}"
    PR=$(gh pr list --head "$HEAD_REF" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)
    ;;
esac

if [ -n "$PR" ]; then
  INFO=$(gh pr view "$PR" --json number,title,url,headRefName,headRefOid,baseRefName) || die "cannot read PR $PR"
  TITLE=$(jq -r .title <<<"$INFO")
  PR_URL=$(jq -r .url <<<"$INFO")
  HEAD_REF=$(jq -r .headRefName <<<"$INFO")
  HEAD_SHA=$(jq -r .headRefOid <<<"$INFO")
  BASE_REF="origin/$(jq -r .baseRefName <<<"$INFO")"
  git fetch --quiet origin "pull/$PR/head" || die "failed to fetch PR $PR head"
  git cat-file -e "$HEAD_SHA^{commit}" 2>/dev/null || die "PR head $HEAD_SHA not available after fetch"
else
  git fetch --quiet origin "$HEAD_REF" 2>/dev/null || true
  if git show-ref --verify --quiet "refs/heads/$HEAD_REF"; then
    HEAD_SHA=$(git rev-parse "refs/heads/$HEAD_REF")
  elif git show-ref --verify --quiet "refs/remotes/origin/$HEAD_REF"; then
    HEAD_SHA=$(git rev-parse "refs/remotes/origin/$HEAD_REF")
  else
    die "no local or remote branch named $HEAD_REF"
  fi
fi
git fetch --quiet origin "${BASE_REF#origin/}" || die "failed to fetch $BASE_REF"
MERGE_BASE=$(git merge-base "$BASE_REF" "$HEAD_SHA") || die "no merge base between $BASE_REF and $HEAD_SHA"
FILES=$(git diff --name-only "$MERGE_BASE" "$HEAD_SHA" | wc -l | tr -d ' ')
[ "$FILES" -gt 0 ] || die "no changes between $BASE_REF and $HEAD_REF"

if [ -n "$PR" ]; then
  ID="$PR"; LABEL="$KIND #$PR"
else
  TICKET=$(printf '%s' "$HEAD_REF" | grep -oiE 'wz-[0-9]+' | head -1 | tr '[:upper:]' '[:lower:]' || true)
  ID="${TICKET:-$(printf '%s' "${HEAD_REF##*/}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed -E 's/-+/-/g; s/^-|-$//g')}"
  if [ -n "$TICKET" ]; then LABEL="$KIND ${TICKET^^}"; else LABEL="$KIND $HEAD_REF"; fi
fi
STAMP=$(date +%m%d-%H%M)
REVIEW_BRANCH="review-$KIND-$ID-$STAMP"
WT_PATH="$WORKTREES_DIR/$(basename "$REPO_ROOT")/$REVIEW_BRANCH"

LIVE=$(herdr agent list 2>/dev/null | jq -r '.result.agents[].name // empty' || true)
BASE_NAME=$(printf '%s' "$KIND-$ID" | cut -c1-29)
AGENT_NAME="$BASE_NAME" N=2
while grep -qxF "$AGENT_NAME" <<<"$LIVE"; do AGENT_NAME="$BASE_NAME-$N"; N=$((N + 1)); done

emit() {
  jq -n --arg kind "$KIND" --arg pr "$PR" --arg title "$TITLE" --arg url "$PR_URL" \
    --arg head_ref "$HEAD_REF" --arg head_sha "$HEAD_SHA" --arg base_ref "$BASE_REF" \
    --arg merge_base "$MERGE_BASE" --argjson files "$FILES" --arg review_branch "$REVIEW_BRANCH" \
    --arg label "$LABEL" --arg agent "$AGENT_NAME" --arg path "$WT_PATH" --argjson ws "${1:-null}" \
    '{kind: $kind, pr_number: ($pr | if . == "" then null else tonumber end), pr_title: (if $title == "" then null else $title end),
      pr_url: (if $url == "" then null else $url end), head_ref: $head_ref, head_sha: $head_sha, base_ref: $base_ref,
      merge_base: $merge_base, files_changed: $files, review_branch: $review_branch, label: $label,
      agent_name: $agent, checkout_path: $path} + ($ws // {})'
}

if [ "$DRY_RUN" = 1 ]; then emit; exit 0; fi

# the agent delivers the review in chat; nobody reads the diff in a pane, so skip hunk
WS_JSON=$("$SCRIPT_DIR/new-workspace.sh" --branch "$REVIEW_BRANCH" --base "$HEAD_SHA" \
  --label "$LABEL" --agent-name "$AGENT_NAME" --path "$WT_PATH" --no-hunk)

emit "$WS_JSON"
