function gfm
    git fetch origin $argv[1]
    git merge $argv[1] --no-edit
end
