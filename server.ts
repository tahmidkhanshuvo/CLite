"use strict";

import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import http, { type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import express, { type Request, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { WebSocketServer, type WebSocket } from "ws";
import { loadConfig, type Config } from "./lib/config";
import { SessionManager, send, safeEqual, size, type SpawnSession, type Mode } from "./lib/sessions";
import { spawnTerminal } from "./lib/terminal";
import storyHeaders from "./data/story-headers.json";

dotenv.config({ quiet: true });

const WINDOWS = process.platform === "win32";
const PYTHON = WINDOWS ? "python" : "/usr/bin/python3";
const ROOT = import.meta.dir;
const ASCII = String.raw`  ____ _     _ _
 / ___| |   (_) |_ ___
| |   | |   | | __/ _ \
| |___| |___| | ||  __/
 \____|_____|_|\__\___|`;
const BASHRC = `
cat <<'CLITE_ART'
${ASCII}
CLITE_ART
export PATH="$HOME/.local/bin:$HOME/.venv/bin:$HOME/.local/opt/sysroot/usr/bin:$HOME/.local/opt/sysroot/bin:$HOME/.local/opt/sysroot/usr/games:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/games"
export PIPX_HOME="$HOME/.local/share/pipx" PIPX_BIN_DIR="$HOME/.local/bin"
export XDG_CACHE_HOME="$HOME/.cache" XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share"
export HISTFILE="$HOME/.bash_history" HISTSIZE=10000 HISTFILESIZE=20000
export VIRTUAL_ENV="$HOME/.venv"
__clite_arch="$(gcc -dumpmachine)"
export LD_LIBRARY_PATH="$HOME/.local/opt/sysroot/usr/lib/$__clite_arch:$HOME/.local/opt/sysroot/lib/$__clite_arch:$HOME/.local/opt/sysroot/usr/lib"
export PS1='\\[\\033[1;32m\\]clite:\\w$ \\[\\033[0m\\]'
shopt -s histappend checkwinsize
alias ll='ls -lah' python='python3' bat='batcat' fd='fdfind'
printf '\\nCLite 2.0 | portable CTF workspace | Tahmid Khan\\n'
printf 'Start: clite help | clite tools | clite doctor | cat README.md\\n'
printf 'Python venv is active. pip install and pipx install use this session only.\\n'
printf 'Reconnect preserves this shell briefly. Download workspace before expiry or deploy.\\n\\n'
`;

async function chownTree(target: string, uid: number, gid: number) {
  await fs.chown(target, uid, gid);
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) await chownTree(child, uid, gid);
    else await fs.chown(child, uid, gid);
  }
}

async function defaultSpawn(config: Config, mode: Mode, homeDir: string, cols: number, rows: number) {
  await fs.cp(path.join(ROOT, "templates", mode), homeDir, { recursive: true });
  let shell, args;
  if (mode === "team") {
    if (WINDOWS && !config.windowsTeam) throw new Error("Use Docker/WSL for Linux team mode.");
    await fs.writeFile(path.join(homeDir, ".bashrc"), BASHRC);
    if (WINDOWS) {
      shell = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
      args = ["/Q", "/K", "prompt clite:$P$G"];
    } else {
      shell = "/bin/bash";
      args = ["--noprofile", "--rcfile", path.join(homeDir, ".bashrc"), "-i"];
      // Create the venv without a shell; no server secrets enter the child environment.
      await new Promise<void>((resolve, reject) => {
        const child = spawn("/opt/ctf-python/bin/python", ["-m", "venv", "--without-pip", path.join(homeDir, ".venv")], { stdio: "ignore", env: { PATH: "/usr/bin:/bin" } });
        child.once("error", reject);
        child.once("exit", code => code === 0 ? resolve() : reject(new Error("Cannot create Python venv")));
      });
    }
  } else {
    shell = PYTHON;
    args = ["-I", "-u", path.join(ROOT, "scripts", "demo-shell.py")];
  }
  if (mode === "team" && !WINDOWS) {
    // Reuse bundled libraries without copying them or modifying Debian's Python.
    const entries = await fs.readdir("/opt/ctf-python/lib");
    const pythonDir = entries.find(name => /^python\d+\.\d+$/.test(name));
    if (!pythonDir) throw new Error("Bundled Python environment unavailable");
    const site = path.join(homeDir, ".venv", "lib", pythonDir, "site-packages");
    await fs.mkdir(site, { recursive: true });
    await fs.writeFile(path.join(site, "clite-bundled.pth"), `/opt/ctf-python/lib/${pythonDir}/site-packages\n`);
    await fs.writeFile(path.join(homeDir, ".venv", "bin", "pip"), `#!${homeDir}/.venv/bin/python\nimport sys\nfrom pip._internal.cli.main import main\nsys.exit(main())\n`, { mode: 0o755 });
  }
  const env: Record<string, string | undefined> = {
    HOME: homeDir, USER: "ctf", LOGNAME: "ctf", SHELL: "/bin/bash",
    TERM: "xterm-256color", LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
    PATH: WINDOWS ? process.env.PATH : "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    CLITE_MODE: mode, TMPDIR: path.join(homeDir, ".tmp")
  };
  await fs.mkdir(env.TMPDIR!, { mode: 0o700 });
  if (!WINDOWS) await chownTree(homeDir, config.uid, config.gid);
  if (WINDOWS) {
    env.SystemRoot = process.env.SystemRoot;
    env.TEMP = env.TMP = env.TMPDIR;
  }
  const command = WINDOWS ? [shell, ...args] : [
    "/usr/bin/setpriv", `--reuid=${config.uid}`, `--regid=${config.gid}`, "--clear-groups", "--no-new-privs",
    "/usr/bin/prlimit", `--nproc=${config.maxProcesses}`, "--nofile=1024", `--fsize=${config.maxFileBytes}`, "--core=0",
    ...(mode === "demo" ? ["--as=134217728", "--cpu=30"] : []), "--", shell, ...args
  ];
  return spawnTerminal(command, homeDir, env, cols, rows);
}

export function createApplication(options: { config?: Config; spawnSession?: SpawnSession } = {}) {
  const config = options.config || loadConfig();
  const manager = new SessionManager(config, options.spawnSession || ((...args) => defaultSpawn(config, ...args)));
  const signingKey = crypto.randomBytes(32);
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
  const uploads = new Set<string>();
  const exports = new Set<string>();
  let stopping = false;

  function issue(res: Response, mode: Mode, req: Request) {
    const payload = Buffer.from(JSON.stringify({ id: crypto.randomUUID(), mode, exp: Date.now() + config.teamTimeoutMs + 3600_000 })).toString("base64url");
    const mac = crypto.createHmac("sha256", signingKey).update(payload).digest("base64url");
    res.append("Set-Cookie", `clite_${mode}=${payload}.${mac}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil((config.teamTimeoutMs + 3600_000) / 1000)}${config.production || req.secure ? "; Secure" : ""}`);
  }

  function identity(req: IncomingMessage, mode: Mode): string | null {
    const cookie = (req.headers.cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith(`clite_${mode}=`));
    if (!cookie) return null;
    const [payload, mac] = cookie.slice(cookie.indexOf("=") + 1).split(".");
    if (!payload || !mac || !safeEqual(mac, crypto.createHmac("sha256", signingKey).update(payload).digest("base64url"))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data.mode === mode && data.exp > Date.now() && typeof data.id === "string" ? data.id : null;
    } catch { return null; }
  }

  function sameOrigin(req: IncomingMessage) {
    try {
      const origin = new URL(req.headers.origin || "");
      return ["http:", "https:"].includes(origin.protocol) && origin.host === req.headers.host;
    } catch { return false; }
  }

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "Cache-Control": "no-store" });
    res.set((storyHeaders as Record<string, Record<string, string>>)[req.path] || {});
    next();
  });
  app.get("/.well-known/security.txt", (req, res) => res.type("text/plain").sendFile(path.join(ROOT, "public", ".well-known", "security.txt"), { dotfiles: "allow" }));
  app.get("/healthz", (req, res) => res.status(stopping ? 503 : 200).json({ status: stopping ? "stopping" : "ok", version: "2.0.0" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false });
  app.post("/api/team/login", authLimit, express.json({ limit: "2kb" }), (req, res) => {
    if (!sameOrigin(req)) return res.sendStatus(403);
    if (!config.teamEnabled) return res.status(503).json({ error: "Team mode needs a TEAM_KEY of at least 16 characters." });
    if (!safeEqual(req.body?.key, config.teamKey)) return res.status(403).json({ error: "Invalid team key." });
    issue(res, "team", req);
    res.json({ ok: true });
  });
  app.get("/api/capabilities", (req, res) => res.json({ version: "2.0.0", teamEnabled: config.teamEnabled,
    demo: { lifetimeMinutes: config.demoTimeoutMs / 60_000, idleMinutes: config.demoIdleMs / 60_000, active: manager.count("demo"), capacity: config.maxDemo },
    team: { lifetimeMinutes: config.teamTimeoutMs / 60_000, idleMinutes: config.teamIdleMs / 60_000 },
    reconnectSeconds: config.reconnectMs / 1000, maxUploadBytes: config.uploadBytes }));

  for (const [url, file] of Object.entries({
    "/xterm/xterm.css": "@xterm/xterm/css/xterm.css",
    "/xterm/xterm.js": "@xterm/xterm/lib/xterm.js",
    "/xterm/addon-fit.js": "@xterm/addon-fit/lib/addon-fit.js"
  })) app.get(url, (req, res) => res.sendFile(path.join(ROOT, "node_modules", file)));

  app.get("/demo", (req, res) => {
    if (!identity(req, "demo")) issue(res, "demo", req);
    res.sendFile(path.join(ROOT, "public", "terminal.html"));
  });
  app.get("/team", (req, res) => {
    // Legacy links exchange the key once, then scrub it from subsequent URLs.
    if (req.query.key !== undefined) {
      if (config.teamEnabled && safeEqual(req.query.key, config.teamKey)) issue(res, "team", req);
      return res.redirect(303, "/team");
    }
    if (!config.teamEnabled || !identity(req, "team")) return res.redirect(303, "/?team=login");
    res.sendFile(path.join(ROOT, "public", "terminal.html"));
  });

  function workspace(req: Request, res: Response, next: NextFunction) {
    const mode = req.get("X-Clite-Mode");
    if (!mode || !["demo", "team"].includes(mode)) return res.sendStatus(403);
    const token = (req.get("Authorization") || "").replace(/^Bearer /, "");
    const session = manager.find(token, mode as Mode, identity(req, mode as Mode));
    if (!session || session.cleaning || Date.now() >= session.expiresAt) return res.sendStatus(401);
    req.workspace = session;
    next();
  }
  app.post("/api/workspace/upload", workspace, (req, res, next) => sameOrigin(req) ? next() : res.sendStatus(403),
    express.raw({ type: "application/octet-stream", limit: config.uploadBytes }), async (req, res) => {
      const name = req.query.name;
      if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(name) || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "Use a filename with letters, numbers, dots, underscores or dashes (120 characters max)." });
      }
      const target = path.join(req.workspace.homeDir, name);
      if (uploads.has(req.workspace.id)) return res.status(409).json({ error: "Another upload is in progress." });
      uploads.add(req.workspace.id);
      try {
        if (req.workspace.mode === "demo") {
          let total = 0, count = 0;
          const scan = async (dir: string): Promise<void> => {
            for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
              const item = path.join(dir, entry.name);
              if (entry.isDirectory()) await scan(item);
              else if (entry.isFile()) { total += (await fs.stat(item)).size; count++; }
            }
          };
          await scan(req.workspace.homeDir);
          if (req.body.length > 1024 * 1024 || total + req.body.length > 16 * 1024 * 1024 || count >= 500) {
            return res.status(413).json({ error: "Practice limit: 1 MiB per file, 16 MiB total, 500 files." });
          }
        }
        await fs.writeFile(target, req.body, { flag: "wx", mode: 0o600 });
        if (!WINDOWS) await fs.chown(target, config.uid, config.gid);
        req.workspace.lastActivityAt = Date.now();
        res.json({ name, bytes: req.body.length });
      } catch (error) {
        res.status(error.code === "EEXIST" ? 409 : 500).json({ error: error.code === "EEXIST" ? "That filename already exists. Rename the upload." : "Upload failed." });
      } finally {
        uploads.delete(req.workspace.id);
      }
    });
  app.get("/api/workspace/export", workspace, (req, res) => {
    if (exports.has(req.workspace.id)) return res.status(409).json({ error: "An export is already in progress." });
    exports.add(req.workspace.id);
    const child = spawn(PYTHON, ["-I", path.join(ROOT, "scripts", "export-workspace.py"), req.workspace.homeDir], {
      stdio: ["ignore", "pipe", "pipe"], env: WINDOWS ? { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } : { PATH: "/usr/bin:/bin" },
      ...(!WINDOWS ? { uid: config.uid, gid: config.gid } : {})
    });
    let started = false;
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.stdout.on("data", chunk => {
      if (!started) {
        started = true;
        res.set({ "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="clite-workspace.zip"' });
      }
      if (!res.write(chunk)) child.stdout.pause();
    });
    res.on("drain", () => child.stdout.resume());
    res.on("close", () => child.kill());
    child.on("error", () => { exports.delete(req.workspace.id); clearTimeout(timer); if (!res.headersSent) res.status(500).json({ error: "Workspace export unavailable." }); else res.destroy(); });
    child.on("close", code => {
      exports.delete(req.workspace.id);
      clearTimeout(timer);
      if (code !== 0) {
        if (!res.headersSent) res.status(413).json({ error: stderr.includes("limit") ? "Workspace exceeds export limit (50 MiB / 2000 files). Remove large artifacts first." : "Export failed. Retry after stopping file changes." });
        else res.destroy();
      } else res.end();
    });
  });
  app.use(express.static(path.join(ROOT, "public"), { index: "index.html", dotfiles: "deny" }));
  app.use((err: {status?: number}, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.status === 413 ? "Upload exceeds the configured size limit." : "Request failed." });
  });

  const admission = new Map<string, { since: number; count: number }>();
  const alive = new WeakSet<WebSocket>();
  server.on("upgrade", (req, socket, head) => {
    const reject = (status: string) => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); };
    let url;
    try { url = new URL(req.url || "", "http://localhost"); } catch { return reject("400 Bad Request"); }
    if (stopping || !["/ws/demo", "/ws/team"].includes(url.pathname)) return reject("404 Not Found");
    if (!sameOrigin(req)) return reject("403 Forbidden");
    const mode = url.pathname.endsWith("team") ? "team" : "demo";
    const owner = identity(req, mode);
    if (!owner || (mode === "team" && !config.teamEnabled)) return reject("403 Forbidden");
    const now = Date.now();
    for (const [key, entry] of admission) if (now - entry.since > 60_000) admission.delete(key);
    const ip = req.socket.remoteAddress || "unknown";
    const entry = admission.get(ip) || { since: now, count: 0 };
    entry.count++;
    admission.set(ip, entry);
    if (entry.count > 60) return reject("429 Too Many Requests");
    wss.handleUpgrade(req, socket, head, ws => {
      alive.add(ws);
      ws.on("error", () => {});
      ws.on("pong", () => { alive.add(ws); });
      const handshakeTimer = setTimeout(() => ws.close(1008, "Handshake timeout"), 10_000);
      ws.once("close", () => clearTimeout(handshakeTimer));
      ws.once("message", async raw => {
        clearTimeout(handshakeTimer);
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return ws.close(1008, "Invalid handshake"); }
        if (!message || typeof message !== "object" || Array.isArray(message)) return ws.close(1008, "Invalid handshake");
        if (message.type !== "hello") return ws.close(1008, "Expected hello");
        try {
          if (message.token) {
            const session = manager.find(message.token, mode, owner);
            if (!session || Date.now() >= session.expiresAt || session.cleaning ||
              Date.now() >= session.lastActivityAt + session.idleMs ||
              (session.detachedAt !== null && Date.now() >= session.detachedAt + config.reconnectMs)) {
              send(ws, { type: "expired", message: "Previous session expired or server restarted. Start a new session." });
              return ws.close(4004, "Session expired");
            }
            manager.attach(session, ws);
          } else {
            await manager.create(mode, ws, size(message.cols, 80, 20, 300), size(message.rows, 24, 8, 100), owner);
          }
        } catch (error) {
          console.error("session creation failed:", error.message);
          send(ws, { type: "error", message: error.message.startsWith("Session capacity") ? error.message : "Could not start terminal. Check server configuration." });
          ws.close(1013, "Session unavailable");
        }
      });
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) { ws.terminate(); continue; }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  async function close() {
    stopping = true;
    clearInterval(heartbeat);
    await manager.close();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  return { app, server, manager, config, close };
}

if (import.meta.main) {
  const runtime = createApplication();
  if (!runtime.config.teamEnabled) console.warn("Team mode disabled: set TEAM_KEY to a unique secret of at least 16 characters.");
  runtime.server.listen(runtime.config.port, "0.0.0.0", () => console.log(`CLite 2.0 listening on ${runtime.config.port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    runtime.close().then(() => process.exit(0));
  });
}

