"use strict";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { WebSocket } from "ws";
import type { Config } from "./config";
import type { TerminalHandle } from "./terminal";

export type Mode = "demo" | "team";
export interface Session {
  id: string; mode: Mode; owner: string; terminal: TerminalHandle; homeDir: string; sessionDir: string;
  token: string; startedAt: number; lastActivityAt: number; expiresAt: number; idleMs: number;
  detachedAt: number | null; ws: WebSocket | null; replay: string; cleaning: boolean; warned: string;
  inputWindow: number; inputBytes: number; lastStateAt?: number;
}
export type SpawnSession = (mode: Mode, homeDir: string, cols: number, rows: number) => Promise<TerminalHandle>;

export function send(ws: WebSocket | null, message: unknown) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
}

export function safeEqual(a: unknown, b: unknown) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function size(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export class SessionManager {
  config: Config;
  spawnSession: SpawnSession;
  sessions: Map<string, Session>;
  pending: Record<Mode, number>;
  timer: ReturnType<typeof setInterval>;
  constructor(config: Config, spawnSession: SpawnSession) {
    this.config = config;
    this.spawnSession = spawnSession;
    this.sessions = new Map();
    this.pending = { demo: 0, team: 0 };
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }

  count(mode: Mode) {
    return [...this.sessions.values()].filter(s => s.mode === mode).length + this.pending[mode];
  }

  async create(mode: Mode, ws: WebSocket, cols: number, rows: number, owner: string) {
    const limit = mode === "team" ? this.config.maxTeam : this.config.maxDemo;
    if (this.count(mode) >= limit) throw new Error("Session capacity reached. Try again after a session ends.");
    // Reserve before any await: simultaneous handshakes must not bypass capacity.
    this.pending[mode]++;
    let sessionDir: string | undefined;
    let terminal: TerminalHandle | undefined;
    try {
      const id = crypto.randomUUID();
      await fs.mkdir(this.config.baseDir, { recursive: true, mode: 0o711 });
      if (process.platform !== "win32") await fs.chmod(this.config.baseDir, 0o711);
      sessionDir = path.join(this.config.baseDir, id);
      const homeDir = path.join(sessionDir, "home");
      await fs.mkdir(homeDir, { recursive: true, mode: 0o700 });
      if (process.platform !== "win32") await fs.chmod(sessionDir, 0o711);
      terminal = await this.spawnSession(mode, homeDir, cols, rows);
      if (ws.readyState !== 1) throw new Error("Connection closed during session creation.");
      const now = Date.now();
      const session: Session = {
        id, mode, owner, terminal, homeDir, sessionDir,
        token: crypto.randomBytes(32).toString("base64url"),
        startedAt: now, lastActivityAt: now,
        expiresAt: now + (mode === "team" ? this.config.teamTimeoutMs : this.config.demoTimeoutMs),
        idleMs: mode === "team" ? this.config.teamIdleMs : this.config.demoIdleMs,
        detachedAt: null, ws: null, replay: "", cleaning: false, warned: "",
        inputWindow: now, inputBytes: 0
      };
      this.sessions.set(id, session);
      terminal.onData(data => {
        // Output protects long-running tasks from idle expiry; hard lifetime still applies.
        if (mode === "team") session.lastActivityAt = Date.now();
        session.replay = (session.replay + data).slice(-128 * 1024);
        if (session.ws?.readyState === 1) {
          if (session.ws.bufferedAmount > 1024 * 1024) session.ws.terminate();
          else send(session.ws, { type: "output", data });
        }
      });
      terminal.onExit(() => void this.cleanup(id, "Shell exited"));
      this.attach(session, ws, false);
      console.log(`[session:start] mode=${mode} id=${id}`);
      return session;
    } catch (error) {
      try { terminal?.kill(); } catch {}
      if (sessionDir) await fs.rm(sessionDir, { recursive: true, force: true });
      throw error;
    } finally {
      this.pending[mode]--;
    }
  }

  find(token: string, mode: Mode, owner: string | null) {
    return [...this.sessions.values()].find(s => s.mode === mode && s.owner === owner && safeEqual(s.token, token));
  }

  attach(session: Session, ws: WebSocket, resumed = true) {
    if (session.ws?.readyState === 1) {
      send(session.ws, { type: "disconnect", reason: "Session opened in another connection" });
      session.ws.close(4001, "Session moved");
    }
    session.ws = ws;
    session.detachedAt = null;
    send(ws, { type: "session", id: session.id, mode: session.mode, token: session.token,
      resumed, reconnectMs: this.config.reconnectMs, ...this.state(session) });
    if (session.replay) send(ws, { type: "output", data: session.replay });
    ws.on("close", () => this.detach(session, ws));
    ws.on("error", () => this.detach(session, ws));
    ws.on("message", raw => {
      if (session.ws !== ws || session.cleaning) return;
      this.message(session, raw);
    });
  }

  detach(session: Session, ws: WebSocket) {
    if (session.ws !== ws || session.cleaning) return;
    session.ws = null;
    session.detachedAt = Date.now();
  }

  state(session: Session) {
    return { serverNow: Date.now(), startedAt: session.startedAt, expiresAt: session.expiresAt,
      idleExpiresAt: session.lastActivityAt + session.idleMs };
  }

  message(session: Session, raw: { toString(): string }) {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    if (message.type === "resize") {
      session.terminal.resize(size(message.cols, 80, 20, 300), size(message.rows, 24, 8, 100));
    } else if (message.type === "input" && typeof message.data === "string" && message.data.length <= 16_384) {
      const now = Date.now();
      if (now - session.inputWindow >= 1000) { session.inputWindow = now; session.inputBytes = 0; }
      session.inputBytes += Buffer.byteLength(message.data);
      if (session.inputBytes > 128 * 1024) return;
      if (message.data.length) session.lastActivityAt = now;
      session.terminal.write(message.data);
    } else if (message.type === "keepalive") {
      // Explicit user action, unlike transport ping, can extend idle time only.
      session.lastActivityAt = Date.now();
      send(session.ws, { type: "state", ...this.state(session) });
    } else if (message.type === "end") {
      void this.cleanup(session.id, "Ended by user");
    }
  }

  tick(now = Date.now()) {
    for (const session of this.sessions.values()) {
      let reason;
      if (now >= session.expiresAt) reason = "Session lifetime reached";
      else if (session.detachedAt !== null && now >= session.detachedAt + this.config.reconnectMs) reason = "Reconnect grace expired";
      else if (now >= session.lastActivityAt + session.idleMs) reason = "Idle timeout";
      if (reason) { void this.cleanup(session.id, reason); continue; }
      const deadline = Math.min(session.expiresAt, session.lastActivityAt + session.idleMs);
      const warning = deadline - now <= this.config.warningMs;
      if (warning && session.warned !== String(deadline)) {
        send(session.ws, { type: "warning", message: "Session expires soon. Download your workspace before the deadline.", ...this.state(session) });
        session.warned = String(deadline);
      }
      if (now - (session.lastStateAt || 0) >= 5000) {
        send(session.ws, { type: "state", ...this.state(session) });
        session.lastStateAt = now;
      }
    }
  }

  async cleanup(id: string, reason: string) {
    const session = this.sessions.get(id);
    if (!session || session.cleaning) return;
    session.cleaning = true;
    send(session.ws, { type: "disconnect", reason });
    session.ws?.close(1000, reason);
    if (process.platform === "linux") {
      // Job-control shells give background jobs their own process groups. All
      // retain the PTY session ID, even after a child is reparented to PID 1.
      const processes = await fs.readdir("/proc").catch(() => [] as string[]);
      await Promise.all(processes.filter(pid => /^\d+$/.test(pid)).map(async pid => {
        try {
          const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8");
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
          if (Number(fields[3]) === session.terminal.pid && Number(pid) !== session.terminal.pid) {
            try { process.kill(Number(pid), "SIGKILL"); } catch {}
          }
        } catch {}
      }));
    }
    try { session.terminal.kill(); } catch {}
    // Kill the Unix process group, including background children, before deleting files.
    if (process.platform !== "win32") {
      try { process.kill(-session.terminal.pid, "SIGKILL"); } catch {}
    }
    try {
      await fs.rm(session.sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      console.error(`[session:cleanup] id=${id} ${error.code}`);
    } finally {
      this.sessions.delete(id);
    }
    console.log(`[session:end] mode=${session.mode} id=${id} reason=${reason}`);
  }

  async close() {
    clearInterval(this.timer);
    await Promise.all([...this.sessions.keys()].map(id => this.cleanup(id, "Server restarting; download workspaces before deployment")));
  }
}

