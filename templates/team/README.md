# CLite v1.0 Team Session

CLite means CLI Lite.

This team shell provides a ready-to-use Linux workspace for CTF practice, command-line learning, and collaborative lab work.

Need help? Contact admin@tahmidkhan.com.bd.

## Quick Start

| Command | What it is used for |
| --- | --- |
| `whoami` | Confirm the session user. |
| `pwd` | Show the current directory. |
| `ls -la` | Inspect files, permissions, and hidden files. |
| `neofetch` | Display system information. |
| `python3 -m venv venv` | Create a local Python virtual environment. |
| `source venv/bin/activate` | Activate the virtual environment. |
| `pip install requests pwntools pycryptodome beautifulsoup4` | Add Python libraries inside this temporary workspace. |

## Core Tools

| Tool | What it is used for |
| --- | --- |
| `bash` | Interactive shell. |
| `coreutils` | Common commands such as `ls`, `cat`, `cp`, `mv`, `rm`, and `mkdir`. |
| `find` | Locate files and directories. |
| `grep` | Search text and logs. |
| `sed` | Stream-edit text. |
| `gawk` | Process structured text and columns. |
| `less` | Page through long output. |
| `tree` | Show directory structure. |
| `tmux` | Manage multiple terminal panes/sessions. |
| `nano` | Simple terminal text editor. |
| `vim.tiny` | Lightweight Vim editor. |
| `file` | Identify file types. |
| `xxd` | Hexdump and inspect bytes. |
| `zip` / `unzip` | Work with ZIP archives. |
| `tar` / `gzip` | Work with tarballs and compressed files. |

## Network And Web Tools

| Tool | What it is used for |
| --- | --- |
| `curl` | Make HTTP requests and test APIs. |
| `wget` | Download files from URLs. |
| `nc` | Connect to TCP/UDP services and simple CTF sockets. |
| `socat` | Advanced socket piping and relays. |
| `ssh` | Connect to remote SSH hosts. |
| `scp` | Copy files over SSH. |
| `sftp` | Interactive file transfer over SSH. |
| `nmap` | Scan owned/lab hosts and services. |
| `dig` / `nslookup` | Query DNS records. |
| `whois` | Look up domain registration details. |
| `ping` | Check basic network reachability. |
| `ip` | Inspect network interfaces and routes. |
| `openssl` | Work with TLS, certificates, hashes, and crypto primitives. |

## Development And CTF Tools

| Tool | What it is used for |
| --- | --- |
| `python3` | Scripting, automation, crypto, parsing, and exploit helpers. |
| `pip` | Install Python packages inside a virtual environment. |
| `pipx` | Run isolated Python CLI tools. |
| `git` | Clone and inspect repositories. |
| `jq` | Parse and transform JSON. |
| `gcc` / `g++` | Compile C and C++ programs. |
| `make` | Run project build recipes. |
| `gdb` | Debug native binaries. |
| `binutils` | Binary utilities such as `objdump`, `readelf`, and `strings`. |
| `strace` | Trace system calls. |
| `ltrace` | Trace library calls. |
| `patchelf` | Inspect or adjust ELF interpreter and RPATH values. |
| `sqlmap` | Test SQL injection in owned/lab targets. |
| `neofetch` | Display system information. |

## Session Notes

| Rule | Details |
| --- | --- |
| User | Browser sessions run as `ctf`, not root. |
| Files | Session files are temporary and are deleted when the session ends. |
| Packages | System package installs with `apt` are not available from the browser shell. |
| Python | Use a virtual environment for Python packages. |
| SSH | SSH client tools are available for outbound connections to systems you own or are authorized to use. |

Built for ethical CTFs, lab practice, and owned learning environments.
