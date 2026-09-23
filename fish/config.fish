# Interactive-only setup, mirroring ~/.zshrc. Env, PATH, aliases live in conf.d/;
# functions autoload from functions/. Syntax highlighting, autosuggestions,
# history dedup/sharing, auto-cd and interactive comments are fish built-ins.

status is-interactive; or exit

set -g fish_greeting
set -g fish_color_comment normal

# ctrl+w kills to a word boundary rather than a whole path component
bind ctrl-w backward-kill-word

# shift+arrows select like zsh-shift-select; backspace/delete remove the selection
bind shift-left '__shift_select backward-char'
bind shift-right '__shift_select forward-char'
bind alt-shift-left '__shift_select backward-word'
bind alt-shift-right '__shift_select forward-word'
bind shift-home '__shift_select beginning-of-line'
bind shift-end '__shift_select end-of-line'
bind left '__shift_unselect backward-char'
bind right '__shift_unselect forward-char'
bind alt-left '__shift_unselect backward-word'
bind alt-right '__shift_unselect forward-word'
bind alt-b '__shift_unselect backward-word'
bind alt-f '__shift_unselect forward-word'
bind ctrl-a '__shift_unselect beginning-of-line'
bind ctrl-e '__shift_unselect end-of-line'
bind home '__shift_unselect beginning-of-line'
bind end '__shift_unselect end-of-line'
bind backspace '__shift_delete backward-delete-char'
bind delete '__shift_delete delete-char'

set -gx _ZO_FZF_OPTS "--preview 'eval \"cd {2}\" 2>/dev/null; b=\$(git branch --show-current 2>/dev/null); if [ -n \"\$b\" ]; then echo \" \$b\"; else echo \"(not a git repo)\"; fi' --preview-window=down:1:wrap"

type -q zoxide; and zoxide init fish | source
type -q fzf; and fzf --fish | source
type -q fnm; and fnm env --use-on-cd --shell fish | source
type -q starship; and starship init fish | source
