# Minimal zsh-shift-select: shift+motion extends a selection, plain motion drops it
function __shift_select --argument-names motion
    if not set -q __shift_selecting
        set -g __shift_selecting 1
        commandline -f begin-selection
    end
    commandline -f $motion
end
