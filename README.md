# CLite

```text
  ____ _     _ _
 / ___| |   (_) |_ ___
| |   | |   | | __/ _ \
| |___| |___| | ||  __/
 \____|_____|_|\__\___|
```

CLite means **CLI Lite**.

CLite v1.0 is a lightweight browser-based Linux/CTF shell. It uses xterm.js in the browser, Node.js/Express/ws on the backend, and node-pty to attach each browser session to a temporary terminal.

Built for ethical CTFs, lab practice, command-line training, and owned learning environments.

Need help? Contact admin@tahmidkhan.com.bd.

Live release:

```text
https://clite.tahmidkhan.com.bd
```

## Release

```text
Version: 1.0.0
Creator: Tahmid Khan
Launch: clite.tahmidkhan.com.bd
```

## Support

For help, feedback, or access questions, contact:

```text
admin@tahmidkhan.com.bd
```

## Runtime

The Docker image is based on:

```text
node:22-bookworm-slim
Debian GNU/Linux 12 Bookworm
```

Browser terminal sessions run as the non-root Linux user:

```text
ctf
```

Session homes are temporary and are removed when the WebSocket disconnects, the session expires, or the idle timer fires.

```text
/tmp/ctf-web-cli/sessions/<session_id>/home
```

## Modes

Public Demo Mode:

- URL: `/demo`
- No login.
- Short timeout.
- Restricted command loop.
- Blocks shell metacharacters, network commands, admin commands, and package management.
- Intended for portfolio visitors and basic Linux practice.
- Allows only safe local commands:

```text
ls cd pwd cat grep find echo file strings base64 python3 neofetch tree
head tail wc sort uniq xxd clear help exit
```

Team Mode:

- URL: `/team?key=TEAM_SECRET`
- Uses the shared `TEAM_KEY`.
- Starts real non-root bash as `ctf`.
- Includes common CTF and Linux tooling.
- Still has no `sudo`, `su`, Docker socket, or root access from the browser.
- Allows the installed command-line tools available in `PATH`, including network clients such as `ssh`, `curl`, `wget`, `nc`, and `nmap`.

## Public vs Team

Public Demo Mode is intentionally limited. It is for showing CLite safely to visitors without giving them a general-purpose shell. It can inspect files, run simple text-processing commands, run small Python snippets, and show system info with `neofetch`.

Team Mode is the real CTF shell. It gives trusted users a normal non-root bash session with the preinstalled toolset. Team users can use outbound network tools and SSH clients, but they still cannot install system packages, use sudo, switch users, or become root from the browser.

## Installed Tools

Core shell and file tools:

```text
bash coreutils findutils grep sed gawk less tar gzip zip unzip file
nano vim-tiny xxd tree tmux procps psmisc net-tools
```

Network and web tools:

```text
curl wget netcat-openbsd socat openssl openssh-client nmap
dnsutils whois iputils-ping iproute2
```

Development and reversing basics:

```text
git jq python3 python3-pip python3-venv pipx
gcc g++ make gdb binutils strace ltrace patchelf
```

CTF helpers:

```text
sqlmap neofetch
```

Python packages can be installed inside a temporary virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
pip install requests pwntools pycryptodome beautifulsoup4
```

These installs are deleted with the session.

## SSH

Users can use SSH as a client in Team Mode:

```bash
ssh user@host
scp file user@host:/tmp/
sftp user@host
```

CLite does not run an SSH server. Incoming SSH access to the container is not enabled. Admin maintenance should be done from the host with Docker:

```bash
docker exec -it -u root clite-app bash
```

## Rules

- Keep CLite focused on ethical CTFs, lab practice, and owned learning environments.
- Browser sessions run as non-root `ctf`.
- `sudo` and `su` are intentionally removed.
- Browser users must not be allowed to run `apt install`.
- Add system packages in the Dockerfile, rebuild, and redeploy.
- Do not mount `/var/run/docker.sock`.
- Do not run the container with `--privileged`.
- Do not store secrets in templates or user-visible session files.
- `TEAM_KEY` is checked only by the backend.
- CLite logs session start/end events, not every typed command.

## Environment Variables

```text
PORT=7860
TEAM_KEY=change-me
MAX_TEAM_SESSIONS=5
MAX_PUBLIC_SESSIONS=2
PUBLIC_TIMEOUT_MINUTES=10
TEAM_TIMEOUT_MINUTES=180
IDLE_TIMEOUT_MINUTES=10
CTF_UID=1001
CTF_GID=1001
BASE_SESSIONS_DIR=/tmp/ctf-web-cli/sessions
```

## Run With Docker

Build:

```bash
docker build -t clite .
```

Run:

```bash
docker run -d --name clite-app -p 7860:7860 -e TEAM_KEY=test123 clite
```

Open:

```text
http://localhost:7860
http://localhost:7860/team?key=test123
http://localhost:7860/demo
```

Production launch:

```text
https://clite.tahmidkhan.com.bd
```

Stop:

```bash
docker stop clite-app
```

Remove:

```bash
docker rm clite-app
```

If port `7860` is already busy:

```bash
docker run -d --name clite-app -p 7862:7860 -e TEAM_KEY=test123 clite
```

Then open:

```text
http://localhost:7862/team?key=test123
```

## Local Development

Docker is the recommended way to run CLite because it gives users a real Linux environment.

For local Node development:

```bash
npm install
npm start
```

On Windows, local development uses a Windows shell fallback. Use Docker or WSL when you need the real Linux CTF environment.

## Deployment

Hugging Face Spaces:

```yaml
sdk: docker
app_port: 7860
```

Set `TEAM_KEY` as a Space secret.

Render:

```text
PORT=7860
TEAM_KEY=<strong shared key>
```

Oracle Cloud VPS:

```bash
git clone <your-repo-url>
cd CLite
docker build -t clite .
docker run -d \
  --name clite \
  --restart unless-stopped \
  -p 7860:7860 \
  -e TEAM_KEY='<strong shared key>' \
  clite
```

Put Nginx or Caddy in front for HTTPS.

## Adding Tools Safely

Edit the `apt-get install` list in `Dockerfile`, rebuild, and redeploy:

```bash
docker build -t clite .
docker rm -f clite-app
docker run -d --name clite-app -p 7860:7860 -e TEAM_KEY=test123 clite
```

Prefer small command-line tools. Avoid huge wordlists, GUI/browser tools, background services, and anything that requires runtime root privileges.

## Troubleshooting

Terminal connects and immediately closes:

Check container logs:

```bash
docker logs clite-app
```

Confirm the `ctf` user exists and `/tmp/ctf-web-cli/sessions` is writable.

Team mode returns 403:

The `key` query parameter must match `TEAM_KEY`.

`sudo` is missing:

That is intentional. CLite should not expose root shells to browser users.

`apt install` fails:

That is intentional. Add packages to the Dockerfile and rebuild.

Public demo blocks a command:

That is intentional. Use Team Mode for fuller CTF tooling.
