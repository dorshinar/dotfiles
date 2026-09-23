# Sourced by every fish (interactive or not), mirroring ~/.zshenv.

set -gx EDITOR "code -w"
set -gx HOMEBREW_CASK_OPTS --no-quarantine
set -gx BUN_INSTALL $HOME/.bun
set -gx PNPM_HOME $HOME/Library/pnpm
set -gx OBJC_DISABLE_INITIALIZE_FORK_SAFETY YES

# Highest priority first; missing dirs are skipped
fish_add_path -gmP \
    $PNPM_HOME \
    $HOME/.browser-use-env/bin \
    $HOME/.local/bin \
    $HOME/.opencode/bin \
    $HOME/.rd/bin \
    $HOME/.bun/bin \
    /usr/local/bin/docker \
    $HOME/scripts \
    $HOME/.deno/bin \
    /usr/local/share/python \
    /usr/local/bin \
    /opt/homebrew/bin

test -f $HOME/.local/bin/env.fish; and source $HOME/.local/bin/env.fish

# The zsh versions of these are sh files; only their `export KEY=VALUE` lines are portable
__source_sh_exports ~/.secrets ~/scripts/work/*.sh
for f in ~/.secrets.fish ~/zshrc-scripts/*.fish ~/scripts/work/*.fish
    test -f $f; and source $f
end
