function __shift_delete --argument-names fallback
    if set -q __shift_selecting
        set -e __shift_selecting
        commandline -f kill-selection end-selection
    else
        commandline -f $fallback
    end
end
