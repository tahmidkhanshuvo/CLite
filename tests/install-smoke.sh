#!/usr/bin/env bash
set -euo pipefail
set -a
source /app/.env.example
set +a
# This script runs only inside a disposable verification container.
case_home="$(mktemp -d)"
chown ctf:ctf "$case_home"
setpriv --reuid="$CTF_UID" --regid="$CTF_GID" --clear-groups --no-new-privs env HOME="$case_home" USER=ctf clite system install hello
setpriv --reuid="$CTF_UID" --regid="$CTF_GID" --clear-groups --no-new-privs "$case_home/.local/opt/sysroot/usr/bin/hello"
setpriv --reuid="$CTF_UID" --regid="$CTF_GID" --clear-groups --no-new-privs env HOME="$case_home" USER=ctf clite system upgrade
