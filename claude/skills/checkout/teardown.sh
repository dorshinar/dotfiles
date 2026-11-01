#!/bin/bash
# Close a worktree space opened by checkout.sh: end every terminal of the space (the Herdr app
# drops a space whose terminals are gone), remove the checkout, and optionally delete the branch.
# Usage: teardown.sh <checkout_path | space_id> [--delete-branch] [--force]
set -euo pipefail

die() { echo "teardown: $*" >&2; exit 1; }

TARGET="" DELETE_BRANCH=0 FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --delete-branch) DELETE_BRANCH=1; shift ;;
    --force) FORCE=1; shift ;;
    -*) die "unknown argument: $1" ;;
    *) [ -z "$TARGET" ] || die "unexpected argument: $1"; TARGET="$1"; shift ;;
  esac
done
[ -n "$TARGET" ] || die "usage: teardown.sh <checkout_path | space_id> [--delete-branch] [--force]"
command -v hc >/dev/null 2>&1 || die "hc (herdr-core) not found in PATH"
command -v jq >/dev/null 2>&1 || die "jq not found in PATH"

# `hc ls` omits labels; `--label` filters server-side and `hc get` shows them.
space_terminals() { hc ls --all --json --label "herdr.space=$1" | jq -r '.terminals[].address'; }
if printf '%s' "$TARGET" | grep -qE '^sp[0-9a-f]{32}$'; then
  SPACES="$TARGET"
  WT_PATH=$(hc ls --all --json --label "herdr.space=$TARGET" | jq -r '[.terminals[].cwd] | first // empty')
  [ -n "$WT_PATH" ] || die "no terminal carries herdr.space=$TARGET"
  WT_PATH=$(git -C "$WT_PATH" rev-parse --show-toplevel 2>/dev/null) || die "cannot resolve the checkout of $TARGET"
else
  [ -d "$TARGET" ] || die "no such directory: $TARGET"
  # Terminals report the path they were started with, which may go through a symlink:
  # match both the logical and the physical form.
  WT_PATH=$(cd "$TARGET" && pwd -L)
  PHYS=$(cd "$TARGET" && pwd -P)
  SPACES=""
  for T in $(hc ls --all --json | jq -r --arg p "$WT_PATH" --arg q "$PHYS" '.terminals[] | select(.cwd == $p or .cwd == $q or (.cwd | startswith($p + "/")) or (.cwd | startswith($q + "/"))) | .address'); do
    SP=$(hc get "$T" --json 2>/dev/null | jq -r '.labels["herdr.space"] // empty')
    [ -z "$SP" ] || SPACES="$SPACES $SP"
  done
  SPACES=$(printf '%s\n' $SPACES | sort -u)
fi

# Refuse early if this is the main checkout; a broken worktree still gets its terminals ended below.
if git -C "$WT_PATH" rev-parse --git-dir >/dev/null 2>&1; then
  [ "$(git -C "$WT_PATH" rev-parse --git-dir)" != "$(git -C "$WT_PATH" rev-parse --git-common-dir)" ] || die "$WT_PATH is the main checkout, not a worktree"
fi

ENDED=0
for SP in $SPACES; do
  for T in $(space_terminals "$SP"); do
    STATE=$(hc get "$T" --json 2>/dev/null | jq -r .state) || continue
    if [ "$STATE" = live ]; then hc kill "$T" --json >/dev/null 2>&1 || true; fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      [ "$(hc get "$T" --json 2>/dev/null | jq -r .state)" = finished ] && break
      sleep 1
    done
    hc rm "$T" --json >/dev/null 2>&1 || true
    ENDED=$((ENDED + 1))
  done
done

COMMON=$(git -C "$WT_PATH" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) \
  || die "ended $ENDED terminal(s), but $WT_PATH is no longer a git worktree: delete the directory yourself, then run git worktree prune in the main checkout"
BRANCH=$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
RM=(git --git-dir="$COMMON" worktree remove)
[ "$FORCE" = 1 ] && RM+=(--force)
OUT=$("${RM[@]}" "$WT_PATH" 2>&1) || die "git worktree remove failed (uncommitted changes? rerun with --force): $OUT"
BRANCH_DELETED=false
if [ "$DELETE_BRANCH" = 1 ] && [ -n "$BRANCH" ] && [ "$BRANCH" != HEAD ]; then
  git --git-dir="$COMMON" branch -D "$BRANCH" >/dev/null 2>&1 && BRANCH_DELETED=true
fi

jq -n --arg path "$WT_PATH" --arg branch "$BRANCH" --argjson ended "$ENDED" --argjson deleted "$BRANCH_DELETED" \
  --arg spaces "$(printf '%s' "$SPACES" | tr '\n' ' ')" \
  '{removed_checkout: $path, branch: $branch, branch_deleted: $deleted, terminals_ended: $ended, spaces: ($spaces | split(" ") | map(select(. != "")))}'
