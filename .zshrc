# zmodload zsh/zprof

# Ensure no duplicate entries in PATH
typeset -U PATH

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

# Editor
export EDITOR="cursor -w"

# Homebrew
export HOMEBREW_CASK_OPTS="--no-quarantine"

# PATH configuration (consolidated)
export PATH="/usr/local/bin:$PATH"
export PATH="/usr/local/share/python:$PATH"
export PATH="$HOME/.deno/bin:$PATH"
export PATH="$HOME/scripts:$PATH"
export PATH="/usr/local/bin/docker:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export PATH="$HOME/.rd/bin:$PATH"
export PATH="$HOME/.opencode/bin:$PATH"

# bun
export BUN_INSTALL="$HOME/.bun"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac

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

# macOS fork safety (needed for some Python multiprocessing)
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

# Source additional configuration files
[[ -f ~/.dotfiles/aliases ]] && source ~/.dotfiles/aliases
[[ -f ~/.secrets ]] && source ~/.secrets

if [[ -d ~/zshrc-scripts ]]; then
    for file in ~/zshrc-scripts/*.zsh(N) ~/zshrc-scripts/*(.N); do
        [[ -f "$file" ]] && source "$file"
    done
fi

if [[ -d ~/scripts/work ]]; then
    for file in ~/scripts/work/*(.N); do
        [[ -f "$file" ]] && source "$file"
    done
fi

# Additional environment
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"

# zprof
