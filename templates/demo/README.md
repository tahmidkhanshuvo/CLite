# CLite public CTF practice

Type `challenges` to list five beginner exercises. `hint ID` gives a clue, `check ID FLAG` checks a flag, and `score` shows progress.

Try:

    cat challenges/encoded.txt | base64 -d > answer.txt
    cat answer.txt
    check encoding 'CLITE{layers_unwrapped}'
    cat challenges/rotated.txt | rot13
    grep 200 challenges/access.log | grep CLITE
    jq .data.flag challenges/response.json
    strings challenges/artifact.bin
    mkdir work
    echo 'my findings' >> work/notes.txt

Use the toolbar to upload a file, save terminal output, or download your workspace. Refreshing reconnects to the same session briefly. Work is temporary and can disappear after expiry or a server restart.

This is an offline practice shell with implemented commands, pipelines, and output redirection. It is not Bash. Type `help` for its exact command subset. Paths stay in your workspace; there is no arbitrary Python execution or network access. Team mode offers a real Linux shell, scripting, package installation and the full CTF toolchain.
