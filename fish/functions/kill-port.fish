function kill-port
    lsof -t -i tcp:$argv[1] | xargs kill
end
