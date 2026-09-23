# ~/.zshenv — sourced for EVERY zsh invocation: login & non-login, interactive &
# NON-interactive. Environment, PATH, aliases and function definitions belong
# here so they're available to scripts, editors, and agent/automation shells —
# not just interactive terminals. Interactive-only setup (oh-my-zsh, prompt,
# keybindings, completion, history) lives in ~/.zshrc.

# Ensure no duplicate entries in PATH (global; the attribute persists into ~/.zshrc)
typeset -U path PATH

# PATH is built in a function so ~/.zshrc can re-apply it on login shells, where
# macOS /etc/zprofile runs path_helper AFTER this file and demotes these custom
# dirs below the system paths. Non-login shells (incl. agent shells) never hit
# path_helper, so this single call is enough for them.
__setup_path() {
  export PATH="/opt/homebrew/bin:$PATH"
  export PATH="/usr/local/bin:$PATH"
  export PATH="/usr/local/share/python:$PATH"
  export PATH="$HOME/.deno/bin:$PATH"
  export PATH="$HOME/scripts:$PATH"
  export PATH="/usr/local/bin/docker:$PATH"
  export PATH="$HOME/.bun/bin:$PATH"
  export PATH="$HOME/.rd/bin:$PATH"
  export PATH="$HOME/.opencode/bin:$PATH"
  export PATH="$HOME/.browser-use-env/bin:$HOME/.local/bin:$PATH"

  case ":$PATH:" in
    *":$PNPM_HOME:"*) ;;
    *) export PATH="$PNPM_HOME:$PATH" ;;
  esac
}

# Editor
export EDITOR="code -w"

# Homebrew
export HOMEBREW_CASK_OPTS="--no-quarantine"

# bun
export BUN_INSTALL="$HOME/.bun"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"

# macOS fork safety (needed for some Python multiprocessing)
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

__setup_path

# Additional environment (Rust/uv etc.; may add to PATH)
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"

# Aliases, secrets, and shell functions — sourced here (not ~/.zshrc) so they're
# available to non-interactive shells too. ~/scripts/work/* is sourced wholesale
# (not tied to any single tool).
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
