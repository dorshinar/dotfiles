function __source_sh_exports --description 'Import plain `export KEY=VALUE` lines from sh files'
    for file in $argv
        test -f $file; or continue
        while read -l line
            set -l m (string match -r '^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -- $line); or continue
            set -l val (string trim -c '"\'' -- $m[3])
            set -gx $m[2] (string replace -a '$HOME' $HOME -- $val)
        end <$file
    end
end
