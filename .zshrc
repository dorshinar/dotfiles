# zmodload zsh/zprof

# Environment, PATH, aliases and functions live in ~/.zshenv (read by ALL zsh
# invocations, including non-interactive/agent shells). This file is for
# interactive-only setup.

# Path to your oh-my-zsh installation
export ZSH="$HOME/.oh-my-zsh"
export DISABLE_AUTO_UPDATE="true"
export DISABLE_AUTO_TITLE="true"
export ZSH_DISABLE_COMPFIX="true"
zstyle ':omz:update' frequency 7

# Plugins
plugins=(npm brew macos zsh-syntax-highlighting zsh-autosuggestions zsh-shift-select)

source $ZSH/oh-my-zsh.sh
ZSH_HIGHLIGHT_STYLES[comment]='none'

# Re-apply PATH (defined in ~/.zshenv) so our custom dirs sit ahead of the system
# paths that macOS /etc/zprofile's path_helper prepends on login shells, and
# ahead of anything oh-my-zsh added above.
__setup_path

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# History settings
HISTSIZE=50000
SAVEHIST=50000
HISTFILE=~/.zsh_history
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt SHARE_HISTORY
setopt INC_APPEND_HISTORY

# Useful options
setopt AUTO_CD
setopt NO_BEEP
setopt INTERACTIVE_COMMENTS

# Word boundaries for opt+arrow, ctrl+w, etc.: alphanumerics + underscore are
# word chars; separators like - . / $ = break (macOS-native style)
autoload -U select-word-style
select-word-style normal
WORDCHARS='_'

# Completion settings
export ZCACHE="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
[[ -d "$ZCACHE" ]] || mkdir -p "$ZCACHE"

zstyle ':completion:*' rehash true
zstyle ':completion:*' use-cache yes
zstyle ':completion:*' cache-path "$ZCACHE/completion"

# Faster compinit with daily recompilation
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
  compinit
else
  compinit -C
fi

# Tools initialization
export _ZO_FZF_OPTS="--preview 'eval \"cd {2}\" 2>/dev/null; b=\$(git branch --show-current 2>/dev/null); if [ -n \"\$b\" ]; then echo \"\ue702 \$b\"; else echo \"(not a git repo)\"; fi' --preview-window=down:1:wrap"
eval "$(zoxide init zsh)"
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
eval "$(fnm env --use-on-cd)"
eval "$(starship init zsh)"

# Custom terminal title: git repo name or last 2 directories
function set_terminal_title() {
  local title
  local git_root=$(git rev-parse --show-toplevel 2>/dev/null)
  if [[ -n "$git_root" ]]; then
    local repo_name=$(basename "$git_root")
    local rel_path=${PWD#$git_root}
    if [[ -z "$rel_path" || "$rel_path" == "/" ]]; then
      title="$repo_name"
    else
      title="$repo_name${rel_path}"
    fi
  else
    title="${(%):-%2~}"
  fi
  print -Pn "\e]2;${title}\a"
}
add-zsh-hook precmd set_terminal_title

# zprof


# Codex uses Azure OpenAI; resolve the key from 1Password only when launching it
codex() {
  if [[ -z "${AZURE_OPENAI_API_KEY:-}" ]]; then
    local key
    key="$(op read 'op://Private/Azure Foundry/credential')" || { echo "codex: failed to read Azure key from 1Password" >&2; return 1; }
    AZURE_OPENAI_API_KEY="$key" command codex "$@"
  else
    command codex "$@"
  fi
}
