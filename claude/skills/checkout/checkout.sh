#!/bin/bash
# Create a git worktree and open it as a Herdr app space through herdr-core (hc).
# Terminals carrying herdr.space/herdr.tab labels are adopted by the app; terminals that
# share a tab label sit side by side. Layout: one tab, Claude (web/) on the left and a shell
# on the right that runs `task install codegen`, prints SETUP-DONE, then starts hunk.
set -euo pipefail

die() { echo "checkout: $*" >&2; exit 1; }

BRANCH="" LABEL="" KIND="" BASE="origin/develop" AGENT_NAME="" WT_PATH="" TASK="" NO_HUNK=0
# Extra arguments for the claude launch, e.g. a permission mode. Empty by default: set
# CHECKOUT_CLAUDE_ARGS in your shell profile or pass --claude-args to change it.
CLAUDE_ARGS="${CHECKOUT_CLAUDE_ARGS:-}"
WORKTREES_DIR="${WORKTREES_DIR:-$HOME/Code/wiz/wiz-worktrees}"
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;        # accepted for callers; the app names a space after its checkout
    --kind) KIND="$2"; shift 2 ;;          # "review": the app's sidebar lists the space under its repo's Review row
    --base) BASE="$2"; shift 2 ;;
    --agent-name) AGENT_NAME="$2"; shift 2 ;;
    --path) WT_PATH="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;          # Claude's first message, sent via hc once idle; "{setup}" expands to the setup terminal
    --claude-args) CLAUDE_ARGS="$2"; shift 2 ;;
    --no-hunk) NO_HUNK=1; shift ;;         # the right pane stays a shell after setup
    --no-focus) shift ;;                    # focusing a space is app-only; kept so old callers work
    -*) die "unknown argument: $1" ;;
    *) [ -z "$BRANCH" ] || die "unexpected argument: $1"; BRANCH="$1"; shift ;;
  esac
done

[ -n "$BRANCH" ] || die "usage: checkout.sh <branch> [--label TEXT] [--kind review] [--base REF] [--agent-name NAME] [--path PATH] [--task TEXT] [--claude-args ARGS] [--no-hunk]"
command -v hc >/dev/null 2>&1 || die "hc (herdr-core) not found in PATH"
command -v jq >/dev/null 2>&1 || die "jq not found in PATH"
hc server status --json >/dev/null 2>&1 || die "herdr-core is not running"

AGENT_NAME="${AGENT_NAME:-$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-' | cut -c1-32)}"
printf '%s' "$AGENT_NAME" | grep -qE '^[a-z0-9][a-z0-9_-]{0,31}$' || die "agent name must be 1-32 of a-z 0-9 - _: $AGENT_NAME"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository"

if [ -z "$WT_PATH" ]; then
  SHORT=$(printf '%s' "$BRANCH" | grep -oiE '^[a-z]+-[0-9]+' | tr '[:upper:]' '[:lower:]' || true)
  WT_PATH="$WORKTREES_DIR/$(basename "$REPO_ROOT")/${SHORT:-$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')}"
  CANDIDATE="$WT_PATH" N=2
  while [ -e "$WT_PATH" ]; do WT_PATH="$CANDIDATE-$N"; N=$((N + 1)); done
fi
[ ! -e "$WT_PATH" ] || die "path exists: $WT_PATH"

# An existing branch (local or on origin) is reused as-is; anything else branches off BASE.
ADD=(git -C "$REPO_ROOT" worktree add)
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  ADD+=("$WT_PATH" "$BRANCH")
elif git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  ADD+=(--track -b "$BRANCH" "$WT_PATH" "origin/$BRANCH")
else
  case "$BASE" in origin/*) git -C "$REPO_ROOT" fetch --quiet origin "${BASE#origin/}" || die "failed to fetch $BASE" ;; esac
  ADD+=(--no-track -b "$BRANCH" "$WT_PATH" "$BASE")
fi
OUT=$("${ADD[@]}" 2>&1) || die "git worktree add failed: $OUT"
ROOT="$WT_PATH"
WEB="$ROOT/web"
[ -d "$WEB" ] || die "no web/ directory in $ROOT"

SPACE="sp$(openssl rand -hex 16)"
TAB="tb$(openssl rand -hex 16)"
# Every terminal of the space carries the kind, so the sidebar can tell review worktrees apart.
KIND_LABEL=()
[ -z "$KIND" ] || KIND_LABEL=(--label "kind=$KIND")

# A shell pane: hc starts the machine's shell; the command is typed into it like the TUI did,
# so the pane stays a shell afterwards (hc --keep only covers lost programs, not exits).
shell_pane() { local tab="$1"; shift; hc run --bg --no-parent --json --cwd "$WEB" --label "herdr.space=$SPACE" --label "herdr.tab=$tab" "${KIND_LABEL[@]}" "$@" | jq -r .address; }
type_into() { local t="$1" cmd="$2" n; for n in 1 2 3 4 5; do hc send "$t" "$cmd" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }

# The setup shell gets a name so Claude's task can refer to it before it exists; Claude is
# started first so it is the tab's left pane.
SETUP_NAME="setup-$(printf '%s' "$AGENT_NAME" | cut -c1-26)"
TASK="${TASK//\{setup\}/$SETUP_NAME}"
RUN=(hc run --bg --no-parent --json --name "$AGENT_NAME" --cwd "$WEB" --label "herdr.space=$SPACE" --label "herdr.tab=$TAB" "${KIND_LABEL[@]}" -- claude)
read -ra CA <<<"$CLAUDE_ARGS"
[ "${#CA[@]}" -eq 0 ] || RUN+=("${CA[@]}")
LAUNCH=$("${RUN[@]}" 2>&1) || die "failed to start claude agent: $LAUNCH"
CLAUDE=$(jq -r .address <<<"$LAUNCH")

# The app places adopted terminals in the order it discovers them. Wait until Claude's pane
# exists (the app stamps a `where` label on adoption) so the next terminal lands to its right.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -n "$(hc get "$CLAUDE" --json 2>/dev/null | jq -r '.labels.where // empty')" ] && break
  sleep 0.5
done

SETUP=$(shell_pane "$TAB" --name "$SETUP_NAME") || die "cannot open setup shell"
# trailing read drains OSC/CPR query replies that tools emit but exit before consuming
SETUP_CMD="task install codegen && echo SETUP-DONE; sleep 1; while read -rs -t 0.2 -k 1 _; do :; done"
[ "$NO_HUNK" = 1 ] || SETUP_CMD="$SETUP_CMD; hunk diff --watch"
type_into "$SETUP" "$SETUP_CMD" || die "setup shell did not accept input"

# The task goes in through hc once Claude reports idle (its SessionStart hook sets the state),
# never as a command-line prompt: hc then confirms delivery in its JSON, refuses to type into a
# blocked Claude (folder-trust prompt), and can never produce a second copy. Claude's boot
# overlapped with the setup pane above, so the wait is usually already over.
TASK_SENT="n/a"
if [ -n "$TASK" ]; then
  TASK_SENT=false
  for _ in $(seq 1 60); do
    [ "$(hc get "$CLAUDE" --json 2>/dev/null | jq -r '.status.state // empty')" = idle ] && break
    sleep 0.5
  done
  SENT=$(hc send "$CLAUDE" "$TASK" --if idle --json 2>/dev/null) && [ "$(jq -r '.started // false' <<<"$SENT")" = true ] && TASK_SENT=true
fi

HUNK=""
[ "$NO_HUNK" = 1 ] || HUNK="$SETUP"

jq -n --arg sp "$SPACE" --arg root "$ROOT" --arg branch "$BRANCH" --arg agent "$AGENT_NAME" \
  --arg claude "$CLAUDE" --arg hunk "$HUNK" --arg setup "$SETUP" --arg sent "$TASK_SENT" \
  '{space_id: $sp, checkout_path: $root, branch: $branch, agent_name: $agent,
    terminals: {claude: $claude, hunk: (if $hunk == "" then null else $hunk end), setup: $setup},
    task_sent: (if $sent == "true" then true elif $sent == "false" then false else null end),
    setup_done_marker: "SETUP-DONE",
    wait_for_setup: ("hc read " + $setup + " | grep -q SETUP-DONE || hc wait " + $setup + " --output SETUP-DONE"),
    teardown: ("~/.claude/skills/checkout/teardown.sh " + $root + " --delete-branch")}'
