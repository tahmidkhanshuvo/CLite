"use strict";
import os from "node:os";
import path from "node:path";

function number(env: Record<string, string | undefined>, key: string, fallback: number, min = 1, max = 10_000) {
  if (env[key] === undefined || env[key] === "") return fallback;
  const value = Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return value;
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const teamKey = env.TEAM_KEY || "";
  return {
    port: number(env, "PORT", 7860, 0, 65535),
    teamKey,
    teamEnabled: teamKey.length >= 16 && teamKey !== "change-me",
    maxTeam: Math.floor(number(env, "MAX_TEAM_SESSIONS", 5)),
    maxDemo: Math.floor(number(env, "MAX_PUBLIC_SESSIONS", 4)),
    teamTimeoutMs: number(env, "TEAM_TIMEOUT_MINUTES", 480, 1) * 60_000,
    demoTimeoutMs: number(env, "PUBLIC_TIMEOUT_MINUTES", 30, 1) * 60_000,
    teamIdleMs: number(env, "TEAM_IDLE_TIMEOUT_MINUTES", Number(env.IDLE_TIMEOUT_MINUTES || 60), 1) * 60_000,
    demoIdleMs: number(env, "PUBLIC_IDLE_TIMEOUT_MINUTES", Number(env.IDLE_TIMEOUT_MINUTES || 15), 1) * 60_000,
    reconnectMs: number(env, "RECONNECT_GRACE_SECONDS", 300, 5, 3600) * 1000,
    warningMs: number(env, "TIMEOUT_WARNING_SECONDS", 120, 1, 600) * 1000,
    uploadBytes: number(env, "MAX_UPLOAD_MB", 10, 1, 100) * 1024 * 1024,
    trustProxy: Math.floor(number(env, "TRUST_PROXY", 0, 0, 5)),
    baseDir: env.BASE_SESSIONS_DIR || path.join(os.tmpdir(), "ctf-web-cli", "sessions"),
    uid: number(env, "CTF_UID", 1001, 1, 65535),
    gid: number(env, "CTF_GID", 1001, 1, 65535),
    windowsTeam: env.ALLOW_WINDOWS_TEAM === "true",
    maxProcesses: Math.floor(number(env, "SESSION_MAX_PROCESSES", 256, 16)),
    maxFileBytes: number(env, "SESSION_MAX_FILE_MB", 512, 16, 8192) * 1024 * 1024,
    production: env.NODE_ENV === "production"
  };
}

export type Config = ReturnType<typeof loadConfig>;
