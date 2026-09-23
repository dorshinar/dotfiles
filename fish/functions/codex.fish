# Codex uses Azure OpenAI; resolve the key from 1Password only when launching it
function codex
    if test -n "$AZURE_OPENAI_API_KEY"
        command codex $argv
        return
    end
    set -l key (op read 'op://Private/Azure Foundry/credential')
    or begin
        echo "codex: failed to read Azure key from 1Password" >&2
        return 1
    end
    AZURE_OPENAI_API_KEY=$key command codex $argv
end
