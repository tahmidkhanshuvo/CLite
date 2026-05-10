# CLite v1.0 Public Demo

CLite means CLI Lite.

This demo gives you a guided browser terminal for Linux basics, text inspection, and small CTF-style exercises.

Need help? Contact admin@tahmidkhan.com.bd.

## Quick Start

| Command | What it is used for |
| --- | --- |
| `pwd` | Show the current directory. |
| `ls` | List files and folders. |
| `cd exercises` | Move into the demo exercise folder. |
| `cat README.md` | Print a file to the terminal. |
| `help` | Show the available demo commands. |
| `clear` | Clear the terminal screen. |

## Available Tools

| Tool | What it is used for |
| --- | --- |
| `ls` | List directory contents. |
| `cd` | Change directory inside the demo workspace. |
| `pwd` | Print the current path. |
| `cat` | Read file contents. |
| `head` | Show the first lines of a file. |
| `tail` | Show the last lines of a file. |
| `grep` | Search text inside files. |
| `rg` | Search text quickly inside files. |
| `find` | Locate files and folders. |
| `fdfind` | Quickly locate files and folders. |
| `echo` | Print text or test shell output. |
| `printf` | Print formatted text. |
| `sed` | Edit streams of text. |
| `awk` / `gawk` | Process columns and structured text. |
| `cut` | Select text columns and fields. |
| `tr` | Translate or delete characters. |
| `nl` | Number lines. |
| `wc` | Count lines, words, and bytes. |
| `sort` | Sort lines of text. |
| `uniq` | Collapse repeated adjacent lines. |
| `comm` | Compare sorted text files line by line. |
| `diff` | Compare text files. |
| `cmp` | Compare files byte by byte. |
| `jq` | Read and transform JSON. |
| `file` | Identify file types. |
| `strings` | Extract readable strings from binary-like files. |
| `base64` | Encode or decode Base64 text. |
| `xxd` | View file bytes as hex. |
| `md5sum` / `sha1sum` / `sha256sum` | Calculate file hashes. |
| `tar` / `gzip` / `gunzip` | Work with tarballs and gzip files. |
| `zip` / `unzip` | Work with ZIP archives. |
| `basename` / `dirname` | Inspect path components. |
| `stat` | Show file metadata. |
| `df` / `du` | Inspect disk usage. |
| `python3` | Run small Python snippets and scripts. |
| `tree` | Show a folder as a directory tree. |
| `batcat` | Read files with syntax highlighting. |
| `fastfetch` | Display system information. |
| `uname` | Show kernel/system details. |
| `whoami` / `id` | Show the current session identity. |
| `env` / `printenv` | Show environment variables. |
| `ps` | Show current processes. |
| `free` | Show memory usage. |
| `date` | Show the current date and time. |
| `clear` | Clear the terminal. |
| `help` | Show demo command help. |
| `exit` | Close the demo shell. |

## Try This

```bash
pwd
ls
tree
cat exercises/hello.txt
grep -n CLite exercises/hello.txt
sed -n '1,5p' exercises/hello.txt
python3 -c "print('hello from CLite')"
fastfetch
```

Built for ethical CTFs, lab practice, and owned learning environments.
