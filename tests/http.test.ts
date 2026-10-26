import { expect, test } from "bun:test";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createApplication } from "../server";
import { loadConfig } from "../lib/config";
import type { TerminalHandle } from "../lib/terminal";

test("HTTP auth, upgrade origins, resume ownership and workspace transfer", async () => {
  const config = loadConfig({ TEAM_KEY: "integration-test-secret" });
  config.uid = process.getuid?.() ?? config.uid;
  config.gid = process.getgid?.() ?? config.gid;
  config.baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "clite-http-"));
  const terminal: TerminalHandle = { pid: 2_000_000_000, write() {}, resize() {}, kill() {}, onData() {}, onExit() {} };
  const runtime = createApplication({ config, spawnSession: async () => terminal });
  await new Promise<void>(resolve => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: origin, "Content-Type": "application/json" };
  let ws: WebSocket | undefined;
  try {
    expect((await fetch(origin + "/healthz")).status).toBe(200);
    expect((await fetch(origin + "/team", { redirect: "manual" })).status).toBe(303);
    expect((await fetch(origin + "/api/team/login", { method: "POST", headers: { ...headers, Origin: "https://evil.example" }, body: JSON.stringify({ key: config.teamKey }) })).status).toBe(403);
    expect((await fetch(origin + "/api/team/login", { method: "POST", headers, body: '{"key":"wrong"}' })).status).toBe(403);
    const login = await fetch(origin + "/api/team/login", { method: "POST", headers, body: JSON.stringify({ key: config.teamKey }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await fetch(origin + "/team", { headers: { Cookie: cookie }, redirect: "manual" })).status).toBe(200);
    const forbidden = new WebSocket(origin.replace("http", "ws") + "/ws/team", { headers: { Cookie: cookie, Origin: "https://evil.example" } });
    await new Promise<void>(resolve => {
      forbidden.on("unexpected-response", (_req, res) => { expect(res.statusCode).toBe(403); forbidden.terminate(); resolve(); });
      forbidden.on("error", () => {});
    });
    async function connect(token = "") {
      const socket = new WebSocket(origin.replace("http", "ws") + "/ws/team", { headers: { Cookie: cookie, Origin: origin } });
      socket.on("error", () => {});
      const ready = new Promise<Record<string, any>>(resolve => socket.on("message", raw => { const message = JSON.parse(raw.toString()); if (message.type === "session") resolve(message); }));
      await once(socket, "open");
      socket.send(JSON.stringify({ type: "hello", token, cols: 80, rows: 24 }));
      return { socket, session: await ready };
    }
    let connected = await connect();
    ws = connected.socket;
    const session = connected.session;
    const auth = { Cookie: cookie, Authorization: `Bearer ${session.token}`, "X-Clite-Mode": "team" };
    const upload = (name: string, override = {}) => fetch(origin + "/api/workspace/upload?name=" + encodeURIComponent(name), {
      method: "POST", headers: { ...headers, ...auth, "Content-Type": "application/octet-stream", ...override }, body: "test evidence"
    });
    expect((await upload("notes.txt")).status).toBe(200);
    expect((await upload("notes.txt")).status).toBe(409);
    expect((await upload("../escape")).status).toBe(400);
    expect((await upload("bad.txt", { Authorization: "Bearer invalid" })).status).toBe(401);
    expect((await upload("bad.txt", { Cookie: "" })).status).toBe(401);
    ws.close();
    await once(ws, "close");
    connected = await connect(session.token);
    ws = connected.socket;
    expect(connected.session.id).toBe(session.id);
    expect(connected.session.resumed).toBe(true);
    const exported = await fetch(origin + "/api/workspace/export", { headers: auth });
    expect(exported.status).toBe(200);
    const bytes = new Uint8Array(await exported.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    ws.send(JSON.stringify({ type: "end" }));
    await once(ws, "close");
    expect((await fetch(origin + "/api/workspace/export", { headers: auth })).status).toBe(401);
  } finally {
    ws?.terminate();
    await runtime.close();
    await fs.rm(config.baseDir, { recursive: true, force: true });
  }
}, 20_000);
