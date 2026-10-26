# CLite 2.0

CLite is a portable browser CTF workspace: Bun + TypeScript, xterm.js, native PTYs, real Debian Linux and Bash in team mode. Creator: Tahmid Khan. Support: admin@tahmidkhan.com.bd.

## Start

```sh
# Set a unique shared secret of at least 16 characters.
docker build -t clite .
docker run --name clite -p 7860:7860 -e TEAM_KEY='replace-with-a-long-random-key' clite
```

Open http://localhost:7860. Public practice is at `/demo`; sign in through **Team Shell** for the real Linux environment. No client installation is required. Docker is the supported Linux deployment; Bun can serve the public practice shell on Windows too, with Python installed. Windows team fallback is disabled unless `ALLOW_WINDOWS_TEAM=true` is explicitly set for local development.

## What changed

- Native Bun PTYs replace Node and node-pty. The backend is strictly checked TypeScript.
- Five public CTF exercises, hints, flag checks, pipelines, redirects, notes, uploads and downloads.
- Reconnects and page refreshes recover the same shell and workspace for a configurable grace period, including bounded terminal replay.
- Separate demo/team idle deadlines, authoritative countdowns, expiry warnings and an explicit Keep working action. Team tool output refreshes idle activity; resize and transport heartbeat do not. The absolute lifetime remains enforced.
- A session venv and user-local pipx directories let teammates install and update tools without changing other sessions' Python environments.
- `clite` discovers installed tools, checks the profile, scaffolds challenges, installs optional presets and snapshots/restores dependencies.
- User-local Debian package downloads and extraction support additional relocatable tools without root.
- Download workspace exports evidence, scripts, notes and dependency manifests as a ZIP. Save transcript exports this tab's last 2 MiB of terminal text.
- Cookie-based team login avoids putting the shared key into new URLs. WebSocket origins, resume ownership, admission, capacity and payload sizes are checked on the backend.

## Team workflow

```sh
clite tools
clite doctor
clite init warmup
cd ~/challenges/warmup
python3 -c 'import pwn, z3, Crypto, sympy, gmpy2'
pip install PACKAGE
pip install --upgrade PACKAGE
pipx install PACKAGE
pipx upgrade-all
clite install web
clite install forensics
clite system update
clite system install hello
hello
clite system upgrade
clite snapshot
```

Upload challenge files into HOME with the toolbar. Uploads never overwrite existing files. Use `curl`, `wget`, `scp` or `sftp` for larger downloads and transfers. Install portable binaries in `~/.local/bin` or build tools from source with a user prefix. Extra Python presets: `web` (HTTPie), `crypto` (SymPy/gmpy2), `forensics` (oletools/pdfid), `stego` (stegcracker).

`clite system` uses the configured signed Debian repositories. It downloads packages/dependencies and extracts them into `~/.local/opt/sysroot`; it does not run package maintainer scripts or upgrade the container OS. Relocatable executables and libraries work through the profile's PATH/library search paths. Tools needing fixed `/usr` paths, services, kernel features, root privileges or system upgrades belong in the Dockerfile. `sudo`, a privileged container and the Docker socket are not required.

Before ending a session, run `clite snapshot`, then **Download workspace**. To resume work in a new session, upload that ZIP, run `unzip clite-workspace.zip`, then `clite restore`. Restore your own trusted manifests: restoring dependencies executes downloaded packages. Snapshots capture local Python packages, pipx package specs and requested Debian package names. They recreate a useful profile, not a byte-identical VM; package compatibility and availability can change.

Exports include up to 50 MiB / 2000 regular files. Symlinks, `.venv`, `venv`, `.local`, `.cache`, `.tmp`, `node_modules`, `.ssh` and `.gnupg` directories are excluded. Custom binaries in `.local` must be restored separately or installed again; profile manifests record managed package requests. ZIP export does not automatically create a dependency snapshot.

## Tools

The default image includes shell/file utilities, editors, tmux, Git, jq, SQLite, 7-Zip, zstd, curl/wget, SSH clients, netcat, socat, nmap, DNS utilities, OpenSSL, Gobuster, John and hashid. Development/reversing includes GCC/G++, Make/CMake, GDB, binutils, strace/ltrace, patchelf, NASM and checksec. Forensics includes ExifTool, binwalk, foremost, Sleuth Kit, pngcheck, zbar and steghide.

Bundled Python libraries/CLIs: requests, BeautifulSoup, PyCryptodome, Z3, Capstone, Unicorn, ropper, ROPGadget, pwntools, SymPy, gmpy2, Pillow, pyelftools, Scapy and sqlmap. `clite tools` checks actual availability and labels optional commands honestly.

The image uses Debian Trixie's maintained Python 3, with a separate `/opt/ctf-python` venv for shared libraries. Each team session gets its own writable venv referencing the read-only bundle. Debian's system Python is not modified by pip. The default image builds no moving Git HEADs.

For Hashcat, tshark and tcpdump:

```sh
docker build --build-arg INSTALL_HEAVY_TOOLS=true -t clite:full .
```

Offline packet analysis works with appropriate tools. Raw packet capture, GPU cracking, VPN/tunnel interfaces and kernel debugging depend on host permissions/hardware. Render does not become a privileged Linux VM by installing more packages. To add system tools, extend the apt list and rebuild. No tools start background services automatically.

## Public practice

This is an explicit offline practice shell, not Bash. It implements workspace-scoped commands without subprocess execution, arbitrary Python, shell expansion or network access. The previous executable allowlist was not a security boundary: Python, find and other tools could launch arbitrary programs.

```sh
challenges
cat challenges/encoded.txt | base64 -d > answer.txt
cat answer.txt
check encoding 'CLITE{layers_unwrapped}'
hint logs
jq .data.flag challenges/response.json
strings challenges/artifact.bin
echo 'my observations' >> notes.txt
score
help
```

Use `help` for supported commands and flags. Demo grep performs literal matching; demo jq supports `.` and nested object paths. Commands intentionally implement a small documented subset. Writes and uploads are limited to 1 MiB per file, 16 MiB total and 500 files; pipelines and reads are bounded. A demo process has CPU/address-space limits. Team mode provides full Linux command behavior.

## Sessions and deployment

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | 7860 | HTTP/WebSocket port |
| `TEAM_KEY` | unset | At least 16 characters; weak/unset keys disable team mode |
| `MAX_TEAM_SESSIONS` | 5 | Includes connected, detached and starting sessions |
| `MAX_PUBLIC_SESSIONS` | 4 | Public session capacity |
| `TEAM_TIMEOUT_MINUTES` | 480 | Absolute lifetime |
| `PUBLIC_TIMEOUT_MINUTES` | 30 | Absolute lifetime |
| `TEAM_IDLE_TIMEOUT_MINUTES` | 60 | Idle deadline |
| `PUBLIC_IDLE_TIMEOUT_MINUTES` | 15 | Idle deadline |
| `RECONNECT_GRACE_SECONDS` | 300 | Recovery window after disconnect |
| `TIMEOUT_WARNING_SECONDS` | 120 | Warning before the nearest deadline |
| `MAX_UPLOAD_MB` | 10 | Maximum individual upload |
| `SESSION_MAX_PROCESSES` | 256 | Linux account process limit inherited by sessions |
| `SESSION_MAX_FILE_MB` | 512 | Maximum size of files written by a shell process |
| `TRUST_PROXY` | 0 | Trusted reverse-proxy hops; set 1 for Render |
| `BASE_SESSIONS_DIR` | /tmp/ctf-web-cli/sessions | Temporary workspace root |
| `CTF_UID`, `CTF_GID` | 1001 | Must match the image's ctf account |

Legacy `IDLE_TIMEOUT_MINUTES` remains a fallback for both modes; mode-specific settings take precedence. Existing Render variables continue overriding defaults. Set longer team lifetime/idle values for long competitions; capacity and process/file limits are configurable independently of hosting provider.

Transport ping/pong detects dead connections without extending idle deadlines. Input, user-requested Keep working, uploads, and team terminal output count as activity. Keep working cannot extend the absolute lifetime. Silent tasks longer than the idle window need a suitable idle setting. Refreshes preserve the PTY, active jobs and files while the original instance remains alive. Resume tokens stay in tab sessionStorage and are bound to that browser's signed HttpOnly cookie. A token is not a collaboration link; different teammates receive separate homes and shells.

Sessions are temporary and single-instance. End session, shell exit, expiry, disconnect beyond the grace period, service sleep, crash and redeploy can delete work. Render can replace the instance and close WebSockets; reconnect does not recover a destroyed instance. Download important work before a deployment. Multi-instance hosting requires sticky routing plus an external workspace/session architecture; increasing replica count alone will break recovery.

On Render, use the Docker runtime, set `TEAM_KEY` and `TRUST_PROXY=1`, and set health check path `/healthz`. `render.yaml` provides a blueprint. Set `TEAM_TIMEOUT_MINUTES=1440` for a 24-hour lifetime if desired. Existing services retain their environment values; the blueprint does not silently change them. Port comes from Render's environment. There is no guaranteed CPU/RAM reservation per team member on a small host; size the host for the tools you run. No Render-specific restriction is baked into the tool profile.

## Trust boundary

Team mode is for trusted teammates. All team shells run as the same non-root `ctf` account in one container, with separate homes but no per-user filesystem, process, network, memory or disk isolation. A teammate can inspect or interfere with another teammate's processes/files. Deploy separate containers/VMs per participant before offering unrestricted shells to strangers. The practice shell restricts its own operations, but this deployment is not a general hostile multi-tenant sandbox.

The HTTP process starts as root only to prepare/drop session identities. Its environment is not passed into shells. Child sessions clear supplementary groups and enable no-new-privileges. Do not mount secrets, privileged devices or the Docker socket into the tool environment. Package/network operations in trusted shells are intentionally available. No complete command log is collected; start/end events are logged and a bounded replay stays in memory.

## Development and checks

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
python -m unittest discover -s tests -p 'test_*.py'
bun run dev
```

Bun 1.4.4 is the tested runtime. TypeScript is checked separately; execution needs no compilation step. Linux PTY tests run inside the image. CI verifies types, sessions, auth, origins, file transfer, demo confinement and the Docker image. The image installs repository security updates during build; rebuild regularly to receive Python/OS fixes.
