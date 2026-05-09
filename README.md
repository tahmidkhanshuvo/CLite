# CLite

CLite is a lightweight browser-based Linux/CTF web shell. It uses xterm.js in the browser, Node.js/Express/ws on the backend, and node-pty to attach a terminal to temporary bash sessions.

Use only for legal CTF/lab targets.

## Modes

Public Demo Mode is available at `/demo`. It has no login, a short timeout, a max session count, and starts a restricted command loop instead of a full attack shell. It is intended for portfolio visitors and basic Linux learning.

Team Mode is available at `/team?key=TEAM_SECRET`. It uses a shared key from `TEAM_KEY`, starts real non-root bash as user `ctf`, and keeps each session in a temporary home directory.

There is no account system by design. A shared key is simpler for a small team, but rotate it if it leaks.

## Temporary Sessions

For every terminal connection CLite creates:

```text
/tmp/ctf-web-cli/sessions/<session_id>/home
```

Starter files are copied from `/opt/ctf-template`. When the WebSocket disconnects, the session times out, or the idle timer expires, CLite kills the pty and removes the session directory with `fs.rm`.

Session IDs are random UUIDs. Session directories use restrictive permissions and the parent sessions directory is not listable. For hostile multi-tenant use, add stronger isolation such as one container per session, nsjail, firejail, gVisor, Kata Containers, or per-session Unix users.

## Security Notes

- Shells are spawned as non-root user `ctf`.
- App secrets are not passed into the shell environment.
- `TEAM_KEY` is only checked by the backend.
- `sudo` and `su` are removed from the Docker image.
- Users do not get privileged containers or Docker socket access.
- `apt install` is not useful to users because they are not root.
- Public demo mode blocks common shell metacharacters and only allows a small command list.
- CLite logs session start/end events, not every typed command.
- Do not mount `/var/run/docker.sock`.
- Do not run this container with `--privileged`.

## Environment Variables

```text
PORT=7860
TEAM_KEY=change-me
MAX_TEAM_SESSIONS=5
MAX_PUBLIC_SESSIONS=2
PUBLIC_TIMEOUT_MINUTES=10
TEAM_TIMEOUT_MINUTES=180
IDLE_TIMEOUT_MINUTES=10
```

## Run Locally

Install Node.js 22 and system build tools needed by `node-pty`.

```bash
npm install
npm start
```

Open:

```text
http://localhost:7860
```

For local non-Docker use, create a Linux user named `ctf` with UID/GID 1001 or set `CTF_UID` and `CTF_GID` to an existing non-root account. Docker is the recommended path.

## Docker

Build:

```bash
docker build -t clite .
```

Run:

```bash
docker run --rm -p 7860:7860 -e TEAM_KEY=test123 clite
```

Open:

```text
http://localhost:7860
```

Team mode:

```text
http://localhost:7860/team?key=test123
```

## Python Packages

Team users may install Python packages inside temporary homes:

```bash
python3 -m venv venv
source venv/bin/activate
pip install requests pwntools pycryptodome beautifulsoup4
```

These packages are deleted when the session is cleaned up.

## Hugging Face Spaces

Create a Space with Docker SDK. Your Space metadata should include:

```yaml
sdk: docker
app_port: 7860
```

Add `TEAM_KEY` as a Space secret. Hugging Face will route traffic to port `7860`.

## Render

Create a Web Service from this repository using Docker.

Set environment variables:

```text
PORT=7860
TEAM_KEY=<strong shared key>
```

Render may provide its own `PORT`; CLite reads `PORT` automatically.

## Oracle Cloud VPS

Install Docker on the VPS, then:

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

Put Nginx or Caddy in front if you need HTTPS. Keep the container unprivileged and do not mount the Docker socket.

## Adding Tools Safely

Edit the `apt-get install` list in `Dockerfile`, rebuild, and redeploy. Prefer command-line tools with small dependency trees. Avoid huge wordlists, GUI/browser tools, and services that need root or background daemons.

Do not add `sudo`. Do not allow users to run `apt`. Keep package installation in the image build step so runtime sessions stay temporary and controlled.

## Troubleshooting

`node-pty` fails during install:

Install compiler tooling. The Dockerfile includes `python3`, `make`, and `g++`.

Terminal connects and immediately closes:

Check container logs for session creation errors. Confirm the `ctf` user exists and that `/tmp/ctf-web-cli/sessions` is writable.

Team mode returns 403:

The `key` query parameter must match `TEAM_KEY`.

`sudo` is missing:

That is intentional. CLite should never expose root shells.

`apt install` fails:

That is intentional. Add required tools to the Dockerfile and rebuild the image.

Public demo blocks a command:

That is intentional. Use Team Mode for fuller CTF tooling.
