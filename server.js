"use strict";

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const process = require("process");
const express = require("express");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { WebSocketServer } = require("ws");
const pty = require("node-pty");

const PORT = Number(process.env.PORT || 7860);
const TEAM_KEY = process.env.TEAM_KEY || "change-me";
const MAX_TEAM_SESSIONS = Number(process.env.MAX_TEAM_SESSIONS || 5);
const MAX_PUBLIC_SESSIONS = Number(process.env.MAX_PUBLIC_SESSIONS || 2);
const PUBLIC_TIMEOUT_MINUTES = Number(process.env.PUBLIC_TIMEOUT_MINUTES || 10);
const TEAM_TIMEOUT_MINUTES = Number(process.env.TEAM_TIMEOUT_MINUTES || 180);
const IDLE_TIMEOUT_MINUTES = Number(process.env.IDLE_TIMEOUT_MINUTES || 10);

const IS_WINDOWS = process.platform === "win32";
const BASE_SESSIONS_DIR = process.env.BASE_SESSIONS_DIR || (
  IS_WINDOWS
    ? path.join(os.tmpdir(), "ctf-web-cli", "sessions")
    : "/tmp/ctf-web-cli/sessions"
);
const TEMPLATE_ROOT = "/opt/ctf-template";
const LOCAL_TEMPLATE_ROOT = path.join(__dirname, "templates");
const CTF_UID = Number(process.env.CTF_UID || 1001);
const CTF_GID = Number(process.env.CTF_GID || 1001);

const CLITE_BANNER = String.raw`
  ____ _     _ _       
 / ___| |   (_) |_ ___ 
| |   | |   | | __/ _ \
| |___| |___| | ||  __/
 \____|_____|_|\__\___|

CLite v1.0
CLI Lite
Creator: Tahmid Khan
Built for ethical CTFs, lab practice, and owned learning environments.
Need help? admin@tahmidkhan.com.bd
`;

const TEAM_BASHRC = String.raw`cat <<'CLITE_BANNER'` + CLITE_BANNER + String.raw`
CLITE_BANNER
__clite_prompt_gap() {
  printf '\n'
}

export PROMPT_COMMAND=__clite_prompt_gap
export PS1="\[\033[1;32m\]clite:\w$ \[\033[0m\]"
`;

function minutes(n) {
  return Math.max(1, n) * 60 * 1000;
}

function timingSafeEqualString(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sanitizeSize(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyTemplate(mode, dest) {
  const dockerSource = path.join(TEMPLATE_ROOT, mode);
  const localSource = path.join(LOCAL_TEMPLATE_ROOT, mode);
  const source = (await pathExists(dockerSource)) ? dockerSource : localSource;
  await fs.cp(source, dest, {
    recursive: true,
    force: false,
    errorOnExist: false,
    preserveTimestamps: false
  });
}

async function chownRecursive(target, uid, gid) {
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return;
  }

  await fs.chown(target, uid, gid).catch(() => {});
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await chownRecursive(child, uid, gid);
    } else {
      await fs.chown(child, uid, gid).catch(() => {});
    }
  }
}

function getLocalWindowsShell() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const cmd = process.env.ComSpec || path.join(systemRoot, "System32", "cmd.exe");
  return {
    shell: cmd,
    args: ["/Q", "/K", "prompt clite:$P$G"],
    envShell: cmd
  };
}

function getPtyConfig(mode, homeDir) {
  if (IS_WINDOWS) {
    const { shell, args, envShell } = getLocalWindowsShell();
    return {
      shell,
      args,
      envShell,
      options: {}
    };
  }

  return {
    shell: mode === "demo" ? "/usr/local/bin/restricted-demo-shell" : "/bin/bash",
    args: mode === "demo" ? [] : ["--noprofile", "--rcfile", path.join(homeDir, ".bashrc"), "-i"],
    envShell: "/bin/bash",
    options: {
      uid: CTF_UID,
      gid: CTF_GID
    }
  };
}

function wsSend(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch((err) => {
        console.error("periodic cleanup failed", err);
      });
    }, 60_000);
    this.cleanupTimer.unref();
  }

  activeCount(mode) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.mode === mode && !session.cleaning) count += 1;
    }
    return count;
  }

  canStart(mode) {
    const max = mode === "team" ? MAX_TEAM_SESSIONS : MAX_PUBLIC_SESSIONS;
    return this.activeCount(mode) < max;
  }

  async ensureBaseDir() {
    await fs.mkdir(BASE_SESSIONS_DIR, { recursive: true, mode: 0o711 });
    await fs.chmod(BASE_SESSIONS_DIR, 0o711);
  }

  async createSession({ mode, ws, rows, cols }) {
    if (!this.canStart(mode)) {
      wsSend(ws, {
        type: "error",
        message: `${mode === "team" ? "Team" : "Public demo"} session limit reached. Try again later.`
      });
      ws.close(1013, "session limit reached");
      return null;
    }

    await this.ensureBaseDir();

    const id = crypto.randomUUID();
    const sessionDir = path.join(BASE_SESSIONS_DIR, id);
    const homeDir = path.join(sessionDir, "home");
    const timeoutMs = minutes(mode === "team" ? TEAM_TIMEOUT_MINUTES : PUBLIC_TIMEOUT_MINUTES);
    const idleTimeoutMs = minutes(IDLE_TIMEOUT_MINUTES);
    const now = Date.now();

    await fs.mkdir(homeDir, { recursive: true, mode: 0o700 });
    await copyTemplate(mode, homeDir);
    if (mode === "team") {
      await fs.writeFile(path.join(homeDir, ".bashrc"), TEAM_BASHRC, { mode: 0o600 });
    }
    await fs.chown(sessionDir, CTF_UID, CTF_GID).catch(() => {});
    await chownRecursive(homeDir, CTF_UID, CTF_GID);
    await fs.chmod(sessionDir, 0o700);
    await fs.chmod(homeDir, 0o700);

    const ptyConfig = getPtyConfig(mode, homeDir);
    const env = {
      HOME: homeDir,
      USER: "ctf",
      LOGNAME: "ctf",
      SHELL: ptyConfig.envShell,
      TERM: "xterm-256color",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PATH: IS_WINDOWS ? (process.env.PATH || "") : "/usr/local/bin:/usr/bin:/bin"
    };

    const terminal = pty.spawn(ptyConfig.shell, ptyConfig.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: homeDir,
      env,
      ...ptyConfig.options
    });

    const session = {
      id,
      mode,
      ws,
      terminal,
      sessionDir,
      homeDir,
      startedAt: now,
      expiresAt: now + timeoutMs,
      lastActivityAt: now,
      timeoutMs,
      idleTimeoutMs,
      cleaning: false,
      timers: []
    };

    this.sessions.set(id, session);
    console.log(`[session:start] mode=${mode} id=${id}`);

    terminal.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    terminal.onExit(({ exitCode, signal }) => {
      console.log(`[session:pty-exit] mode=${mode} id=${id} exit=${exitCode} signal=${signal || ""}`);
      this.cleanup(id, "pty exited").catch((err) => console.error("cleanup failed", err));
    });

    session.timers.push(setTimeout(() => {
      this.cleanup(id, "session timeout").catch((err) => console.error("cleanup failed", err));
    }, timeoutMs));

    session.timers.push(setInterval(() => {
      if (Date.now() - session.lastActivityAt > idleTimeoutMs) {
        this.cleanup(id, "idle timeout").catch((err) => console.error("cleanup failed", err));
      }
    }, 30_000));

    for (const timer of session.timers) timer.unref();

    wsSend(ws, {
      type: "session",
      id,
      mode,
      timeoutMs,
      idleTimeoutMs,
      startedAt: now
    });

    if (IS_WINDOWS) {
      wsSend(ws, {
        type: "notice",
        message: `${CLITE_BANNER}\nLocal Windows development shell started. Docker/WSL is required for the restricted Linux demo shell.`
      });
    }

    return session;
  }

  handleMessage(session, raw) {
    session.lastActivityAt = Date.now();

    const data = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
    if (data.startsWith("{")) {
      try {
        const message = JSON.parse(data);
        if (message.type === "resize") {
          const cols = sanitizeSize(message.cols, 80, 20, 240);
          const rows = sanitizeSize(message.rows, 24, 8, 80);
          session.terminal.resize(cols, rows);
          return;
        }
      } catch {
        // Fall through and write the data to the terminal.
      }
    }

    session.terminal.write(data);
  }

  async cleanupExpiredSessions() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (now >= session.expiresAt) {
        await this.cleanup(session.id, "periodic session timeout");
      } else if (now - session.lastActivityAt > session.idleTimeoutMs) {
        await this.cleanup(session.id, "periodic idle timeout");
      }
    }
  }

  async cleanup(id, reason) {
    const session = this.sessions.get(id);
    if (!session || session.cleaning) return;
    session.cleaning = true;
    this.sessions.delete(id);

    for (const timer of session.timers) clearTimeout(timer);

    try {
      wsSend(session.ws, { type: "disconnect", reason });
      if (session.ws.readyState === session.ws.OPEN) session.ws.close(1000, reason);
    } catch {}

    try {
      session.terminal.kill("SIGHUP");
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      process.kill(-session.terminal.pid, "SIGKILL");
    } catch {
      try {
        process.kill(session.terminal.pid, "SIGKILL");
      } catch {}
    }

    await fs.rm(session.sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    console.log(`[session:end] mode=${session.mode} id=${id} reason="${reason}"`);
  }
}

const manager = new SessionManager();
const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");

app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "img-src 'self' data:"
  ].join("; "));
  next();
});

app.get("/xterm/xterm.css", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "@xterm", "xterm", "css", "xterm.css"));
});

app.get("/xterm/xterm.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "@xterm", "xterm", "lib", "xterm.js"));
});

app.get("/xterm/addon-fit.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "@xterm", "addon-fit", "lib", "addon-fit.js"));
});

app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  index: "index.html"
}));

app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terminal.html"));
});

app.get("/team", (req, res) => {
  if (!timingSafeEqualString(req.query.key, TEAM_KEY)) {
    res.status(403).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Forbidden</title><link rel="stylesheet" href="/style.css"></head>
<body class="plain"><main class="message"><h1>403</h1><p>Invalid team key.</p><a href="/">Back</a></main></body></html>`);
    return;
  }
  res.sendFile(path.join(__dirname, "public", "terminal.html"));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws/demo" && url.pathname !== "/ws/team") {
    socket.destroy();
    return;
  }

  if (url.pathname === "/ws/team" && !timingSafeEqualString(url.searchParams.get("key"), TEAM_KEY)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, url);
  });
});

wss.on("connection", async (ws, req, url) => {
  const mode = url.pathname === "/ws/team" ? "team" : "demo";
  let session = null;

  try {
    session = await manager.createSession({
      mode,
      ws,
      cols: sanitizeSize(url.searchParams.get("cols"), 80, 20, 240),
      rows: sanitizeSize(url.searchParams.get("rows"), 24, 8, 80)
    });
  } catch (err) {
    console.error("failed to create session", err);
    wsSend(ws, { type: "error", message: "Failed to create terminal session." });
    ws.close(1011, "session create failed");
    return;
  }

  if (!session) return;

  ws.on("message", (message) => manager.handleMessage(session, message));
  ws.on("close", () => manager.cleanup(session.id, "websocket disconnected").catch((err) => console.error("cleanup failed", err)));
  ws.on("error", () => manager.cleanup(session.id, "websocket error").catch((err) => console.error("cleanup failed", err)));
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("shutting down");
  const cleanups = Array.from(manager.sessions.keys()).map((id) => manager.cleanup(id, "server shutdown"));
  Promise.allSettled(cleanups).finally(() => process.exit(0));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CLite listening on 0.0.0.0:${PORT}`);
});
