#!/bin/bash
set -euo pipefail

die() { echo "new-workspace: $*" >&2; exit 1; }

BRANCH="" LABEL="" BASE="origin/develop" AGENT_NAME="" WT_PATH="" EXISTING=0 NO_HUNK=0
WORKTREES_DIR="${WORKTREES_DIR:-$HOME/Code/wiz/wiz-worktrees}"
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --agent-name) AGENT_NAME="$2"; shift 2 ;;
    --path) WT_PATH="$2"; shift 2 ;;
    --existing) EXISTING=1; shift ;;
    --no-hunk) NO_HUNK=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$BRANCH" ] || die "--branch is required"
[ "${HERDR_ENV:-}" = 1 ] || die "not running inside a Herdr pane"
command -v herdr >/dev/null 2>&1 || die "herdr not found in PATH"
command -v python3 >/dev/null 2>&1 || die "python3 not found in PATH"

LABEL="${LABEL:-$BRANCH}"
if [ -z "$AGENT_NAME" ]; then
  AGENT_NAME=$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]' | cut -c1-32)
fi
printf '%s' "$AGENT_NAME" | grep -qE '^[a-z][a-z0-9_-]{0,31}$' || die "invalid agent name: $AGENT_NAME"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository"

if [ "$EXISTING" = 1 ]; then
  git show-ref --verify --quiet "refs/heads/$BRANCH" || die "--existing given but no local branch: $BRANCH"
elif git show-ref --verify --quiet "refs/heads/$BRANCH" || git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  die "branch already exists: $BRANCH (use --existing to open a workspace on it)"
fi

if [ -z "$WT_PATH" ]; then
  SHORT=$(printf '%s' "$BRANCH" | grep -oE '^[A-Z]+-[0-9]+' | tr '[:upper:]' '[:lower:]' || true)
  SHORT="${SHORT:-$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')}"
  WT_PATH="$WORKTREES_DIR/$(basename "$REPO_ROOT")/$SHORT"
fi
[ -e "$WT_PATH" ] && die "worktree path already exists: $WT_PATH"

if [ "$EXISTING" != 1 ]; then
  case "$BASE" in
    origin/*) git fetch --quiet origin "${BASE#origin/}" || die "failed to fetch $BASE" ;;
  esac
fi

json_field() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d = d[k]
print(d)
' "$1"
}

if [ "$EXISTING" = 1 ]; then
  CREATE=$(herdr worktree create --cwd "$REPO_ROOT" --branch "$BRANCH" --label "$LABEL" --path "$WT_PATH" --no-focus)
else
  CREATE=$(herdr worktree create --cwd "$REPO_ROOT" --branch "$BRANCH" --base "$BASE" --label "$LABEL" --path "$WT_PATH" --no-focus)
fi
WS=$(printf '%s' "$CREATE" | json_field result.workspace.workspace_id)
P1=$(printf '%s' "$CREATE" | json_field result.root_pane.pane_id)
ROOT=$(printf '%s' "$CREATE" | json_field result.workspace.worktree.checkout_path)
WEB="$ROOT/web"
[ -d "$WEB" ] || die "no web/ directory in $ROOT"

# --ratio gives that share to the original pane: rows first (85/15), then columns (50/50)
P2=$(herdr pane split "$P1" --direction down --ratio 0.85 --cwd "$WEB" --no-focus | json_field result.pane.pane_id)
P3=$(herdr pane split "$P1" --direction right --ratio 0.5 --cwd "$WEB" --no-focus | json_field result.pane.pane_id)
P4=$(herdr pane split "$P2" --direction right --ratio 0.5 --cwd "$WEB" --no-focus | json_field result.pane.pane_id)

# trailing read drains OSC/CPR query replies that tools emit but exit before consuming
herdr pane run "$P2" "task install codegen && echo SETUP-DONE; sleep 1; while read -rs -t 0.2 -k 1 _; do :; done" >/dev/null
[ "$NO_HUNK" = 1 ] || herdr pane run "$P3" "hunk diff --watch" >/dev/null
herdr pane run "$P1" "cd web" >/dev/null

# the shell may still be running `cd web` when agent start validates the pane
STARTED=0 AGENT_ERR=""
for _ in 1 2 3 4 5; do
  if AGENT_ERR=$(herdr agent start "$AGENT_NAME" --kind claude --pane "$P1" 2>&1 >/dev/null); then
    STARTED=1
    break
  fi
  sleep 2
done
[ "$STARTED" = 1 ] || die "failed to start claude agent in $P1: $AGENT_ERR"

python3 -c '
import json, sys
ws, root, p1, p2, p3, p4, agent = sys.argv[1:8]
print(json.dumps({
    "workspace_id": ws,
    "checkout_path": root,
    "panes": {"top_left": p1, "top_right": p3, "bottom_left": p2, "bottom_right": p4},
    "agent_name": agent,
    "setup_done_marker": "SETUP-DONE",
}, indent=2))
' "$WS" "$ROOT" "$P1" "$P2" "$P3" "$P4" "$AGENT_NAME"
