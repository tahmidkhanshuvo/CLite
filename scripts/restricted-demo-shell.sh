#!/usr/bin/env bash
set -u

cd "$HOME" || exit 1

export PATH="/usr/local/bin:/usr/bin:/bin"
export PS1="demo:\w$ "

cat <<'BANNER'
  ____ _     _ _
 / ___| |   (_) |_ ___
| |   | |   | | __/ _ \
| |___| |___| | ||  __/
 \____|_____|_|\__\___|

CLite v0.1 Beta
Creator: Tahmid Khan
Public Demo Mode
Use only for legal CTF/lab targets.

Allowed commands: ls, cd, pwd, cat, grep, find, echo, file, strings, base64, python3, clear, help, exit
This demo shell blocks shell metacharacters and network/admin/package commands.
BANNER

allowed_command() {
  case "$1" in
    ls|pwd|cat|grep|find|echo|file|strings|base64|python3|clear|help|exit) return 0 ;;
    *) return 1 ;;
  esac
}

inside_home() {
  local target resolved_home resolved_target
  target="${1:-$HOME}"
  resolved_home="$(realpath -m "$HOME")"
  resolved_target="$(realpath -m "$PWD/$target")"
  [[ "$resolved_target" == "$resolved_home" || "$resolved_target" == "$resolved_home"/* ]]
}

print_help() {
  echo "Allowed: ls cd pwd cat grep find echo file strings base64 python3 clear help exit"
  echo "Demo sessions are temporary and limited. Team mode provides a fuller non-root bash."
}

while true; do
  printf "%s" "$PS1"
  IFS= read -r line || break

  [[ -z "${line// }" ]] && continue

  if [[ "$line" =~ [\;\&\|\`\<\>] || "$line" == *'$('* || "$line" == *'${'* ]]; then
    echo "Blocked in public demo mode."
    continue
  fi

  if ! mapfile -d '' -t argv < <(python3 -c 'import shlex, sys
try:
    parts = shlex.split(sys.argv[1])
except ValueError:
    sys.exit(1)
for part in parts:
    print(part, end="\0")
' "$line"); then
    echo "Could not parse command."
    continue
  fi

  [[ "${#argv[@]}" -eq 0 ]] && continue
  cmd="${argv[0]}"

  case "$cmd" in
    cd)
      target="${argv[1]:-$HOME}"
      if inside_home "$target"; then
        cd "$target" 2>/dev/null || echo "cd: no such directory"
      else
        echo "cd: public demo is limited to this temporary home"
      fi
      ;;
    help)
      print_help
      ;;
    exit)
      exit 0
      ;;
    *)
      if ! allowed_command "$cmd"; then
        echo "Command not available in public demo mode: $cmd"
        continue
      fi
      if [[ "$cmd" == "python3" ]]; then
        timeout 8s "$cmd" "${argv[@]:1}"
      else
        timeout 8s "$cmd" "${argv[@]:1}"
      fi
      ;;
  esac
done
