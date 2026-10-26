"use strict";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const environmentDefaults = parse(readFileSync(new URL("../.env.example", import.meta.url)));

function number(env: Record<string, string | undefined>, key: string, min = 1, max = 10_000) {
  if (env[key] === undefined || env[key] === "") throw new Error(`${key} must be configured in .env or the hosting environment`);
  const value = Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return value;
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const teamIdle = env.TEAM_IDLE_TIMEOUT_MINUTES ?? env.IDLE_TIMEOUT_MINUTES;
  const demoIdle = env.PUBLIC_IDLE_TIMEOUT_MINUTES ?? env.IDLE_TIMEOUT_MINUTES;
  env = { ...environmentDefaults, ...env };
  if (teamIdle !== undefined) env.TEAM_IDLE_TIMEOUT_MINUTES = teamIdle;
  if (demoIdle !== undefined) env.PUBLIC_IDLE_TIMEOUT_MINUTES = demoIdle;
  const teamKey = env.TEAM_KEY || "";
  return {
    port: number(env, "PORT", 0, 65535),
    teamKey,
    questKey: env.QUEST_MASTER_KEY || "",
    teamEnabled: teamKey.length >= 16 && teamKey !== "change-me",
    maxTeam: Math.floor(number(env, "MAX_TEAM_SESSIONS")),
    maxDemo: Math.floor(number(env, "MAX_PUBLIC_SESSIONS")),
    teamTimeoutMs: number(env, "TEAM_TIMEOUT_MINUTES") * 60_000,
    demoTimeoutMs: number(env, "PUBLIC_TIMEOUT_MINUTES") * 60_000,
    teamIdleMs: number(env, "TEAM_IDLE_TIMEOUT_MINUTES") * 60_000,
    demoIdleMs: number(env, "PUBLIC_IDLE_TIMEOUT_MINUTES") * 60_000,
    reconnectMs: number(env, "RECONNECT_GRACE_SECONDS", 5, 3600) * 1000,
    warningMs: number(env, "TIMEOUT_WARNING_SECONDS", 1, 600) * 1000,
    uploadBytes: number(env, "MAX_UPLOAD_MB", 1, 100) * 1024 * 1024,
    trustProxy: Math.floor(number(env, "TRUST_PROXY", 0, 5)),
    baseDir: env.BASE_SESSIONS_DIR || path.join(os.tmpdir(), "ctf-web-cli", "sessions"),
    uid: number(env, "CTF_UID", 1, 65535),
    gid: number(env, "CTF_GID", 1, 65535),
    demoUid: number(env, "DEMO_UID", 1, 65535),
    demoGid: number(env, "DEMO_GID", 1, 65535),
    windowsTeam: env.ALLOW_WINDOWS_TEAM === "true",
    maxProcesses: Math.floor(number(env, "SESSION_MAX_PROCESSES", 16)),
    maxFileBytes: number(env, "SESSION_MAX_FILE_MB", 16, 8192) * 1024 * 1024,
    production: env.NODE_ENV === "production"
  };
}

export type Config = ReturnType<typeof loadConfig>;
