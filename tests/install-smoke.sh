#!/usr/bin/env bash
set -euo pipefail
# This script runs only inside a disposable verification container.
case_home="$(mktemp -d)"
chown ctf:ctf "$case_home"
setpriv --reuid=1001 --regid=1001 --clear-groups --no-new-privs env HOME="$case_home" USER=ctf clite system install hello
setpriv --reuid=1001 --regid=1001 --clear-groups --no-new-privs "$case_home/.local/opt/sysroot/usr/bin/hello"
setpriv --reuid=1001 --regid=1001 --clear-groups --no-new-privs env HOME="$case_home" USER=ctf clite system upgrade
