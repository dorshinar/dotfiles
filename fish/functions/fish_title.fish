# Terminal title: git repo name (plus path inside it) or the last 2 directories
function fish_title
    set -l git_root (git rev-parse --show-toplevel 2>/dev/null)
    if test -n "$git_root"
        set -l rel (string replace -- $git_root '' $PWD)
        if test -z "$rel"; or test "$rel" = /
            echo (path basename $git_root)
        else
            echo (path basename $git_root)$rel
        end
        return
    end
    set -l parts (string split / -- (string replace -- $HOME '~' $PWD))
    set -l parts (string match -v '' -- $parts)
    if test (count $parts) -eq 0
        echo /
    else
        string join / -- $parts[-2..-1]
    end
end
