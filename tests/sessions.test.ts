import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WebSocket } from "ws";
import { loadConfig } from "../lib/config";
import { SessionManager } from "../lib/sessions";
import type { TerminalHandle } from "../lib/terminal";

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages: Array<Record<string, any>> = [];
  send(data: string) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit("close"); }
  terminate() { this.close(); }
}
class Terminal implements TerminalHandle {
  pid = 2_000_000_000; // never signal a real test host process
  input = "";
  onDataCallback: (data: string) => void = () => {};
  onData(fn: (data: string) => void) { this.onDataCallback = fn; }
  onExit() {}
  kill() {}
  resize() {}
  write(data: string) { this.input += data; }
}
const cast = (ws: Socket) => ws as unknown as WebSocket;
const managers: SessionManager[] = [];
afterEach(async () => {
  for (const manager of managers.splice(0)) {
    await manager.close();
    await fs.rm(manager.config.baseDir, { recursive: true, force: true });
  }
});
async function setup(extra: Record<string, string> = {}) {
  const config = loadConfig({ TEAM_KEY: "test-team-secret-long", ...extra });
  config.baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "clite-test-"));
  const terminal = new Terminal();
  const manager = new SessionManager(config, async () => terminal);
  managers.push(manager);
  const ws = new Socket();
  const session = await manager.create("team", cast(ws), 80, 24, "owner");
  return { manager, terminal, ws, session };
}
describe("session lifetime and recovery", () => {
  test("only input, explicit keepalive and team output refresh idle activity", async () => {
    const { manager, terminal, session } = await setup();
    session.lastActivityAt = 100;
    for (const invalid of ["null", "[]", "true", "1", '"text"']) {
      manager.message(session, Buffer.from(invalid));
    }
    manager.message(session, Buffer.from('{"type":"resize","cols":100,"rows":30}'));
    expect(session.lastActivityAt).toBe(100);
    manager.message(session, Buffer.from('{"type":"ping"}'));
    expect(session.lastActivityAt).toBe(100);
    manager.message(session, Buffer.from('{"type":"input","data":"ls\\r"}'));
    expect(terminal.input).toBe("ls\r");
    expect(session.lastActivityAt).toBeGreaterThan(100);
    session.lastActivityAt = 100;
    terminal.onDataCallback("running task output");
    expect(session.lastActivityAt).toBeGreaterThan(100);
    const expiry = session.expiresAt;
    manager.message(session, Buffer.from('{"type":"keepalive"}'));
    expect(session.expiresAt).toBe(expiry);
  });
  test("network disconnect retains files, resume replays output and checks owner", async () => {
    const { manager, terminal, ws, session } = await setup();
    await fs.writeFile(path.join(session.homeDir, "evidence"), "saved");
    terminal.onDataCallback("hello");
    ws.close();
    expect(session.detachedAt).not.toBeNull();
    expect(await fs.readFile(path.join(session.homeDir, "evidence"), "utf8")).toBe("saved");
    expect(manager.find(session.token, "team", "another-owner")).toBeUndefined();
    expect(manager.find(session.token, "demo", "owner")).toBeUndefined();
    const resumed = new Socket();
    manager.attach(session, cast(resumed));
    expect(session.detachedAt).toBeNull();
    expect(resumed.messages.some(m => m.type === "output" && m.data === "hello")).toBe(true);
    // A late close from the old connection must not detach the new connection.
    manager.detach(session, cast(ws));
    expect(session.ws).toBe(cast(resumed));
  });
  test("hard lifetime wins over ongoing output or user keepalive", async () => {
    const { manager, session, ws } = await setup();
    session.expiresAt = Date.now() - 1;
    session.lastActivityAt = Date.now();
    manager.tick();
    expect(session.cleaning).toBe(true);
    expect(ws.messages.some(m => m.reason === "Session lifetime reached")).toBe(true);
  });
  test("grace timeout removes detached sessions", async () => {
    const { manager, session, ws } = await setup();
    ws.close();
    manager.tick(session.detachedAt! + manager.config.reconnectMs + 1);
    expect(session.cleaning).toBe(true);
  });
  test("idle warnings precede expiry and bounded replay avoids unbounded memory", async () => {
    const { manager, session, ws, terminal } = await setup();
    session.lastActivityAt = Date.now() - session.idleMs + 30_000;
    manager.tick();
    expect(ws.messages.some(m => m.type === "warning")).toBe(true);
    terminal.onDataCallback("x".repeat(200_000));
    expect(session.replay.length).toBe(128 * 1024);
  });
  test("capacity is reserved before asynchronous setup", async () => {
    const { manager } = await setup({ MAX_TEAM_SESSIONS: "2" });
    const attempts = await Promise.allSettled([
      manager.create("team", cast(new Socket()), 80, 24, "one"),
      manager.create("team", cast(new Socket()), 80, 24, "two")
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
  });
  test("closed handshakes release reserved capacity and partial directories", async () => {
    const { manager } = await setup();
    const ws = new Socket();
    ws.close();
    await expect(manager.create("demo", cast(ws), 80, 24, "owner")).rejects.toThrow();
    expect(manager.pending.demo).toBe(0);
    expect(manager.count("demo")).toBe(0);
  });
});
test("configuration rejects invalid deadlines and weak default keys", () => {
  expect(() => loadConfig({ TEAM_TIMEOUT_MINUTES: "nonsense" })).toThrow();
  expect(() => loadConfig({ PUBLIC_IDLE_TIMEOUT_MINUTES: "0" })).toThrow();
  expect(loadConfig({ TEAM_KEY: "change-me" }).teamEnabled).toBe(false);
});
