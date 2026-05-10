#!/usr/bin/env bash
set -u

cd "$HOME" || exit 1

export PATH="/usr/local/bin:/usr/bin:/bin"

prompt_text() {
  local shown resolved_home resolved_pwd
  resolved_home="$(realpath -m "$HOME")"
  resolved_pwd="$(realpath -m "$PWD")"
  if [[ "$resolved_pwd" == "$resolved_home" ]]; then
    shown="~"
  elif [[ "$resolved_pwd" == "$resolved_home"/* ]]; then
    shown="~/${resolved_pwd#"$resolved_home"/}"
  else
    shown="$PWD"
  fi
  printf "\033[1;32mdemo:%s$ \033[0m" "$shown"
}

cat <<'BANNER'
  ____ _     _ _
 / ___| |   (_) |_ ___
| |   | |   | | __/ _ \
| |___| |___| | ||  __/
 \____|_____|_|\__\___|

CLite v1.0
CLI Lite
Creator: Tahmid Khan
Public Demo Mode
Built for ethical CTFs, lab practice, and owned learning environments.
Need help? admin@tahmidkhan.com.bd

Type help to see available demo commands.
BANNER

allowed_command() {
  case "$1" in
    ls|pwd|cat|grep|rg|find|echo|printf|file|strings|base64|python3|clear|help|exit|fastfetch|tree|head|tail|wc|sort|uniq|xxd|sed|awk|gawk|cut|tr|nl|diff|cmp|comm|jq|basename|dirname|date|uname|whoami|id|env|printenv|ps|free|df|du|stat|md5sum|sha1sum|sha256sum|tar|gzip|gunzip|zip|unzip|batcat|fdfind) return 0 ;;
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
  cat <<'HELP'

CLite Demo Help
---------------

Public Demo commands

| Command group | Available tools | Use for |
| --- | --- | --- |
| Navigation | pwd, ls, cd, tree | Move around and inspect the demo workspace. |
| Reading files | cat, head, tail, file | View text and identify file types. |
| Searching text | grep, rg, find, fdfind | Locate files and search inside content. |
| Text utilities | echo, printf, sed, awk, gawk, cut, tr, nl, wc, sort, uniq, comm | Print, reshape, count, sort, and clean text output. |
| Comparing files | diff, cmp | Compare text or bytes between files. |
| Data parsing | jq | Inspect and transform JSON. |
| Encoding/bytes | base64, strings, xxd, md5sum, sha1sum, sha256sum | Inspect encoded text, binary strings, and checksums. |
| Archives | tar, gzip, gunzip, zip, unzip | Create and inspect local archives. |
| Paths/filesystem | basename, dirname, stat, df, du | Inspect paths, files, and disk usage. |
| Scripting | python3 | Run small Python snippets and scripts. |
| System info | fastfetch, uname, whoami, id, env, printenv, ps, free, date | Show the CLite Linux environment. |
| Terminal | clear, help, exit | Manage the demo shell. |

Team Mode highlights

| Tool group | Team tools | Use for |
| --- | --- | --- |
| Network | curl, wget, nc, socat, nmap, ping, dig, whois, ssh, scp, sftp | Work with owned/lab services and remote hosts. |
| Development | git, python3, pip, pipx, gcc, g++, make, nasm, jq | Build scripts, parse data, assemble, and compile code. |
| Reversing/debugging | gdb, objdump, readelf, strace, ltrace, patchelf, checksec, radare2, xxd, strings | Inspect and debug binaries. |
| Workspace | tmux, nano, vim.tiny, batcat, fdfind, tree, zip, unzip, tar, gzip | Manage files and terminal workflow. |
| Forensics/stego | pngcheck, zbarimg, steghide, binwalk, foremost, sleuthkit tools, exiftool | Inspect challenge files in authorized labs. |
| CTF helpers | sqlmap, ropper, pwntools, z3, capstone, unicorn, fastfetch | Practice against authorized lab targets. |

Team-only in this public demo: ssh, curl, wget, nc, nmap, git, gcc, gdb, radare2, sqlmap, steghide, binwalk, apt, sudo, su.
Demo mode keeps the public shell focused on safe local learning. Team Mode provides the fuller CLite lab shell.

HELP
}

while true; do
  printf "\n"
  prompt_text
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
