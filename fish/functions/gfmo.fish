function gfmo
    git fetch origin $argv[1]
    git merge origin/$argv[1] --no-edit
end
