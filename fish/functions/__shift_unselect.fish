function __shift_unselect --argument-names motion
    if set -q __shift_selecting
        set -e __shift_selecting
        commandline -f end-selection
    end
    test -n "$motion"; and commandline -f $motion
end
