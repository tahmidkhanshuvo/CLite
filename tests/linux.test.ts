import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createApplication } from "../server";
import { loadConfig } from "../lib/config";

test.skipIf(process.platform !== "linux" || !existsSync("/opt/ctf-python"))("native Linux team and demo PTYs", async () => {
  const config = loadConfig({ TEAM_KEY: "native-linux-test-secret" });
  config.baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "clite-linux-"));
  const runtime = createApplication({ config, quest: {
    entries: [], homeFiles: { "fixture.txt": Buffer.from("TkFUSVZFX0RFTU9fT0s=").toString("base64") },
    webFiles: {}, injections: {}, headers: {}
  } });
  await new Promise<void>(resolve => runtime.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(runtime.server.address() as {port: number}).port}`;
  const sockets: WebSocket[] = [];
  try {
    for (const mode of ["team", "demo"] as const) {
      const page = mode === "team" ? await fetch(origin + "/api/team/login", {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ key: config.teamKey })
      }) : await fetch(origin + "/demo");
      const cookie = page.headers.get("set-cookie")!.split(";")[0];
      const ws = new WebSocket(origin.replace("http", "ws") + `/ws/${mode}`, { headers: { Origin: origin, Cookie: cookie } });
      sockets.push(ws);
      let output = "";
      let ready: () => void;
      const sessionReady = new Promise<void>(resolve => { ready = resolve; });
      ws.on("message", raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === "session") ready();
        if (message.type === "output") output += message.data;
      });
      await once(ws, "open");
      ws.send(JSON.stringify({ type: "hello", cols: 100, rows: 30 }));
      await sessionReady;
      const command = mode === "team"
        ? "id -u; pip --version; python3 -c 'import os,sys,pwn,z3,Crypto,sympy,gmpy2; assert sys.prefix == os.path.join(os.environ[\"HOME\"],\".venv\"); assert \"TEAM_KEY\" not in os.environ; print(\"NATIVE_TEAM_OK\")'\r"
        : "cat fixture.txt | base64 -d\r";
      ws.send(JSON.stringify({ type: "input", data: command }));
      const marker = mode === "team" ? "NATIVE_TEAM_OK" : "NATIVE_DEMO_OK";
      const deadline = Date.now() + 15_000;
      // The input itself contains the marker. Wait for an independently emitted line.
      while (!output.includes("\r\n" + marker) && Date.now() < deadline) await Bun.sleep(50);
      expect(output).toContain("\r\n" + marker);
      if (mode === "team") {
        expect(output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").split("\n").some(line => line.trim() === String(config.uid))).toBe(true);
        expect(output).not.toContain("Traceback");
      }
      ws.send(JSON.stringify({ type: "end" }));
      await once(ws, "close");
    }
  } finally {
    sockets.forEach(ws => ws.terminate());
    await runtime.close();
    await fs.rm(config.baseDir, { recursive: true, force: true });
  }
}, 40_000);
