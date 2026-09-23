function gntb
    git fetch origin develop
    git switch -c temp-(random) origin/develop
end
