alias nrd "npm run dev"

# Git shortcuts
alias gps "git push"
alias gpl "git pull"
alias gco "git checkout"
alias gmm "git merge master --no-edit"
alias gfmm "git fetch origin master && git merge origin/master --no-edit"
alias gmd "git merge develop --no-edit"
alias gfmd "git fetch origin develop && git merge origin/develop --no-edit"
alias gcd "git checkout develop"
alias gcm "git checkout master"
alias gcdp "gcd && gpl"
alias gcmp "gcm && gpl"
alias gmc "git merge --continue"
alias gma "git merge --abort"
alias gc- "git checkout -"
alias gsd "git stash && gcdp && gsp"
alias gsl "git stash && gpl && gsp"
alias gsp "git stash pop"
alias gsmd "git stash && gfmd && gsp"
alias gec 'git commit -anm "empty" --allow-empty && gps --no-verify'
alias px "pnpm dlx"

alias pr "gh pr create"
alias prm "gh pr create --base master"

alias c code
# LiteLLM proxy for claude (Vertex + Azure GPT via /model) — uncomment to re-enable
# alias claude "$HOME/litellm-proxy/claude-proxy --dangerously-skip-permissions"

# General Shortcuts
alias kn "killall -9 node"
alias cat bat
